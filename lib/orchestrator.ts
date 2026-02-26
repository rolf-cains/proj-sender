/**
 * Transfer Orchestration Service
 * Coordinates Pay.tech → Bridge → Tempo for A2A cross-border transfers
 * 
 * Architecture:
 * 1. Get quotes from all 3 providers
 * 2. Create Tempo deposit address (where Bridge will send USDC)
 * 3. Create Bridge liquidation address (where Pay.tech sends fiat)
 * 4. Initiate Pay.tech transfer (fiat collection from sender)
 * 5. Monitor Bridge conversion (automatic when Pay.tech settles)
 * 6. Tempo auto-settles when Bridge delivers USDC
 * 
 * State management uses a simple in-memory store for demo.
 * Production should use PostgreSQL/Redis with proper ACID guarantees.
 */

import { v4 as uuidv4 } from 'uuid'
import { getPaytechQuote, initiatePaytechTransfer } from '../process/paytech'
import { getBridgeQuote, createBridgeLiquidationAddress, getTempoDepositAddress as getBridgeTempoAddress } from '../process/bridge'
import { getTempoQuote, getTempoDepositAddress, createTempoPayment } from '../process/tempo'
import type {
  Transfer,
  TransferQuote,
  TransferRequest,
  TransferStatus,
  TransferRoute,
  TimelineEvent,
  QuoteRequest,
  Currency,
  StableCoin,
  Network,
} from '../types/index';

// In-memory store — replace with DB in production
const transfers = new Map<string, Transfer>()

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || '50')

function selectNetwork(sourceCurrency: Currency, destCurrency: Currency): Network {
  // Use Base for EUR/USD corridors (fast, low fee), Polygon for emerging markets
  if (['USD', 'EUR', 'GBP'].includes(sourceCurrency)) return 'base'
  if (['MXN', 'BRL', 'NGN'].includes(sourceCurrency)) return 'polygon'
  return 'base'
}

function selectStablecoin(_sourceCurrency: Currency): StableCoin {
  return 'USDC' // Default to USDC for liquidity
}

/**
 * Step 1: Get a full transfer quote
 * Aggregates quotes from Pay.tech (leg 1), Bridge (leg 2), Tempo (leg 3)
 */
export async function getTransferQuote(request: QuoteRequest): Promise<TransferQuote> {
  const { sendAmount, sendCurrency, receiveCurrency, sendCountry, receiveCountry } = request
  const stablecoin = selectStablecoin(sendCurrency)
  const network = selectNetwork(sendCurrency, receiveCurrency)

  // Fetch quotes in parallel
  const [paytechQuote, bridgeQuote, tempoQuote] = await Promise.all([
    getPaytechQuote(sendAmount, sendCurrency, sendCountry),
    getBridgeQuote(sendAmount, sendCurrency, stablecoin, network),
    getTempoQuote(sendAmount * 1.0 /* rough USDC amount */, receiveCurrency, receiveCountry),
  ])

  // Calculate exact amounts through the chain
  const afterPaytech = sendAmount - paytechQuote.fee
  const usdcAmount = afterPaytech * bridgeQuote.exchangeRate - bridgeQuote.fee
  const receiveAmount = (usdcAmount - tempoQuote.fee) * tempoQuote.exchangeRate

  const platformFee = (sendAmount * PLATFORM_FEE_BPS) / 10000

  const totalFeeInSendCurrency =
    paytechQuote.fee +
    bridgeQuote.fee / bridgeQuote.exchangeRate + // convert USDC fee back to source
    tempoQuote.fee / bridgeQuote.exchangeRate +
    platformFee

  const effectiveRate = receiveAmount / sendAmount

  const totalTimeSeconds =
    paytechQuote.estimatedSettlementSeconds +
    bridgeQuote.estimatedSettlementSeconds +
    tempoQuote.estimatedSettlementSeconds

  const route: TransferRoute = {
    id: uuidv4(),
    sourceCurrency: sendCurrency,
    destinationCurrency: receiveCurrency,
    sourceCountry: sendCountry,
    destinationCountry: receiveCountry,
    leg1: {
      provider: 'paytech',
      method: 'bank_transfer',
      estimatedTime: paytechQuote.estimatedSettlementSeconds,
      fee: paytechQuote.fee,
    },
    leg2: {
      provider: 'bridge',
      stablecoin,
      network,
      estimatedTime: bridgeQuote.estimatedSettlementSeconds,
      fee: bridgeQuote.fee,
      fxRate: bridgeQuote.exchangeRate,
    },
    leg3: {
      provider: 'tempo',
      method: tempoQuote.paymentRail,
      estimatedTime: tempoQuote.estimatedSettlementSeconds,
      fee: tempoQuote.fee,
      fxRate: tempoQuote.exchangeRate,
    },
    totalFee: parseFloat(totalFeeInSendCurrency.toFixed(2)),
    effectiveRate: parseFloat(effectiveRate.toFixed(6)),
    estimatedTotalTime: totalTimeSeconds,
  }

  const quote: TransferQuote = {
    quoteId: uuidv4(),
    route,
    sendAmount,
    receiveAmount: parseFloat(receiveAmount.toFixed(2)),
    exchangeRate: parseFloat(effectiveRate.toFixed(6)),
    fees: {
      paytech: paytechQuote.fee,
      bridge: parseFloat((bridgeQuote.fee / bridgeQuote.exchangeRate).toFixed(2)),
      tempo: parseFloat((tempoQuote.fee / bridgeQuote.exchangeRate).toFixed(2)),
      platform: platformFee,
      total: parseFloat(totalFeeInSendCurrency.toFixed(2)),
    },
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  }

  return quote
}

