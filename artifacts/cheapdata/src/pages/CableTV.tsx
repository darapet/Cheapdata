import { useState } from "react";
import { useBuyCable } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useToast } from "@/hooks/use-toast";
import { formatNaira, cn } from "@/lib/utils";
import { Loader2, Tv } from "lucide-react";

const providers = [
  { id: "DSTV", name: "DSTV" },
  { id: "GOTV", name: "GOtv" },
  { id: "STARTIMES", name: "Startimes" },
];

const mockPlans = {
  DSTV: [
    { id: "dstv-padi", name: "DStv Padi", price: 2950 },
    { id: "dstv-yanga", name: "DStv Yanga", price: 4200 },
    { id: "dstv-confam", name: "DStv Confam", price: 7400 },
  ],
  GOTV: [
    { id: "gotv-jinja", name: "GOtv Jinja", price: 2700 },
    { id: "gotv-jolli", name: "GOtv Jolli", price: 3950 },
    { id: "gotv-max", name: "GOtv Max", price: 5700 },
  ],
  STARTIMES: [
    { id: "st-nova", name: "Nova", price: 1500 },
    { id: "st-basic", name: "Basic", price: 2600 },
    { id: "st-smart", name: "Smart", price: 3500 },
  ]
};

export default function CableTV() {
  const [provider, setProvider] = useState<string>("DSTV");
  const [smartCardNumber, setSmartCardNumber] = useState("");
  const [planId, setPlanId] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const { toast } = useToast();

  const buyCable = useBuyCable();

  const selectedPlans = mockPlans[provider as keyof typeof mockPlans] || [];
  const selectedPlanObj = selectedPlans.find(p => p.id === planId);

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartCardNumber || smartCardNumber.length < 5) {
      toast({ title: "Error", description: "Please enter a valid smart card number", variant: "destructive" });
      return;
    }
    if (!planId) {
      toast({ title: "Error", description: "Please select a subscription plan", variant: "destructive" });
      return;
    }
    setIsPinModalOpen(true);
  };

  const executePurchase = () => {
    if (!selectedPlanObj) return;

    buyCable.mutate(
      { data: { smart_card_number: smartCardNumber, cable_provider: provider, plan_id: planId, amount: selectedPlanObj?.price ?? 0, pin: "VERIFIED_BY_MODAL" } },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success", description: data.message });
            setSmartCardNumber("");
            setPlanId("");
          } else {
            toast({ title: "Subscription Failed", description: data.message, variant: "destructive" });
          }
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "An unexpected error occurred", variant: "destructive" });
        }
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
                <button
                  key={prov.id}
                  type="button"
                  onClick={() => { setProvider(prov.id); setPlanId(""); }}
                  className={cn(
                    "h-14 rounded-xl font-bold text-sm transition-all border-2",
                    provider === prov.id 
                      ? "border-primary bg-red-50 text-primary scale-[1.02] shadow-sm" 
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {prov.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleInitiatePurchase} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="smartCardNumber" className="text-base">Smart Card / IUC Number</Label>
              <Input
                id="smartCardNumber"
                type="text"
                value={smartCardNumber}
                onChange={(e) => setSmartCardNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Enter 10 or 11 digit number"
                className="h-12 text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-base">Select Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="h-12 text-lg">
                  <SelectValue placeholder="Choose a subscription plan" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id} className="text-base py-3">
                      {plan.name} - {formatNaira(plan.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              type="submit" 
              className="w-full h-14 text-lg" 
              disabled={!smartCardNumber || !planId || buyCable.isPending}
            >
              {buyCable.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyCable.isPending ? "Processing..." : selectedPlanObj ? `Pay ${formatNaira(selectedPlanObj.price)}` : "Proceed to Pay"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal 
        open={isPinModalOpen} 
        onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase}
        amount={selectedPlanObj?.price}
        actionTitle="Confirm TV Subscription"
      />
    </div>
  );
}
