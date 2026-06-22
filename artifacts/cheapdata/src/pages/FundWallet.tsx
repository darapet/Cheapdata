import { useState } from "react";
import { useGetProfile, useCreateDva, getGetProfileQueryKey } from "@/lib/supabase-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/utils";
import {
  Loader2, Wallet, CheckCircle2, Building2, Copy, RefreshCw, CreditCard
} from "lucide-react";

declare global {
  interface Window { PaystackPop: any; FlutterwaveCheckout: any; }
}

function loadScript(src: string, readyCheck: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (readyCheck()) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    document.body.appendChild(s);
  });
}

function AccountDetail({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(value);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-base font-semibold text-gray-900 mt-0.5">{value}</p>
      </div>
      {copyable && (
        <button onClick={copy} className="p-2 text-gray-400 hover:text-primary transition-colors rounded-lg hover:bg-gray-50">
          <Copy className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function FundWallet() {
  const [amount, setAmount] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, refetch: refetchProfile } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey() }
  });

  const createDva = useCreateDva();

  const hasDva = !!(profile as any)?.dva_account_number;
  const dvaAccount = {
    number: (profile as any)?.dva_account_number ?? "",
    name: (profile as any)?.dva_account_name ?? "",
    bank: (profile as any)?.dva_bank_name ?? "",
  };

  const handleGenerateAccount = () => {
    createDva.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        toast({ title: "Account Created! 🎉", description: "Your personal bank account is ready. Transfer any amount to fund your wallet." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Could not create account. Try again.", variant: "destructive" });
      },
    });
  };

  const fee = 50;
  const totalAmount = Number(amount) + fee;

  const handleCardPay = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!amount || numAmount < 100) {
      toast({ title: "Error", description: "Minimum funding amount is ₦100", variant: "destructive" });
      return;
    }
    setIsPaying(true);
    try {
      const { data: settings } = await supabase
        .from("system_settings")
        .select("active_payment_gateway, paystack_public_key, flutterwave_public_key")
        .maybeSingle();

      const gateway = settings?.active_payment_gateway || "paystack";
      const publicKey = gateway === "flutterwave" ? settings?.flutterwave_public_key : settings?.paystack_public_key;

      if (!publicKey) {
        toast({ title: "Payment gateway not configured", description: "Contact admin.", variant: "destructive" });
        setIsPaying(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const reference = `CDH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      await supabase.from("wallet_fundings").insert({
        user_id: user.id,
        type: "funding",
        description: `Wallet Funding ₦${numAmount.toLocaleString()}`,
        amount: numAmount,
        status: "pending",
        reference,
      });

      const onPaid = () => {
        setIsPaying(false);
        toast({ title: "Payment Received!", description: "Your wallet is being credited. Refresh in a few seconds." });
        setTimeout(() => {
          refetchProfile();
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        }, 3000);
        setAmount("");
        setShowCardForm(false);
      };
      const onCancelled = () => {
        setIsPaying(false);
        toast({ title: "Cancelled", description: "Payment was cancelled.", variant: "destructive" });
      };

      if (gateway === "flutterwave") {
        await loadScript("https://checkout.flutterwave.com/v3.js", () => !!window.FlutterwaveCheckout);
        window.FlutterwaveCheckout({
          public_key: publicKey,
          tx_ref: reference,
          amount: totalAmount,
          currency: "NGN",
          payment_options: "card,mobilemoney,ussd,banktransfer",
          customer: { email: profile?.email || user.email || "", name: profile?.full_name || "" },
          customizations: { title: "CheapDataHub", description: "Wallet Funding" },
          callback: (r: any) => { if (r.status === "successful" || r.status === "completed") onPaid(); else onCancelled(); },
          onclose: onCancelled,
        });
      } else {
        await loadScript("https://js.paystack.co/v1/inline.js", () => !!window.PaystackPop);
        const handler = window.PaystackPop.setup({
          key: publicKey,
          email: profile?.email || user.email,
          amount: totalAmount * 100,
          ref: reference,
          currency: "NGN",
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

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          Fund Wallet
        </h1>
        <p className="text-gray-500 mt-1">Add money to your wallet instantly</p>
      </div>

      {/* Balance */}
      <div className="bg-gradient-to-r from-primary to-red-400 rounded-2xl p-6 text-white">
        <p className="text-sm text-white/70">Current Balance</p>
        <p className="text-4xl font-bold mt-1">{formatNaira(profile?.wallet_balance || 0)}</p>
      </div>

      {/* DVA Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Personal Bank Account</h2>
              <p className="text-sm text-gray-500">Transfer money — wallet credits automatically</p>
            </div>
            {hasDva && (
              <button
                onClick={() => refetchProfile()}
                className="ml-auto p-2 text-gray-400 hover:text-primary transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>

          {hasDva ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4">
              <AccountDetail label="Bank Name" value={dvaAccount.bank} />
              <AccountDetail label="Account Number" value={dvaAccount.number} copyable />
              <AccountDetail label="Account Name" value={dvaAccount.name} copyable />
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              <p className="text-sm text-gray-500">
                Generate your personal dedicated bank account. Transfer any amount and your wallet updates automatically — no confirmation needed.
              </p>
              <Button
                onClick={handleGenerateAccount}
                disabled={createDva.isPending}
                className="h-12 px-8"
              >
                {createDva.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {createDva.isPending ? "Generating..." : "Generate My Account"}
              </Button>
            </div>
          )}

          {hasDva && (
            <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
              Transfer any amount to the account above. Your wallet is credited automatically within seconds.
              <br /><span className="text-xs text-blue-600 mt-1 block">This account is unique to you — always use it when funding.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card / USSD option */}
      <Card>
        <CardContent className="pt-6">
          <button
            onClick={() => setShowCardForm((v) => !v)}
            className="flex items-center gap-3 w-full text-left"
          >
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Pay with Card / USSD</h2>
              <p className="text-sm text-gray-500">Visa, Mastercard, Verve, bank USSD</p>
            </div>
            <span className="text-xs text-gray-400 border border-gray-200 rounded px-2 py-0.5">
              {showCardForm ? "Hide" : "Show"}
            </span>
          </button>

          {showCardForm && (
            <form onSubmit={handleCardPay} className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-base">Amount (₦)</Label>
                <Input
                  id="amount"
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="5000"
                  className="h-12 text-lg font-bold"
                />
              </div>
              {amount && Number(amount) > 0 && (
                <div className="bg-blue-50 text-blue-900 p-4 rounded-xl text-sm space-y-2">
                  <div className="flex justify-between"><span>Base Amount:</span><span className="font-medium">{formatNaira(Number(amount))}</span></div>
                  <div className="flex justify-between"><span>Processing Fee:</span><span className="font-medium">₦50.00</span></div>
                  <div className="border-t border-blue-200 pt-2 flex justify-between font-bold text-base">
                    <span>Total Charged:</span><span>{formatNaira(totalAmount)}</span>
                  </div>
                </div>
              )}
              <Button type="submit" className="w-full h-12 text-base" disabled={!amount || isPaying}>
                {isPaying ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                {isPaying ? "Opening payment..." : `Pay ${amount ? formatNaira(totalAmount) : ""} securely`}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* What to do after */}
      {hasDva && (
        <div className="flex items-center gap-2 text-sm text-gray-400 px-1">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          Transfers typically reflect within 5–30 seconds.
        </div>
      )}
    </div>
  );
}
