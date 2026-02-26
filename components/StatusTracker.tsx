'use client'

import { useEffect, useState } from 'react';
import { useSocket } from '@/hooks/use-socket'; // Custom hook for Socket.io
import { CheckCircle, Loader2, Globe } from 'lucide-react';

export function StatusTracker({ transferId }: { transferId: string }) {
  const [step, setStep] = useState(1); // 1: Bank Pull, 2: Tempo L1, 3: PHP Payout
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    socket.emit('track_transfer', transferId);
    
    socket.on('PAYMENT_UPDATE', (data) => {
      if (data.status === 'funds_received') setStep(2);
      if (data.status === 'payment_processed') setStep(3);
    });
  }, [socket, transferId]);

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
      <div className="flex justify-between items-center mb-10">
        <h3 className="font-bold text-slate-800">Live Transaction</h3>
        <span className="text-xs font-mono text-indigo-500 bg-indigo-50 px-2 py-1 rounded">
          TEMPO_TX: {transferId.slice(0, 8)}...
        </span>
      </div>

      <div className="relative space-y-8">
        <Step icon={step >= 1 ? <CheckCircle className="text-green-500"/> : <Loader2 className="animate-spin"/>} 
              label="Authorizing UK Bank (A2A)" active={step === 1} />
        <Step icon={step >= 2 ? <CheckCircle className="text-green-500"/> : <Loader2 className={step === 2 ? "animate-spin" : "text-slate-200"}/>} 
              label="Settling on Tempo Blockchain" active={step === 2} />
        <Step icon={step >= 3 ? <CheckCircle className="text-green-500"/> : <Globe className={step === 3 ? "animate-spin" : "text-slate-200"}/>} 
              label="Payout to GCash (InstaPay)" active={step === 3} />
      </div>
    </div>
  );
}

function Step({ icon, label, active }: { icon: any, label: string, active: boolean }) {
  return (
    <div className={`flex items-center gap-4 transition-opacity ${active ? 'opacity-100' : 'opacity-40'}`}>
      <div className="w-6 h-6">{icon}</div>
      <p className="font-medium text-slate-700">{label}</p>
    </div>
  );
}
