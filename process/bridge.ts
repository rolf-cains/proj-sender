/**
 * Bridge Integration
 * Handles the second leg: fiat → stablecoin → stablecoin routing
 * Bridge provides programmable stablecoin infrastructure
 * 
 * Flow:
 * 1. Create a liquidation address (where Pay.tech sends funds)
 * 2. Bridge auto-converts to USDC/USDT on specified chain
 * 3. Bridge moves stablecoins to Tempo's receiving address
 * 
 * Docs: https://apidocs.bridge.xyz
 */

import axios from 'axios'
import type {
  BridgeLiquidationAddress,
  BridgeTransfer,
  Currency,
  StableCoin,
  Network,
} from '../types/index'

const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'https://api.bridge.xyz/v0'
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || ''

const bridgeClient = axios.create({
  baseURL: BRIDGE_API_URL,
  headers: {
    'Api-Key': BRIDGE_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

export interface BridgeFxQuote {
  sourceAmount: number
  sourceCurrency: Currency
  destinationAmount: number
  destinationCurrency: StableCoin
  exchangeRate: number
  fee: number
  network: Network
  estimatedSettlementSeconds: number
}

/**
 * Get Bridge FX quote: fiat → stablecoin
 */
export async function getBridgeQuote(
  amount: number,
  sourceCurrency: Currency,
  destinationCurrency: StableCoin = 'USDC',
  network: Network = 'base',
): Promise<BridgeFxQuote> {
  // Real call: GET /v0/exchange_rates?source_currency=&dest_currency=&amount=
  // Simulating realistic rates:
  const usdRates: Record<string, number> = {
    USD: 1.0,
    EUR: 1.085,
    GBP: 1.27,
    MXN: 0.059,
    BRL: 0.195,
    NGN: 0.00065,
    KES: 0.0077,
    INR: 0.012,
    PHP: 0.0172,
  }

  const rate = usdRates[sourceCurrency] ?? 1.0
  const usdcAmount = amount * rate
  const bridgeFeePercent = 0.001 // 0.1%
  const fee = usdcAmount * bridgeFeePercent

  return {
    sourceAmount: amount,
    sourceCurrency,
    destinationAmount: parseFloat((usdcAmount - fee).toFixed(6)),
    destinationCurrency,
    exchangeRate: rate,
    fee: parseFloat(fee.toFixed(4)),
    network,
    estimatedSettlementSeconds: 30, // ~30s on Base
  }
}

/**
 * Create a Bridge liquidation address
 * This is the "magic" address where Pay.tech deposits fiat
 * Bridge auto-converts and routes to Tempo
 */
export async function createBridgeLiquidationAddress(params: {
  transferId: string
  sourceCurrency: Currency
  stablecoin: StableCoin
  network: Network
  tempoDepositAddress: string  // Where Bridge sends USDC for Tempo to pick up
  destinationCurrency: Currency
  webhookUrl: string
}): Promise<BridgeLiquidationAddress> {
  const {
    transferId,
    sourceCurrency,
    stablecoin,
    network,
    tempoDepositAddress,
    destinationCurrency,
    webhookUrl,
  } = params

  try {
    // POST /v0/customers/{customerId}/liquidation_addresses
    const response = await bridgeClient.post<BridgeLiquidationAddress>(
      `/customers/${process.env.BRIDGE_CUSTOMER_ID}/liquidation_addresses`,
      {
        chain: network,
        currency: stablecoin.toLowerCase(),
        external_account_id: transferId,
        destination_payment_rail: 'sepa', // Tempo will handle the final leg
        destination_currency: destinationCurrency.toLowerCase(),
        destination_address: tempoDepositAddress,
        conversion_source_currency: sourceCurrency.toLowerCase(),
        webhook_url: webhookUrl,
        metadata: {
          transferId,
          leg: '2',
        },
      }
    )
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Bridge error creating liquidation address: ${JSON.stringify(error.response.data)}`)
    }
    throw error
  }
}

/**
 * Get the status of a Bridge transfer
 */
export async function getBridgeTransferStatus(bridgeTransferId: string): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed'
  amount: string
  currency: string
  txHash?: string
  errorMessage?: string
}> {
  try {
    const response = await bridgeClient.get<BridgeTransfer>(`/transfers/${bridgeTransferId}`)
    const data = response.data

    const stateMap: Record<string, 'pending' | 'processing' | 'completed' | 'failed'> = {
      awaiting_funds: 'pending',
      funds_received: 'processing',
      payment_submitted: 'processing',
      payment_processed: 'completed',
      error: 'failed',
      refunded: 'failed',
    }

    return {
      status: stateMap[data.state] || 'processing',
      amount: data.amount,
      currency: data.currency,
      txHash: data.sourceTxHash,
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Bridge status error: ${error.response.data?.message || error.message}`)
    }
    throw error
  }
}

/**
 * List supported corridors from Bridge
 */
export async function getBridgeSupportedCorridors(): Promise<Array<{
  sourceCurrency: string
  destinationCurrency: string
  networks: string[]
}>> {
  try {
    const response = await bridgeClient.get('/supported_currencies')
    return response.data.corridors
  } catch {
    // Fallback supported corridors
    return [
      { sourceCurrency: 'USD', destinationCurrency: 'USDC', networks: ['base', 'ethereum', 'polygon', 'solana'] },
      { sourceCurrency: 'EUR', destinationCurrency: 'USDC', networks: ['base', 'polygon'] },
      { sourceCurrency: 'GBP', destinationCurrency: 'USDC', networks: ['base', 'ethereum'] },
      { sourceCurrency: 'MXN', destinationCurrency: 'USDC', networks: ['polygon'] },
    ]
  }
}

/**
 * Create a KYC link for customer verification (Bridge KYC)
 */
export async function createBridgeKYCLink(customerId: string): Promise<string> {
  const response = await bridgeClient.post('/kyc_links', {
    full_name: customerId,
    email: `${customerId}@remit.app`,
    type: 'individual',
  })
  return response.data.kyc_link
}

