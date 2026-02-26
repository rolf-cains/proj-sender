// ============================================================
// Core Domain Types for Cross-Border A2A Remittance
// ============================================================

export type Currency = 'USD' | 'EUR' | 'GBP' | 'MXN' | 'BRL' | 'NGN' | 'KES' | 'INR' | 'PHP' | 'USDC' | 'USDT'
export type StableCoin = 'USDC' | 'USDT' | 'PHPC'
export type Network = 'ethereum' | 'polygon' | 'solana' | 'base' | 'arbitrum'

export type TransferStatus =
  | 'pending'
  | 'kyc_required'
  | 'processing'
  | 'bridging'
  | 'converting'
  | 'settling'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type Provider = 'paytech' | 'bridge' | 'tempo'

export interface TransferRoute {
  id: string
  sourceCurrency: Currency
  destinationCurrency: Currency
  sourceCountry: string
  destinationCountry: string
  // The 3 legs of the A2A flow
  leg1: {
    provider: 'paytech'
    method: 'bank_transfer' | 'card' | 'mobile_money'
    estimatedTime: number // seconds
    fee: number
  }
  leg2: {
    provider: 'bridge'
    stablecoin: StableCoin
    network: Network
    estimatedTime: number
    fee: number
    fxRate: number // source -> stablecoin
  }
  leg3: {
    provider: 'tempo'
    method: 'sepa' | 'swift' | 'local_rails'
    estimatedTime: number
    fee: number
    fxRate: number // stablecoin -> destination
  }
  totalFee: number
  effectiveRate: number
  estimatedTotalTime: number
}

export interface TransferQuote {
  quoteId: string
  route: TransferRoute
  sendAmount: number
  receiveAmount: number
  exchangeRate: number
  fees: {
    paytech: number
    bridge: number
    tempo: number
    platform: number
    total: number
  }
  expiresAt: string
  createdAt: string
}

export interface TransferRequest {
  quoteId: string
  sender: {
    name: string
    email: string
    phone?: string
    address?: Address
    bankAccount?: BankAccount
    walletAddress?: string
  }
  recipient: {
    name: string
    email?: string
    phone?: string
    bankAccount?: BankAccount
    mobileWallet?: MobileWallet
  }
  purpose: TransferPurpose
  reference?: string
}

export interface Transfer {
  id: string
  status: TransferStatus
  quote: TransferQuote
  request: TransferRequest
  legs: {
    leg1?: LegStatus
    leg2?: LegStatus
    leg3?: LegStatus
  }
  timeline: TimelineEvent[]
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface LegStatus {
  provider: Provider
  externalId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  txHash?: string
  errorMessage?: string
}

export interface TimelineEvent {
  id: string
  timestamp: string
  status: TransferStatus
  message: string
  provider?: Provider
  metadata?: Record<string, unknown>
}

export interface BankAccount {
  accountName: string
  accountNumber?: string
  routingNumber?: string  // US
  iban?: string           // EU
  swiftCode?: string      // International
  sortCode?: string       // UK
  bankName: string
  bankCountry: string
}

export interface MobileWallet {
  provider: string
  phoneNumber: string
  country: string
}

export interface Address {
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string
}

export type TransferPurpose =
  | 'family_support'
  | 'business_payment'
  | 'education'
  | 'medical'
  | 'investment'
  | 'other'

// ============================================================
// Provider-specific types
// ============================================================

// Pay.tech
export interface PaytechTransferRequest {
  merchantId: string
  amount: number
  currency: string
  sourceAccount: {
    type: 'bank' | 'card'
    details: Record<string, string>
  }
  destinationWallet: string // Bridge wallet address
  metadata: Record<string, string>
}

export interface PaytechTransferResponse {
  transferId: string
  status: string
  amount: number
  currency: string
  fee: number
  estimatedSettlement: string
  webhookUrl?: string
}

// Bridge
export interface BridgeLiquidationAddress {
  id: string
  chain: string
  currency: string
  address: string
  externalAccountId: string
  destinationPaymentRail: string
  destinationCurrency: string
  destinationAddress: string
}

export interface BridgeTransfer {
  id: string
  state: string
  amount: string
  currency: string
  sourceChain: string
  sourceTxHash?: string
  destinationAccountId: string
  estimatedArrival: string
}

// Tempo
export interface TempoPayment {
  id: string
  status: string
  amount: number
  currency: string
  recipient: {
    name: string
    iban?: string
    accountNumber?: string
    bankCode?: string
  }
  reference: string
  estimatedArrival: string
  fee: number
}

// ============================================================
// API Response types
// ============================================================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export interface QuoteRequest {
  sendAmount: number
  sendCurrency: Currency
  receiveCurrency: Currency
  sendCountry: string
  receiveCountry: string
  paymentMethod?: 'bank_transfer' | 'card' | 'mobile_money'
}
