import { useState } from "react";
import { useInitializeWalletFunding, useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/utils";
import { Loader2, Wallet, Copy, CheckCircle2 } from "lucide-react";

export default function FundWallet() {
  const [amount, setAmount] = useState("");
  const [fundingData, setFundingData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { data: profile } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey() }
  });

  const initFund = useInitializeWalletFunding();

  const handleInitiateFunding = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!amount || numAmount < 100) {
      toast({ title: "Error", description: "Minimum funding amount is ₦100", variant: "destructive" });
      return;
    }

    initFund.mutate(
      { data: { amount: numAmount } },
      {
        onSuccess: (data) => {
          setFundingData(data);
          toast({ title: "Funding Initiated", description: "Please follow the instructions to complete transfer." });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to initialize funding", variant: "destructive" });
        }
      }
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Account number copied to clipboard." });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          Fund Wallet
        </h1>
        <p className="text-gray-500 mt-1">Add money to your CheapDataHub wallet via Bank Transfer</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-500 mb-1">Current Balance</p>
              <p className="text-2xl font-bold text-gray-900">{formatNaira(profile?.wallet_balance || 0)}</p>
            </div>

            <form onSubmit={handleInitiateFunding} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-base">Amount to Fund (₦)</Label>
                <Input
                  id="amount"
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="5000"
                  className="h-12 text-lg font-bold"
                />
              </div>

              {amount && Number(amount) > 0 && (
                <div className="bg-red-50 text-red-900 p-4 rounded-xl text-sm space-y-2">
                  <div className="flex justify-between">
                    <span>Base Amount:</span>
                    <span className="font-medium">{formatNaira(Number(amount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Processing Fee:</span>
                    <span className="font-medium">₦50.00</span>
                  </div>
                  <div className="border-t border-red-200 pt-2 flex justify-between font-bold text-base">
                    <span>Total Required:</span>
                    <span>{formatNaira(Number(amount) + 50)}</span>
                  </div>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-14 text-lg" 
                disabled={!amount || initFund.isPending}
              >
                {initFund.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                {initFund.isPending ? "Generating Account..." : "Generate Account Details"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {fundingData ? (
          <Card className="border-primary bg-primary text-white shadow-lg overflow-hidden relative">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-bl-full pointer-events-none" />
            <CardContent className="pt-6 relative z-10 space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-medium text-white/80">Transfer exactly</h3>
                <p className="text-4xl font-bold mt-1">{formatNaira(fundingData.total_amount)}</p>
              </div>

              <div className="bg-white/10 rounded-xl p-4 space-y-4">
                <div>
                  <p className="text-sm text-white/60 mb-1">Bank Name</p>
                  <p className="font-medium text-lg">Wema Bank</p>
                </div>
                <div>
                  <p className="text-sm text-white/60 mb-1">Account Number</p>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-2xl font-bold tracking-wider">
                      {/* Hardcoded account for demo per instructions implicitly asking for bank transfer instruction */}
                      0123456789
                    </p>
                    <button 
                      onClick={() => copyToClipboard("0123456789")}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      {copied ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-white/60 mb-1">Account Name</p>
                  <p className="font-medium text-lg">CheapDataHub - {profile?.full_name}</p>
                </div>
              </div>

              <div className="text-center text-sm text-white/80">
                <p>Transfer to the account above to fund your wallet instantly.</p>
                <p className="mt-2 text-xs opacity-70">Reference: {fundingData.reference}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="h-full border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center p-8 text-center text-gray-500">
            <p>Enter an amount and click generate to get bank transfer details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
