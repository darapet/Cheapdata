import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useBuyEducation } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useToast } from "@/hooks/use-toast";
import { formatNaira, cn } from "@/lib/utils";
import { Loader2, GraduationCap } from "lucide-react";

type EduPlan = { id: number; network: string; plan_name: string; retail_price: number; wholesale_price: number; plan_id: string; cheapdatahub_plan_id: string | null };

const EXAM_BODIES = ["WAEC", "NECO", "JAMB", "GCE"];

export default function Education() {
  const [examBody, setExamBody] = useState("WAEC");
  const [quantity, setQuantity] = useState("1");
  const [selectedPlan, setSelectedPlan] = useState<EduPlan | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const { toast } = useToast();

  const { data: plans = [], isLoading } = useQuery<EduPlan[]>({
    queryKey: ["education-plans", examBody],
    queryFn: async () => {
      const { data, error } = await supabase.from("data_plans").select("*")
        .eq("service_type", "education").eq("network", examBody).eq("is_active", true).order("retail_price");
      if (error) throw error;
      return data ?? [];
    },
  });

  const buyEducation = useBuyEducation();

  const total = selectedPlan ? selectedPlan.retail_price * Number(quantity || 1) : 0;

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      toast({ title: "Error", description: "Please select a plan", variant: "destructive" });
      return;
    }
    setIsPinModalOpen(true);
  };

  const executePurchase = () => {
    if (!selectedPlan) return;
    buyEducation.mutate(
      { data: { exam_body: examBody, plan_id: selectedPlan.plan_id, quantity: Number(quantity || 1), pin: "VERIFIED_BY_MODAL" } },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success", description: data.message });
            setSelectedPlan(null);
            setQuantity("1");
          } else {
            toast({ title: "Purchase Failed", description: data.message, variant: "destructive" });
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
          <GraduationCap className="h-6 w-6 text-primary" />
          Education — Exam Result Checkers
        </h1>
        <p className="text-gray-500 mt-1">Buy WAEC, NECO, JAMB result checker PINs</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Exam body selector */}
          <div className="space-y-3">
            <Label className="text-base">Select Exam Body</Label>
            <div className="grid grid-cols-4 gap-2">
              {EXAM_BODIES.map(eb => (
                <button key={eb} type="button" onClick={() => { setExamBody(eb); setSelectedPlan(null); }}
                  className={cn("h-12 rounded-xl font-bold text-sm transition-all border-2",
                    examBody === eb
                      ? "border-primary bg-red-50 text-primary scale-[1.02] shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  )}>
                  {eb}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleInitiatePurchase} className="space-y-6">
            {/* Plans */}
            <div className="space-y-2">
              <Label className="text-base">Select Plan</Label>
              {isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : plans.length === 0 ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center text-sm text-orange-700">
                  No {examBody} plans available. Ask your admin to sync plans from CheapDataHub.
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
                        <span className="font-semibold text-sm">{plan.plan_name}</span>
                        <span className="font-bold text-primary">{formatNaira(plan.retail_price)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedPlan && (
              <div className="space-y-2">
                <Label htmlFor="quantity" className="text-base">Quantity (PINs)</Label>
                <Input id="quantity" type="number" min="1" max="10" value={quantity}
                  onChange={e => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
                  className="h-12 text-lg" />
              </div>
            )}

            {selectedPlan && Number(quantity) > 1 && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
                <span className="text-gray-600">{quantity} × {formatNaira(selectedPlan.retail_price)} = </span>
                <span className="font-bold text-gray-900">{formatNaira(total)}</span>
              </div>
            )}

            <Button type="submit" className="w-full h-14 text-lg"
              disabled={!selectedPlan || buyEducation.isPending}>
              {buyEducation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyEducation.isPending ? "Processing..." : selectedPlan ? `Pay ${formatNaira(total)}` : "Select a Plan"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal open={isPinModalOpen} onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase} amount={total} actionTitle="Confirm Exam PIN Purchase" />
    </div>
  );
}
