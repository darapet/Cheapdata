import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useBuyCable } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useToast } from "@/hooks/use-toast";
import { formatNaira, cn } from "@/lib/utils";
import { Loader2, Tv, CheckCircle2, XCircle, UserCheck, AlertCircle } from "lucide-react";

type CablePlan = {
  id: number;
  network: string;
  plan_name: string;
  retail_price: number;
  plan_id: string;
  validity: string;
  cheapdatahub_plan_id: string | null;
};

const providers = [
  { id: "DSTV", name: "DSTV" },
  { id: "GOTV", name: "GOtv" },
  { id: "STARTIMES", name: "Startimes" },
];

const EDGE_BASE = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") + "/functions/v1";

export default function CableTV() {
  const [provider, setProvider]               = useState("DSTV");
  const [smartCardNumber, setSmartCardNumber] = useState("");
  const [selectedPlan, setSelectedPlan]       = useState<CablePlan | null>(null);
  const [phone, setPhone]                     = useState("");
  const [isPinModalOpen, setIsPinModalOpen]   = useState(false);
  const [verifyState, setVerifyState]         = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [customerName, setCustomerName]       = useState<string | null>(null);
  const [verifyError, setVerifyError]         = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const { data: plans = [], isLoading } = useQuery<CablePlan[]>({
    queryKey: ["cable-plans", provider],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_plans")
        .select("*")
        .eq("service_type", "cable")
        .eq("network", provider)
        .eq("is_active", true)
        .order("retail_price");
      if (error) throw error;
      return data ?? [];
    },
  });

  const buyCable = useBuyCable();

  async function verifyCard(cardNum: string) {
    if (cardNum.length < 5) {
      setVerifyState("idle");
      setCustomerName(null);
      return;
    }
    setVerifyState("loading");
    setCustomerName(null);
    setVerifyError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(
        `${EDGE_BASE}/verify-cable?provider=${encodeURIComponent(provider)}&cardnumber=${encodeURIComponent(cardNum)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json() as {
        success: boolean;
        customer_name?: string | null;
        skipped?: boolean;
        message?: string;
      };
      if (json.success || json.skipped) {
        setVerifyState("ok");
        setCustomerName(json.customer_name ?? null);
      } else {
        setVerifyState("error");
        setVerifyError(json.message ?? "Invalid card number. Please check and try again.");
      }
    } catch {
      // Network error — allow proceeding without name
      setVerifyState("ok");
      setCustomerName(null);
    }
  }

  function handleCardChange(val: string) {
    const num = val.replace(/[^0-9]/g, "");
    setSmartCardNumber(num);
    setVerifyState("idle");
    setCustomerName(null);
    setVerifyError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (num.length >= 5) {
      debounceRef.current = setTimeout(() => verifyCard(num), 800);
    }
  }

  function handleProviderChange(id: string) {
    setProvider(id);
    setSelectedPlan(null);
    setVerifyState("idle");
    setCustomerName(null);
    setVerifyError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (smartCardNumber.length >= 5) {
      debounceRef.current = setTimeout(() => verifyCard(smartCardNumber), 800);
    }
  }

  // Must be verified (ok) before proceeding — blocks pay button if error or loading
  const canProceed = verifyState === "ok" && smartCardNumber.length >= 5 && !!selectedPlan;

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartCardNumber || smartCardNumber.length < 5) {
      toast({ title: "Error", description: "Please enter a valid smart card number", variant: "destructive" });
      return;
    }
    if (verifyState !== "ok") {
      toast({ title: "Not Verified", description: "Please wait for your card number to be verified", variant: "destructive" });
      return;
    }
    if (!selectedPlan) {
      toast({ title: "Error", description: "Please select a subscription plan", variant: "destructive" });
      return;
    }
    setIsPinModalOpen(true);
  };

  const executePurchase = () => {
    if (!selectedPlan) return;
    buyCable.mutate(
      {
        data: {
          smart_card_number: smartCardNumber,
          cable_provider: provider,
          plan_id: selectedPlan.plan_id,
          phone,
          amount: selectedPlan.retail_price,
          pin: "VERIFIED_BY_MODAL",
        },
      },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Subscription Successful! 🎉", description: data.message });
            setSmartCardNumber("");
            setSelectedPlan(null);
            setPhone("");
            setVerifyState("idle");
            setCustomerName(null);
          } else {
            toast({ title: "Subscription Failed", description: data.message, variant: "destructive" });
          }
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "An unexpected error occurred", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Tv className="h-6 w-6 text-primary" />
          Cable TV
        </h1>
        <p className="text-gray-500 mt-1">Subscribe to DSTV, GOtv, and Startimes</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Provider selector */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Select Provider</Label>
            <div className="grid grid-cols-3 gap-3">
              {providers.map((prov) => (
                <button key={prov.id} type="button"
                  onClick={() => handleProviderChange(prov.id)}
                  className={cn(
                    "h-14 rounded-xl font-bold text-sm transition-all border-2",
                    provider === prov.id
                      ? "border-primary bg-red-50 text-primary scale-[1.02] shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  )}>
                  {prov.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleInitiatePurchase} className="space-y-6">
            {/* Smart Card Number — auto-verifies + shows name */}
            <div className="space-y-2">
              <Label htmlFor="smartCardNumber" className="text-base font-semibold">
                Smart Card / IUC Number
              </Label>
              <div className="relative">
                <Input
                  id="smartCardNumber"
                  type="text"
                  inputMode="numeric"
                  value={smartCardNumber}
                  onChange={(e) => handleCardChange(e.target.value)}
                  placeholder="Enter your smart card / IUC number"
                  className={cn(
                    "h-12 text-base pr-10",
                    verifyState === "ok"    && "border-green-400 focus-visible:ring-green-300",
                    verifyState === "error" && "border-red-400 focus-visible:ring-red-300"
                  )}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {verifyState === "loading" && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
                  {verifyState === "ok"      && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  {verifyState === "error"   && <XCircle className="h-5 w-5 text-red-500" />}
                </div>
              </div>
              <p className="text-xs text-gray-400">Enter your card number — your account name will appear automatically</p>

              {/* Subscriber name banner */}
              {verifyState === "ok" && customerName && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
                  <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                  <div>
                    <span className="font-bold text-green-900 text-sm">{customerName}</span>
                    <span className="text-green-600 text-xs ml-2">— account verified</span>
                  </div>
                </div>
              )}
              {verifyState === "ok" && !customerName && smartCardNumber.length >= 5 && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Card number accepted. Please confirm this is your correct number before paying.
                </div>
              )}
              {verifyState === "error" && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  <XCircle className="h-3.5 w-3.5 shrink-0" /> {verifyError}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cable-phone" className="text-base font-semibold">Phone Number</Label>
              <Input id="cable-phone" type="tel" placeholder="e.g. 08012345678"
                value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={11}
                className="h-12 text-base" />
            </div>

            {/* Plans */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Select Plan</Label>
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : plans.length === 0 ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center text-sm text-orange-700 flex items-center justify-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  No {provider} plans available. Ask admin to add plans.
                </div>
              ) : (
                <div className="space-y-2">
                  {plans.map((plan) => (
                    <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan)}
                      className={cn(
                        "w-full text-left rounded-xl border-2 p-3 transition-all",
                        selectedPlan?.id === plan.id
                          ? "border-primary bg-red-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-sm">{plan.plan_name}</span>
                          {plan.validity && (
                            <span className="text-xs text-gray-400 ml-2">• {plan.validity}</span>
                          )}
                        </div>
                        <span className="font-bold text-primary">{formatNaira(plan.retail_price)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Order summary */}
            {canProceed && selectedPlan && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-1.5 text-sm">
                <p className="font-semibold text-blue-900 mb-2">Order Summary</p>
                <div className="flex justify-between text-blue-800">
                  <span>Provider</span><span className="font-medium">{provider}</span>
                </div>
                <div className="flex justify-between text-blue-800">
                  <span>Smart Card</span><span className="font-medium">{smartCardNumber}</span>
                </div>
                {customerName && (
                  <div className="flex justify-between text-blue-800">
                    <span>Account Name</span><span className="font-medium">{customerName}</span>
                  </div>
                )}
                <div className="flex justify-between text-blue-800">
                  <span>Plan</span><span className="font-medium">{selectedPlan.plan_name}</span>
                </div>
                <div className="flex justify-between text-blue-900 font-bold pt-1 border-t border-blue-200">
                  <span>Total</span><span>{formatNaira(selectedPlan.retail_price)}</span>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full h-14 text-lg"
              disabled={!canProceed || buyCable.isPending}>
              {buyCable.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyCable.isPending
                ? "Processing..."
                : verifyState === "loading"
                ? "Verifying card number..."
                : !canProceed
                ? "Enter card number above"
                : `Pay ${formatNaira(selectedPlan!.retail_price)}`}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal open={isPinModalOpen} onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase} amount={selectedPlan?.retail_price}
        actionTitle="Confirm TV Subscription" />
    </div>
  );
}
