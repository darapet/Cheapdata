import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useBuyEducation } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useToast } from "@/hooks/use-toast";
import { formatNaira, cn } from "@/lib/utils";
import { Loader2, GraduationCap, CheckCircle2, AlertCircle } from "lucide-react";

type EduPlan = {
  id: number;
  network: string;
  plan_name: string;
  retail_price: number;
  wholesale_price: number;
  plan_id: string;
  cheapdatahub_plan_id: string | null;
};

const EXAM_BODIES = ["WAEC", "NECO", "NABTEB", "JAMB", "GCE"];

const EXAM_INFO: Record<string, { description: string; verifyLabel: string; verifyPlaceholder: string }> = {
  WAEC: {
    description: "West African Examinations Council result checker PIN",
    verifyLabel: "WAEC Registration Number",
    verifyPlaceholder: "e.g. 4250109001",
  },
  NECO: {
    description: "National Examinations Council result checker PIN",
    verifyLabel: "NECO Registration Number",
    verifyPlaceholder: "e.g. 1234567890",
  },
  NABTEB: {
    description: "National Business and Technical Examinations Board PIN",
    verifyLabel: "NABTEB Registration Number",
    verifyPlaceholder: "e.g. 9876543210",
  },
  JAMB: {
    description: "Joint Admissions and Matriculation Board result checker",
    verifyLabel: "JAMB Registration Number",
    verifyPlaceholder: "e.g. 12345678AB",
  },
  GCE: {
    description: "General Certificate of Education result checker PIN",
    verifyLabel: "GCE Registration Number",
    verifyPlaceholder: "e.g. 4250209001",
  },
};

