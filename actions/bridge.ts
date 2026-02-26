const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// 2026 Sandbox Configuration
const BRIDGE_API_KEY = 'sk-test_your_key_here';
const BRIDGE_BASE_URL = 'https://api.sandbox.bridge.xyz/v0';
const TEMPO_RPC_URL = 'https://rpc.moderato.tempo.xyz';

/**
 * Step 1: Initialize the Remittance with Pay.tech Orchestration
 * In a real app, Pay.tech provides the 'Cashier' UI to the user.
 */
async function initiateGbpToPhpTransfer(senderId, recipientDetails) {
  try {
    console.log("🚀 Initializing GBP -> PHP Corridor via Tempo...");

    // 1. Create the Transfer Payload
    const transferPayload = {
      on_behalf_of: senderId, // The UK Sender ID in Bridge
      developer_fee: "0.25",  // Your platform's cut in GBP
      source: {
        payment_rail: "faster_payments", // UK A2A Rail
        currency: "gbp",
        // In sandbox, use 'ext_uk_bank_mock' to simulate a successful bank pull
        external_account_id: "ext_uk_bank_mock" 
      },
      destination: {
        payment_rail: "instapay", // Philippine Real-time Rail
        currency: "php",
        amount: "15000.00", // Targeting exactly 15k PHP
        external_account_id: recipientDetails.gcash_id,
        destination_reference: "Family Remittance"
      },
      settlement_config: {
        preferred_rail: "tempo", // Use the Tempo Blockchain for <1s settlement
        stablecoin: "usdc"       // Convert GBP to USDC for the hop
      }
    };

    // 2. Execute via Bridge API
    const response = await axios.post(`${BRIDGE_BASE_URL}/transfers`, transferPayload, {
      headers: {
        'Api-Key': BRIDGE_API_KEY,
        'Idempotency-Key': uuidv4(),
        'Content-Type': 'application/json'
      }
    });

    const transfer = response.data;
    console.log(`✅ Transfer Created! ID: ${transfer.id}`);
    console.log(`🔗 Tracking on Tempo: https://explorer.moderato.tempo.xyz/tx/${transfer.settlement_tx_hash}`);

    return transfer;

  } catch (error) {
    console.error("❌ Remittance Failed:", error.response?.data || error.message);
  }
}

// Mock Data for Sandbox Run
const mockRecipient = { gcash_id: "ext_ph_gcash_998877" };
const mockSenderId = "cust_uk_user_12345";

initiateGbpToPhpTransfer(mockSenderId, mockRecipient);