function addEvent(transfer: Transfer, status: TransferStatus, message: string, metadata?: Record<string, unknown>): void {
  const event: TimelineEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    status,
    message,
    metadata,
  }
  transfer.timeline.push(event)
  transfer.status = status
  transfer.updatedAt = new Date().toISOString()
}

/**
 * Step 2: Create and initiate a transfer
 * This orchestrates the full A2A flow across all 3 providers
 */
export async function createTransfer(request: TransferRequest, quote: TransferQuote): Promise<Transfer> {
  const transferId = uuidv4()
  const { route } = quote

  const transfer: Transfer = {
    id: transferId,
    status: 'pending',
    quote,
    request,
    legs: {},
    timeline: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  addEvent(transfer, 'processing', 'Transfer initiated. Setting up payment infrastructure.')
  transfers.set(transferId, transfer)

  try {
    // ── Step 2a: Get Tempo deposit address (Leg 3 receiving end)
    addEvent(transfer, 'processing', 'Generating Tempo settlement address for USDC receipt...')
    const tempoAddress = await getTempoDepositAddress(transferId, route.leg2.network)

    // ── Step 2b: Create Bridge liquidation address (Leg 2)
    // This address receives fiat from Pay.tech and auto-converts to USDC → Tempo
    addEvent(transfer, 'processing', 'Creating Bridge stablecoin routing address...')
    const bridgeLiqAddress = await createBridgeLiquidationAddress({
      transferId,
      sourceCurrency: route.sourceCurrency,
      stablecoin: route.leg2.stablecoin,
      network: route.leg2.network,
      tempoDepositAddress: tempoAddress.address,
      destinationCurrency: route.destinationCurrency,
      webhookUrl: `${APP_URL}/api/webhooks/bridge?transferId=${transferId}`,
    })

    transfer.legs.leg2 = {
      provider: 'bridge',
      externalId: bridgeLiqAddress.id,
      status: 'pending',
    }

    // ── Step 2c: Initiate Pay.tech fiat collection (Leg 1)
    addEvent(transfer, 'processing', 'Initiating fiat collection via Pay.tech...')

    // For demo: we simulate a bank account
    const senderAccount = request.sender.bankAccount || {
      accountName: request.sender.name,
      accountNumber: '000000000',
      routingNumber: '021000021',
      bankName: 'Demo Bank',
      bankCountry: route.sourceCountry,
    }

    const paytechTransfer = await initiatePaytechTransfer({
      transferId,
      amount: quote.sendAmount,
      currency: route.sourceCurrency,
      senderAccount,
      bridgeLiquidationAddress: bridgeLiqAddress.address,
      webhookUrl: `${APP_URL}/api/webhooks/paytech?transferId=${transferId}`,
    })

    transfer.legs.leg1 = {
      provider: 'paytech',
      externalId: paytechTransfer.transferId,
      status: 'processing',
      startedAt: new Date().toISOString(),
    }

    addEvent(transfer, 'processing', `Pay.tech collecting ${quote.sendAmount} ${route.sourceCurrency} from sender bank.`, {
      paytechTransferId: paytechTransfer.transferId,
    })

    // ── Step 2d: Pre-create Tempo payment (will be triggered by webhook)
    // Tempo payment will be executed when Bridge webhook fires
    transfer.legs.leg3 = {
      provider: 'tempo',
      externalId: `tempo_pending_${transferId}`,
      status: 'pending',
    }

    transfers.set(transferId, transfer)
    return transfer

  } catch (error) {
    addEvent(transfer, 'failed', `Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    transfers.set(transferId, transfer)
    throw error
  }
}

/**
 * Handle Pay.tech webhook (Leg 1 completed)
 * Called when Pay.tech has collected fiat from sender
 */
export async function handlePaytechWebhook(transferId: string, paytechEvent: {
  status: string
  transferId: string
}): Promise<void> {
  const transfer = transfers.get(transferId)
  if (!transfer) throw new Error(`Transfer ${transferId} not found`)

  if (paytechEvent.status === 'settled') {
    if (transfer.legs.leg1) {
      transfer.legs.leg1.status = 'completed'
      transfer.legs.leg1.completedAt = new Date().toISOString()
    }
    addEvent(transfer, 'bridging',
      `✓ Fiat received by Pay.tech. Bridge now converting ${transfer.quote.route.sourceCurrency} → ${transfer.quote.route.leg2.stablecoin} on ${transfer.quote.route.leg2.network}...`)
  } else if (paytechEvent.status === 'failed') {
    if (transfer.legs.leg1) transfer.legs.leg1.status = 'failed'
    addEvent(transfer, 'failed', 'Pay.tech fiat collection failed. Transfer cancelled.')
  }

  transfers.set(transferId, transfer)
}

/**
 * Handle Bridge webhook (Leg 2 completed)
 * Called when Bridge has converted fiat → USDC and sent to Tempo address
 */
export async function handleBridgeWebhook(transferId: string, bridgeEvent: {
  state: string
  transferId: string
  txHash?: string
  amount: string
}): Promise<void> {
  const transfer = transfers.get(transferId)
  if (!transfer) throw new Error(`Transfer ${transferId} not found`)

  if (bridgeEvent.state === 'payment_processed') {
    if (transfer.legs.leg2) {
      transfer.legs.leg2.status = 'completed'
      transfer.legs.leg2.completedAt = new Date().toISOString()
      transfer.legs.leg2.txHash = bridgeEvent.txHash
    }

    addEvent(transfer, 'converting',
      `✓ Bridge converted to ${bridgeEvent.amount} USDC on ${transfer.quote.route.leg2.network}. Tx: ${bridgeEvent.txHash?.slice(0, 12)}...`,
      { txHash: bridgeEvent.txHash })

    // Now trigger Tempo final settlement (Leg 3)
    try {
      addEvent(transfer, 'settling',
        `Tempo initiating ${transfer.quote.route.destinationCurrency} bank settlement for recipient...`)

      const tempoQuote = await getTempoQuote(
        parseFloat(bridgeEvent.amount),
        transfer.quote.route.destinationCurrency,
        transfer.quote.route.destinationCountry,
      )

      const recipientAccount = transfer.request.recipient.bankAccount || transfer.request.recipient.mobileWallet!

      const tempoPayment = await createTempoPayment({
        transferId,
        tempoQuoteId: tempoQuote.quoteId,
        recipientAccount,
        recipientName: transfer.request.recipient.name,
        reference: transfer.request.reference || `Remittance from ${transfer.request.sender.name}`,
        webhookUrl: `${APP_URL}/api/webhooks/tempo?transferId=${transferId}`,
      })

      if (transfer.legs.leg3) {
        transfer.legs.leg3.externalId = tempoPayment.id
        transfer.legs.leg3.status = 'processing'
        transfer.legs.leg3.startedAt = new Date().toISOString()
      }
    } catch (error) {
      addEvent(transfer, 'failed', `Tempo settlement failed: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
  }

  transfers.set(transferId, transfer)
}

/**
 * Handle Tempo webhook (Leg 3 completed)
 * Called when Tempo has settled fiat to recipient's bank
 */
export async function handleTempoWebhook(transferId: string, tempoEvent: {
  status: string
  paymentId: string
}): Promise<void> {
  const transfer = transfers.get(transferId)
  if (!transfer) throw new Error(`Transfer ${transferId} not found`)

  if (tempoEvent.status === 'settled' || tempoEvent.status === 'completed') {
    if (transfer.legs.leg3) {
      transfer.legs.leg3.status = 'completed'
      transfer.legs.leg3.completedAt = new Date().toISOString()
    }
    transfer.completedAt = new Date().toISOString()
    addEvent(transfer, 'completed',
      `✓ Transfer complete! ${transfer.quote.receiveAmount} ${transfer.quote.route.destinationCurrency} delivered to ${transfer.request.recipient.name}.`)
  } else if (tempoEvent.status === 'failed' || tempoEvent.status === 'rejected') {
    if (transfer.legs.leg3) transfer.legs.leg3.status = 'failed'
    addEvent(transfer, 'failed', 'Tempo bank settlement failed. Support team has been notified.')
  }

  transfers.set(transferId, transfer)
}

/**
 * Get transfer by ID
 */
export function getTransfer(transferId: string): Transfer | undefined {
  return transfers.get(transferId)
}

/**
 * Get all transfers (for demo/admin)
 */
export function getAllTransfers(): Transfer[] {
  return Array.from(transfers.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export type { TransferQuote, Transfer }

