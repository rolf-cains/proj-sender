import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createTransfer, getAllTransfers } from '@/lib/orchestrator'
import type { TransferQuote, TransferRequest } from '@/types'

const BankAccountSchema = z.object({
  accountName: z.string(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  iban: z.string().optional(),
  swiftCode: z.string().optional(),
  sortCode: z.string().optional(),
  bankName: z.string(),
  bankCountry: z.string(),
})

const TransferRequestSchema = z.object({
  quoteId: z.string(),
  quote: z.any(), // Full quote object
  sender: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    bankAccount: BankAccountSchema.optional(),
  }),
  recipient: z.object({
    name: z.string().min(2),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    bankAccount: BankAccountSchema.optional(),
    mobileWallet: z.object({
      provider: z.string(),
      phoneNumber: z.string(),
      country: z.string(),
    }).optional(),
  }),
  purpose: z.enum(['family_support', 'business_payment', 'education', 'medical', 'investment', 'other']),
  reference: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { quote, ...requestData } = body

    if (!quote) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_QUOTE', message: 'Quote object is required' } },
        { status: 400 }
      )
    }

    const validated = TransferRequestSchema.parse({ quote, ...requestData })
    const transferRequest: TransferRequest = {
      quoteId: validated.quoteId,
      sender: validated.sender,
      recipient: validated.recipient,
      purpose: validated.purpose,
      reference: validated.reference,
    }

    const transfer = await createTransfer(transferRequest, quote as TransferQuote)

    return NextResponse.json({
      success: true,
      data: transfer,
    }, { status: 201 })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors } },
        { status: 400 }
      )
    }

    console.error('Transfer creation error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'TRANSFER_ERROR', message: 'Failed to create transfer' } },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const transfers = getAllTransfers()
    return NextResponse.json({
      success: true,
      data: transfers,
    })
  } catch (error) {
    console.error('Get transfers error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch transfers' } },
      { status: 500 }
    )
  }
}
