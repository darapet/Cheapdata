import { useState } from "react";
import { useGetProfile, getGetProfileQueryKey } from "@/lib/supabase-hooks";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/utils";
import { Loader2, Wallet, CheckCircle2 } from "lucide-react";

declare global {
  interface Window { PaystackPop: any; FlutterwaveCheckout: any; }
}

function loadScript(src: string, readyCheck: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (readyCheck()) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    document.body.appendChild(script);
  });
}

export default function FundWallet() {
  const [amount, setAmount] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const { data: profile, refetch: refetchProfile } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey() }
  });

  const fee = 50;
  const totalAmount = Number(amount) + fee;

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!amount || numAmount < 100) {
      toast({ title: "Error", description: "Minimum funding amount is N100", variant: "destructive" });
      return;
    }
    setIsPaying(true);
    try {
      const { data: settings } = await supabase
        .from('system_settings')
        .select('active_payment_gateway, paystack_public_key, flutterwave_public_key')
        .maybeSingle();

      const gateway = settings?.active_payment_gateway || 'paystack';
      const publicKey = gateway === 'flutterwave' ? settings?.flutterwave_public_key : settings?.paystack_public_key;

      if (!publicKey) {
        toast({ title: "Payment gateway not configured", description: "Please contact the admin to set up payment keys.", variant: "destructive" });
        setIsPaying(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const reference = `CDH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      await supabase.from('wallet_fundings').insert({
        user_id: user.id,
        type: 'funding',
        description: `Wallet Funding N${numAmount.toLocaleString()}`,
        amount: numAmount,
        status: 'pending',
        reference,
      });

      const onPaid = () => {
        setIsPaying(false);
        setSuccess(true);
        toast({ title: "Payment Received!", description: "Your wallet will be credited within a few seconds." });
        setTimeout(() => refetchProfile(), 3000);
      };
      const onCancelled = () => {
        setIsPaying(false);
        toast({ title: "Cancelled", description: "Payment was cancelled.", variant: "destructive" });
      };

      if (gateway === 'flutterwave') {
        await loadScript('https://checkout.flutterwave.com/v3.js', () => !!window.FlutterwaveCheckout);
        window.FlutterwaveCheckout({
          public_key: publicKey,
          tx_ref: reference,
          amount: totalAmount,
          currency: 'NGN',
          payment_options: 'card,mobilemoney,ussd,banktransfer',
          customer: { email: profile?.email || user.email || '', name: profile?.full_name || '' },
          customizations: { title: 'CheapDataHub', description: 'Wallet Funding' },
          callback: (response: any) => {
            if (response.status === 'successful' || response.status === 'completed') onPaid();
            else onCancelled();
          },
          onclose: onCancelled,
        });
      } else {
        await loadScript('https://js.paystack.co/v1/inline.js', () => !!window.PaystackPop);
        const handler = window.PaystackPop.setup({
          key: publicKey,
          email: profile?.email || user.email,
          amount: totalAmount * 100,
          ref: reference,
          currency: 'NGN',
          onSuccess: onPaid,
          onCancel: onCancelled,
        });
        handler.openIframe();
      }
    } catch (err: any) {
      setIsPaying(false);
      toast({ title: "Error", description: err.message || "Failed to initialize payment", variant: "destructive" });
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-12">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-2xl font-bold text-gray-900">Payment Submitted!</h2>
        <p className="text-gray-500">Your wallet is being credited automatically. It may take a few seconds to reflect.</p>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">Current Balance</p>
          <p className="text-3xl font-bold text-gray-900">{formatNaira(profile?.wallet_balance || 0)}</p>
        </div>
        <Button onClick={() => { setSuccess(false); setAmount(""); }} className="w-full h-12">Fund Wallet Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          Fund Wallet
        </h1>
        <p className="text-gray-500 mt-1">Add money securely via card, bank transfer, or USSD</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-500 mb-1">Current Balance</p>
              <p className="text-2xl font-bold text-gray-900">{formatNaira(profile?.wallet_balance || 0)}</p>
            </div>
            <form onSubmit={handlePay} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-base">Amount to Fund (N)</Label>
                <Input id="amount" type="text" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="5000" className="h-12 text-lg font-bold" />
              </div>
              {amount && Number(amount) > 0 && (
                <div className="bg-blue-50 text-blue-900 p-4 rounded-xl text-sm space-y-2">
                  <div className="flex justify-between"><span>Base Amount:</span><span className="font-medium">{formatNaira(Number(amount))}</span></div>
                  <div className="flex justify-between"><span>Processing Fee:</span><span className="font-medium">N50.00</span></div>
                  <div className="border-t border-blue-200 pt-2 flex justify-between font-bold text-base">
                    <span>Total Charged:</span><span>{formatNaira(totalAmount)}</span>
                  </div>
                </div>
              )}
              <Button type="submit" className="w-full h-14 text-lg" disabled={!amount || isPaying}>
                {isPaying ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                {isPaying ? "Opening payment..." : `Pay ${amount ? formatNaira(totalAmount) : ""} securely`}
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6 space-y-3">
              <h3 className="font-semibold text-green-800">Accepted Payment Methods</h3>
              <div className="space-y-2 text-sm text-green-700">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span>Debit / Credit Card (Visa, Mastercard, Verve)</span></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span>Bank Transfer</span></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span>USSD Banking</span></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span>Mobile Money</span></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="pt-6 text-sm text-gray-600 space-y-2">
              <p className="font-medium text-gray-800">How it works</p>
              <p>1. Enter the amount you want to add.</p>
              <p>2. Click Pay — a secure popup will open.</p>
              <p>3. Choose your payment method and complete payment.</p>
              <p>4. Your wallet is credited automatically.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
