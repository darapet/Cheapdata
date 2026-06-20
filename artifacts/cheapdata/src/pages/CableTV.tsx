import { useState } from "react";
import { useForm } from "react-hook-form";
import { AppLayout } from "@/components/layout/AppLayout";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useGetProfile } from "@/lib/supabase-hooks";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatNaira } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const PROVIDERS = {
  DSTV: [
    { id: "dstv-padi", name: "Padi", price: 2950 },
    { id: "dstv-yanga", name: "Yanga", price: 4150 },
    { id: "dstv-confam", name: "Confam", price: 6200 },
    { id: "dstv-compact", name: "Compact", price: 10500 },
    { id: "dstv-compact-plus", name: "Compact+", price: 16600 },
    { id: "dstv-premium", name: "Premium", price: 24500 },
  ],
  GOtv: [
    { id: "gotv-smallie", name: "Smallie", price: 1575 },
    { id: "gotv-jinja", name: "Jinja", price: 2715 },
    { id: "gotv-jolli", name: "Jolli", price: 4115 },
    { id: "gotv-max", name: "Max", price: 7200 },
  ],
  StarTimes: [
    { id: "startimes-nova", name: "Nova", price: 900 },
    { id: "startimes-basic", name: "Basic", price: 1700 },
    { id: "startimes-smart", name: "Smart", price: 2200 },
    { id: "startimes-classic", name: "Classic", price: 2500 },
    { id: "startimes-super", name: "Super", price: 4200 },
  ],
};

type Provider = keyof typeof PROVIDERS;

export default function CableTV() {
  const [provider, setProvider] = useState<Provider>("DSTV");
  const [selectedPlan, setSelectedPlan] = useState<(typeof PROVIDERS.DSTV)[0] | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { data: profile } = useGetProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<{ smart_card: string }>();

  const onSelectPlan = (plan: (typeof PROVIDERS.DSTV)[0]) => {
    handleSubmit(() => {
      setSelectedPlan(plan);
      setPinOpen(true);
    })();
  };

  const executePurchase = async () => {
    if (!selectedPlan) return;
    const { smart_card } = getValues();
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.BASE_URL}api/services/cable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ smart_card_number: smart_card, cable_provider: provider, plan_id: selectedPlan.id }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Cable Subscription!", description: result.message });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      } else {
        toast({ title: "Failed", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    }
    setLoading(false);
  };

  const plans = PROVIDERS[provider];

  return (
    <AppLayout>
      <PinPromptModal open={pinOpen} onOpenChange={setPinOpen} onSuccess={executePurchase}
        amount={selectedPlan?.price} actionTitle={`Confirm ${provider} Subscription`} />
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cable TV</h1>
          <p className="text-sm text-gray-500 mt-1">Balance: <span className="font-semibold text-primary">{formatNaira(profile?.wallet_balance ?? 0)}</span></p>
        </div>

        <div className="flex gap-2">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <button key={p} onClick={() => setProvider(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${provider === p ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary"}`}>
              {p}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <Label>Smart Card / IUC Number</Label>
            <Input placeholder="Enter your smart card number"
              {...register("smart_card", { required: "Smart card number is required" })} />
            {errors.smart_card && <p className="text-xs text-red-500">{errors.smart_card.message}</p>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plans.map((plan) => (
            <button key={plan.id} onClick={() => onSelectPlan(plan)}
              disabled={loading || (profile?.wallet_balance ?? 0) < plan.price}
              className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-primary hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{provider} {plan.name}</span>
                <span className="font-bold text-primary">{formatNaira(plan.price)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Monthly subscription</p>
              {loading && selectedPlan?.id === plan.id && <Loader2 className="h-4 w-4 animate-spin mt-2 text-primary" />}
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
