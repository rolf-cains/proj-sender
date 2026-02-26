'use client'

import { useState } from 'react';
import { createRemittanceSession } from '@/actions/paytech';
import { CashierModal } from '@/components/CashierModal';
import { StatusTracker } from '@/components/StatusTracker';
import { Card, Button, Input } from '@/components/ui'; // Shadcn components

export default function RemitPage() {
  const [amount, setAmount] = useState(100);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);

  const handleStartRemittance = async () => {
    const { token, transferId } = await createRemittanceSession({ amount });
    setSessionToken(token);
    setActiveTransferId(transferId);
  };

  return (
    <main className="max-w-xl mx-auto py-12 px-6">
      {!activeTransferId ? (
        <Card className="p-6 space-y-6 border-2 border-indigo-50 shadow-xl">
          <h2 className="text-2xl font-bold">Send to Philippines</h2>
          <div className="space-y-2">
            <label className="text-sm text-slate-500">Amount (GBP)</label>
            <Input 
              type="number" 
              value={amount} 
              onChange={(e) => setAmount(Number(e.target.value))}
              className="text-2xl h-16 font-mono"
            />
          </div>
          <Button 
            onClick={handleStartRemittance}
            className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700"
          >
            Review Transfer
          </Button>
        </Card>
      ) : (
        <StatusTracker transferId={activeTransferId} />
      )}

      {sessionToken && (
        <CashierModal 
          token={sessionToken} 
          onClose={() => setSessionToken(null)} 
        />
      )}
    </main>
  );
}
