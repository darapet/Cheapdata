import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetDataPlansByNetwork, useBuyData, getGetDataPlansByNetworkQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useToast } from "@/hooks/use-toast";
import { formatNaira, cn } from "@/lib/utils";
import { Loader2, Wifi } from "lucide-react";

const networks = [
  { id: "MTN", name: "MTN", color: "bg-yellow-400 hover:bg-yellow-500", text: "text-black" },
  { id: "AIRTEL", name: "Airtel", color: "bg-red-500 hover:bg-red-600", text: "text-white" },
  { id: "GLO", name: "Glo", color: "bg-green-500 hover:bg-green-600", text: "text-white" },
  { id: "9MOBILE", name: "9mobile", color: "bg-green-800 hover:bg-green-900", text: "text-white" },
];

export default function BuyData() {
  const [network, setNetwork] = useState<string>("MTN");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const { toast } = useToast();

  const { data: plans, isLoading: isPlansLoading } = useGetDataPlansByNetwork(network, {
    query: { queryKey: getGetDataPlansByNetworkQueryKey(network) }
  });

  const buyData = useBuyData();

  const selectedPlan = plans?.find(p => p.plan_id === selectedPlanId);

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      toast({ title: "Error", description: "Please enter a valid phone number", variant: "destructive" });
      return;
    }
    if (!selectedPlanId) {
      toast({ title: "Error", description: "Please select a data plan", variant: "destructive" });
      return;
    }
    setIsPinModalOpen(true);
  };

  const executePurchase = () => {
    if (!selectedPlan) return;
    
    buyData.mutate(
      { data: { phone, plan_id: selectedPlan.plan_id, network, pin: "VERIFIED_BY_MODAL" } },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success", description: data.message });
            setPhone("");
            setSelectedPlanId("");
          } else {
            toast({ title: "Purchase Failed", description: data.message, variant: "destructive" });
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
          <Wifi className="h-6 w-6 text-primary" />
          Buy Data
        </h1>
        <p className="text-gray-500 mt-1">Instant data top-up for all networks</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-3">
            <Label className="text-base">Select Network</Label>
            <div className="grid grid-cols-4 gap-3">
              {networks.map((net) => (
                <button
                  key={net.id}
                  type="button"
                  onClick={() => { setNetwork(net.id); setSelectedPlanId(""); }}
                  className={cn(
                    "h-16 rounded-xl font-bold text-sm transition-all border-2",
                    network === net.id 
                      ? `${net.color} ${net.text} border-transparent scale-[1.02] shadow-md` 
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {net.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleInitiatePurchase} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-base">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="080XXXXXXXX"
                className="h-12 text-lg"
                maxLength={11}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-base">Select Plan</Label>
              {isPlansLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />)}
                </div>
              ) : plans && plans.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 pb-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.plan_id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.plan_id)}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all",
                        selectedPlanId === plan.plan_id
                          ? "border-primary bg-red-50"
                          : "border-gray-200 bg-white hover:border-primary/50"
                      )}
                    >
                      <div className="font-bold text-lg text-gray-900">{plan.plan_name}</div>
                      <div className="text-primary font-bold mt-1">{formatNaira(plan.retail_price)}</div>
                      {plan.validity && <div className="text-xs text-gray-500 mt-1">{plan.validity}</div>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-gray-500">No plans available for {network}</p>
                </div>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-14 text-lg" 
              disabled={!phone || !selectedPlanId || buyData.isPending}
            >
              {buyData.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyData.isPending ? "Processing..." : selectedPlan ? `Pay ${formatNaira(selectedPlan.retail_price)}` : "Proceed to Pay"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal 
        open={isPinModalOpen} 
        onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase}
        amount={selectedPlan?.retail_price}
        actionTitle="Confirm Data Purchase"
      />
    </div>
  );
}
