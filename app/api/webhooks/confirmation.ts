const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

// Your Webhook Secret from the Bridge Dashboard
const BRIDGE_WEBHOOK_SECRET = process.env.BRIDGE_WEBHOOK_SECRET;

app.post('/webhooks/bridge', (req, res) => {
    const signature = req.headers['bridge-signature'];
    const payload = JSON.stringify(req.body);

    // 1. 🛡️ Security: Verify the signature to ensure it's actually from Bridge
    const expectedSignature = crypto
        .createHmac('sha256', BRIDGE_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(401).send('Invalid Signature');
    }

    // 2. 🧩 Handle the Event
    const { event_type, event_object_status, event_object_id } = req.body;

    console.log(`Received Event: ${event_type} for Transfer: ${event_object_id}`);

    switch (event_object_status) {
        case 'funds_received':
            console.log("💷 GBP Received from UK Bank. Moving to Tempo...");
            break;
            
        case 'payment_processed':
            console.log("🇵🇭 Success! PHP has been credited to the recipient wallet.");
            // Here you would trigger a Push Notification or Email to your user
            break;

        case 'error':
            console.error("⚠️ Transfer failed. Check compliance or liquidity.");
            break;
    }

    // 3. 🫡 Acknowledge receipt (Bridge expects a 200 OK)
    res.status(200).send('Webhook Received');
});

app.listen(3000, () => console.log('Webhook listener running on port 3000'));