'use server'

import { v4 as uuidv4 } from 'uuid';

export async function createRemittanceSession(formData: { amount: number }) {
  // 1. Validate User Auth (2026 Clerk/Auth.js standard)
  // const session = await auth(); 

  // 2. Request Pay.tech Session
  const response = await fetch('https://api.pay.tech/v1/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PAYTECH_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: formData.amount,
      currency: 'GBP',
      corridor: 'GBP-PHP',
      idempotency_key: uuidv4(),
      settlement_target: "tempo_stablecoin_pool"
    })
  });

  const data = await response.json();
  return { token: data.token, transferId: data.bridge_reference };
}
