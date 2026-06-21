import { useState } from "react";
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
import { Loader2, Tv } from "lucide-react";

type CablePlan = { id: number; network: string; plan_name: string; retail_price: number; plan_id: string; validity: string; cheapdatahub_plan_id: string | null };

const providers = [
  { id: "DSTV", name: "DSTV" },
  { id: "GOTV", name: "GOtv" },
  { id: "STARTIMES", name: "Startimes" },
];

export default function CableTV() {
  const [provider, setProvider] = useState("DSTV");
  const [smartCardNumber, setSmartCardNumber] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<CablePlan | null>(null);
  const [phone, setPhone] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const { toast } = useToast();

  const { data: plans = [], isLoading } = useQuery<CablePlan[]>({
    queryKey: ["cable-plans", provider],
    queryFn: async () => {
      const { data, error } = await supabase.from("data_plans").select("*")
        .eq("service_type", "cable").eq("network", provider).eq("is_active", true).order("retail_price");
      if (error) throw error;
      return data ?? [];
    },
  });

  const buyCable = useBuyCable();

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartCardNumber || smartCardNumber.length < 5) {
      toast({ title: "Error", description: "Please enter a valid smart card number", variant: "destructive" });
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
      { data: { smart_card_number: smartCardNumber, cable_provider: provider, plan_id: selectedPlan.plan_id, phone, amount: selectedPlan.retail_price, pin: "VERIFIED_BY_MODAL" } },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success", description: data.message });
            setSmartCardNumber("");
            setSelectedPlan(null);
            setPhone("");
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
          <div className="space-y-3">
            <Label className="text-base">Select Provider</Label>
            <div className="grid grid-cols-3 gap-3">
              {providers.map((prov) => (
                <button key={prov.id} type="button"
                  onClick={() => { setProvider(prov.id); setSelectedPlan(null); }}
                  className={cn("h-14 rounded-xl font-bold text-sm transition-all border-2",
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
            <div className="space-y-2">
              <Label htmlFor="smartCardNumber" className="text-base">Smart Card / IUC Number</Label>
              <Input id="smartCardNumber" type="text" value={smartCardNumber}
                onChange={e => setSmartCardNumber(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Enter 10 or 11 digit number" className="h-12 text-lg" />
            </div>

              <div className="space-y-2">
                <Label htmlFor="cable-phone">Phone Number</Label>
                <Input
                  id="cable-phone"
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={11}
                />
              </div>

            <div className="space-y-2">
              <Label className="text-base">Select Plan</Label>
              {isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : plans.length === 0 ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center text-sm text-orange-700">
                  No {provider} plans available. Ask admin to add plans in Admin → Plans.
                </div>
              ) : (
                <div className="space-y-2">
                  {plans.map(plan => (
                    <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan)}
                      className={cn("w-full text-left rounded-xl border-2 p-3 transition-all",
                        selectedPlan?.id === plan.id
                          ? "border-primary bg-red-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-sm">{plan.plan_name}</span>
                          {plan.validity && <span className="text-xs text-gray-400 ml-2">• {plan.validity}</span>}
                        </div>
                        <span className="font-bold text-primary">{formatNaira(plan.retail_price)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button type="submit" className="w-full h-14 text-lg"
              disabled={!smartCardNumber || !selectedPlan || buyCable.isPending}>
              {buyCable.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyCable.isPending ? "Processing..." : selectedPlan ? `Pay ${formatNaira(selectedPlan.retail_price)}` : "Proceed to Pay"}
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
