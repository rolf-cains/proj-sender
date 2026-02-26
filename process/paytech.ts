/**
 * Pay.tech Integration
 * Handles the first leg: fiat collection from sender
 * Pay.tech accepts bank transfers, cards, and mobile money
 * then forwards to a Bridge liquidation address
 */

import axios from 'axios'
import type {
  PaytechTransferRequest,
  PaytechTransferResponse,
  BankAccount,
  Currency,
} from '../types/index';

const PAYTECH_API_URL = process.env.PAYTECH_API_URL || 'https://api.pay.tech/v1'
const PAYTECH_API_KEY = process.env.PAYTECH_API_KEY || ''
const PAYTECH_MERCHANT_ID = process.env.PAYTECH_MERCHANT_ID || ''

const paytechClient = axios.create({
  baseURL: PAYTECH_API_URL,
  headers: {
    'Authorization': `Bearer ${PAYTECH_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Merchant-Id': PAYTECH_MERCHANT_ID,
  },
  timeout: 30000,
})

export interface PaytechFeeQuote {
  fee: number
  feeCurrency: Currency
  estimatedSettlementSeconds: number
  paymentMethods: Array<{
    type: 'bank_transfer' | 'card' | 'mobile_money'
    available: boolean
    additionalFee: number
  }>
}

/**
 * Get fee quote from Pay.tech for given amount/currency/country
 */
export async function getPaytechQuote(
  amount: number,
  currency: Currency,
  sourceCountry: string,
): Promise<PaytechFeeQuote> {
  // In production, call: GET /v1/quotes?amount=&currency=&country=
  // Simulated response for demo:
  const baseFeePercent = 0.005 // 0.5%
  const countryMultipliers: Record<string, number> = {
    US: 1.0, GB: 1.1, EU: 1.0, MX: 1.3, NG: 1.8, KE: 1.6, PH: 1.4, BR: 1.5, IN: 1.2,
  }
  const mult = countryMultipliers[sourceCountry] ?? 1.5
  const fee = Math.max(2.5, amount * baseFeePercent * mult)

  return {
    fee: parseFloat(fee.toFixed(2)),
    feeCurrency: currency,
    estimatedSettlementSeconds: 60 * 15, // 15 min
    paymentMethods: [
      { type: 'bank_transfer', available: true, additionalFee: 0 },
      { type: 'card', available: true, additionalFee: amount * 0.015 },
      { type: 'mobile_money', available: ['NG', 'KE', 'GH'].includes(sourceCountry), additionalFee: 0.5 },
    ],
  }
}

/**
 * Initiate a Pay.tech transfer (Leg 1)
 * Collects fiat from sender, sends to Bridge liquidation address
 */
export async function initiatePaytechTransfer(params: {
  transferId: string
  amount: number
  currency: Currency
  senderAccount: BankAccount | { type: 'card'; token: string }
  bridgeLiquidationAddress: string
  webhookUrl: string
}): Promise<PaytechTransferResponse> {
  const { transferId, amount, currency, senderAccount, bridgeLiquidationAddress, webhookUrl } = params

  // Build the request payload for Pay.tech
  const payload: PaytechTransferRequest = {
    merchantId: PAYTECH_MERCHANT_ID,
    amount,
    currency,
    sourceAccount: 'accountNumber' in senderAccount
      ? {
          type: 'bank',
          details: {
            accountName: senderAccount.accountName,
            accountNumber: senderAccount.accountNumber || '',
            routingNumber: senderAccount.routingNumber || '',
            iban: senderAccount.iban || '',
            swiftCode: senderAccount.swiftCode || '',
            bankName: senderAccount.bankName,
          },
        }
      : {
          type: 'card',
          details: { token: senderAccount.token },
        },
    destinationWallet: bridgeLiquidationAddress,
    metadata: {
      transferId,
      provider: 'paytech',
      leg: '1',
    },
  }

  try {
    // POST /v1/transfers
    const response = await paytechClient.post<PaytechTransferResponse>('/transfers', {
      ...payload,
      webhookUrl,
      idempotencyKey: transferId,
    })
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Pay.tech error: ${error.response.data?.message || error.message}`)
    }
    throw error
  }
}

/**
 * Get status of a Pay.tech transfer
 */
export async function getPaytechTransferStatus(paytechTransferId: string): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed'
  amount: number
  currency: string
  errorMessage?: string
}> {
  try {
    const response = await paytechClient.get(`/transfers/${paytechTransferId}`)
    const data = response.data

    const statusMap: Record<string, 'pending' | 'processing' | 'completed' | 'failed'> = {
      created: 'pending',
      submitted: 'processing',
      processing: 'processing',
      settled: 'completed',
      failed: 'failed',
      reversed: 'failed',
    }

    return {
      status: statusMap[data.status] || 'processing',
      amount: data.amount,
      currency: data.currency,
      errorMessage: data.errorMessage,
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Pay.tech status error: ${error.response.data?.message || error.message}`)
    }
    throw error
  }
}

/**
 * Verify a Pay.tech webhook signature
 */
export function verifyPaytechWebhook(payload: string, signature: string): boolean {
  // In production: verify HMAC-SHA256 signature
  // crypto.createHmac('sha256', PAYTECH_WEBHOOK_SECRET).update(payload).digest('hex') === signature
  return signature.length > 0
}