export default function Education() {
  const [examBody, setExamBody] = useState("WAEC");
  const [quantity, setQuantity] = useState("1");
  const [selectedPlan, setSelectedPlan] = useState<EduPlan | null>(null);
  const [regNumber, setRegNumber] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [verifyState, setVerifyState] = useState<"idle" | "verified">("idle");
  const { toast } = useToast();

  const { data: plans = [], isLoading } = useQuery<EduPlan[]>({
    queryKey: ["education-plans", examBody],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_plans")
        .select("*")
        .eq("service_type", "education")
        .eq("network", examBody)
        .eq("is_active", true)
        .order("retail_price");
      if (error) throw error;
      return data ?? [];
    },
  });

  const buyEducation = useBuyEducation();

  const total = selectedPlan ? selectedPlan.retail_price * Number(quantity || 1) : 0;
  const examInfo = EXAM_INFO[examBody];

  function handleExamBodyChange(body: string) {
    setExamBody(body);
    setSelectedPlan(null);
    setRegNumber("");
    setVerifyState("idle");
  }

  function handleRegNumberChange(val: string) {
    setRegNumber(val);
    setVerifyState("idle");
  }

  function handleVerify() {
    if (!regNumber.trim()) {
      toast({ title: "Error", description: "Please enter your registration number", variant: "destructive" });
      return;
    }
    if (regNumber.trim().length < 6) {
      toast({ title: "Error", description: "Registration number appears too short", variant: "destructive" });
      return;
    }
    setVerifyState("verified");
    toast({ title: "Verified", description: `${examBody} registration number confirmed` });
  }

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNumber.trim()) {
      toast({ title: "Error", description: "Please enter your registration number", variant: "destructive" });
      return;
    }
    if (verifyState !== "verified") {
      toast({ title: "Not Verified", description: "Please verify your registration number first", variant: "destructive" });
      return;
    }
    if (!selectedPlan) {
      toast({ title: "Error", description: "Please select a plan", variant: "destructive" });
      return;
    }
    setIsPinModalOpen(true);
  };

  const executePurchase = () => {
    if (!selectedPlan) return;
    buyEducation.mutate(
      {
        data: {
          exam_body: examBody,
          plan_id: selectedPlan.plan_id,
          quantity: Number(quantity || 1),
          pin: "VERIFIED_BY_MODAL",
        },
      },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success", description: data.message });
            setSelectedPlan(null);
            setQuantity("1");
            setRegNumber("");
            setVerifyState("idle");
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
        <p className="text-gray-500 mt-1">Buy WAEC, NECO, NABTEB, JAMB &amp; GCE result checker PINs</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Exam body selector */}
          <div className="space-y-3">
            <Label className="text-base">Select Exam Body</Label>
            <div className="grid grid-cols-5 gap-2">
              {EXAM_BODIES.map((eb) => (
                <button
                  key={eb}
                  type="button"
                  onClick={() => handleExamBodyChange(eb)}
                  className={cn(
                    "h-12 rounded-xl font-bold text-xs transition-all border-2",
                    examBody === eb
                      ? "border-primary bg-red-50 text-primary scale-[1.02] shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {eb}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">{examInfo.description}</p>
          </div>

          <form onSubmit={handleInitiatePurchase} className="space-y-6">
            {/* Registration number + verify */}
            <div className="space-y-2">
              <Label htmlFor="regNumber" className="text-base">
                {examInfo.verifyLabel}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="regNumber"
                    type="text"
                    value={regNumber}
                    onChange={(e) => handleRegNumberChange(e.target.value)}
                    placeholder={examInfo.verifyPlaceholder}
                    className={cn(
                      "pr-9",
                      verifyState === "verified" && "border-green-500 bg-green-50"
                    )}
                  />
                  {verifyState === "verified" && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
                <Button
                  type="button"
                  variant={verifyState === "verified" ? "outline" : "default"}
                  onClick={handleVerify}
                  disabled={verifyState === "verified" || !regNumber.trim()}
                  className={cn(
                    "shrink-0",
                    verifyState === "verified" && "border-green-500 text-green-600"
                  )}
                >
                  {verifyState === "verified" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Verified
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
              {verifyState === "verified" && (
                <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Registration number verified. You can now proceed.
                </p>
              )}
            </div>

            {/* Plans */}
            <div className="space-y-2">
              <Label className="text-base">Select Plan</Label>
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : plans.length === 0 ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center text-sm text-orange-700 flex items-center justify-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  No {examBody} plans available. Ask your admin to sync plans from CheapDataHub.
                </div>
              ) : (
                <div className="space-y-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={cn(
                        "w-full text-left rounded-xl border-2 p-3 transition-all",
                        selectedPlan?.id === plan.id
                          ? "border-primary bg-red-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}
                    >
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
                <Label htmlFor="quantity" className="text-base">
                  Quantity (PINs)
                </Label>
                <Select value={quantity} onValueChange={setQuantity}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select quantity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 PIN</SelectItem>
                    <SelectItem value="2">2 PINs</SelectItem>
                    <SelectItem value="5">5 PINs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedPlan && Number(quantity) > 1 && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
                <span className="text-gray-600">
                  {quantity} × {formatNaira(selectedPlan.retail_price)} ={" "}
                </span>
                <span className="font-bold text-gray-900">{formatNaira(total)}</span>
              </div>
            )}

            {/* Summary before payment */}
            {selectedPlan && verifyState === "verified" && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-1.5 text-sm">
                <p className="font-semibold text-blue-900 mb-2">Order Summary</p>
                <div className="flex justify-between text-blue-800">
                  <span>Exam Body</span>
                  <span className="font-medium">{examBody}</span>
                </div>
                <div className="flex justify-between text-blue-800">
                  <span>Reg. Number</span>
                  <span className="font-medium">{regNumber}</span>
                </div>
                <div className="flex justify-between text-blue-800">
                  <span>Plan</span>
                  <span className="font-medium">{selectedPlan.plan_name}</span>
                </div>
                <div className="flex justify-between text-blue-800 font-bold pt-1 border-t border-blue-200">
                  <span>Total</span>
                  <span>{formatNaira(total)}</span>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-14 text-lg"
              disabled={
                !selectedPlan ||
                verifyState !== "verified" ||
                !regNumber.trim() ||
                buyEducation.isPending
              }
            >
              {buyEducation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : null}
              {buyEducation.isPending
                ? "Processing..."
                : verifyState !== "verified"
                ? "Verify Registration Number First"
                : selectedPlan
                ? `Pay ${formatNaira(total)}`
                : "Select a Plan"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal
        open={isPinModalOpen}
        onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase}
        amount={total}
        actionTitle="Confirm Exam PIN Purchase"
      />
    </div>
  );
}
