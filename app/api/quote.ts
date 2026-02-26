import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getTransferQuote } from '@/lib/orchestrator'

const QuoteSchema = z.object({
  sendAmount: z.number().positive().max(100000),
  sendCurrency: z.enum(['USD', 'EUR', 'GBP', 'MXN', 'BRL', 'NGN', 'KES', 'INR', 'PHP']),
  receiveCurrency: z.enum(['USD', 'EUR', 'GBP', 'MXN', 'BRL', 'NGN', 'KES', 'INR', 'PHP']),
  sendCountry: z.string().length(2),
  receiveCountry: z.string().length(2),
  paymentMethod: z.enum(['bank_transfer', 'card', 'mobile_money']).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = QuoteSchema.parse(body)

    const quote = await getTransferQuote(validated)

    return NextResponse.json({
      success: true,
      data: quote,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors } },
        { status: 400 }
      )
    }

    console.error('Quote error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'QUOTE_ERROR', message: 'Failed to generate quote' } },
      { status: 500 }
    )
  }
}

