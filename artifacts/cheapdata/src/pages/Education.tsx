import { useState, useRef } from "react";
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
import { Loader2, GraduationCap, CheckCircle2, XCircle, UserCheck, AlertCircle } from "lucide-react";

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

const EXAM_INFO: Record<string, { description: string; label: string; placeholder: string }> = {
  WAEC:   { description: "West African Examinations Council result checker PIN", label: "WAEC Registration Number", placeholder: "e.g. 4250109001" },
  NECO:   { description: "National Examinations Council result checker PIN",     label: "NECO Registration Number", placeholder: "e.g. 1234567890" },
  NABTEB: { description: "National Business and Technical Examinations Board",   label: "NABTEB Registration Number", placeholder: "e.g. 9876543210" },
  JAMB:   { description: "Joint Admissions and Matriculation Board",             label: "JAMB Registration Number", placeholder: "e.g. 12345678AB" },
  GCE:    { description: "General Certificate of Education result checker PIN",  label: "GCE Registration Number", placeholder: "e.g. 4250209001" },
};

const EDGE_BASE = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") + "/functions/v1";

export default function Education() {
  const [examBody, setExamBody]           = useState("WAEC");
  const [quantity, setQuantity]           = useState("1");
  const [selectedPlan, setSelectedPlan]   = useState<EduPlan | null>(null);
  const [regNumber, setRegNumber]         = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [verifyState, setVerifyState]     = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [studentName, setStudentName]     = useState<string | null>(null);
  const [verifyError, setVerifyError]     = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const examInfo = EXAM_INFO[examBody] ?? EXAM_INFO.WAEC;

  async function verifyRegNumber(reg: string) {
    if (reg.length < 6) {
      setVerifyState("idle");
      setStudentName(null);
      return;
    }
    setVerifyState("loading");
    setStudentName(null);
    setVerifyError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(
        `${EDGE_BASE}/verify-education?exam_body=${encodeURIComponent(examBody)}&reg_number=${encodeURIComponent(reg)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json() as {
        success: boolean;
        student_name?: string | null;
        skipped?: boolean;
        message?: string;
      };
      if (json.success || json.skipped) {
        setVerifyState("ok");
        setStudentName(json.student_name ?? null);
      } else {
        setVerifyState("error");
        setVerifyError(json.message ?? "Could not verify this registration number");
      }
    } catch {
      // Network error — allow proceeding
      setVerifyState("ok");
      setStudentName(null);
    }
  }

  function handleRegChange(val: string) {
    setRegNumber(val);
    setVerifyState("idle");
    setStudentName(null);
    setVerifyError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 6) {
      debounceRef.current = setTimeout(() => verifyRegNumber(val), 900);
    }
  }

  function handleExamBodyChange(body: string) {
    setExamBody(body);
    setSelectedPlan(null);
    setRegNumber("");
    setVerifyState("idle");
    setStudentName(null);
    setVerifyError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }

  const canProceed = verifyState === "ok" && regNumber.length >= 6 && !!selectedPlan;

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNumber || regNumber.length < 6) {
      toast({ title: "Error", description: "Please enter your registration number", variant: "destructive" });
      return;
    }
    if (verifyState !== "ok") {
      toast({ title: "Not Verified", description: "Please wait for your registration number to be verified", variant: "destructive" });
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
      { data: { exam_body: examBody, plan_id: selectedPlan.plan_id, quantity: Number(quantity || 1), pin: "VERIFIED_BY_MODAL" } },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success! 🎉", description: data.message });
            setSelectedPlan(null);
            setQuantity("1");
            setRegNumber("");
            setVerifyState("idle");
            setStudentName(null);
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
            <Label className="text-base font-semibold">Select Exam Body</Label>
            <div className="grid grid-cols-5 gap-2">
              {EXAM_BODIES.map((eb) => (
                <button key={eb} type="button" onClick={() => handleExamBodyChange(eb)}
                  className={cn(
                    "h-12 rounded-xl font-bold text-xs transition-all border-2",
                    examBody === eb
                      ? "border-primary bg-red-50 text-primary scale-[1.02] shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  )}>
                  {eb}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">{examInfo.description}</p>
          </div>

          <form onSubmit={handleInitiatePurchase} className="space-y-6">
            {/* Registration number — auto-verifies */}
            <div className="space-y-2">
              <Label htmlFor="regNumber" className="text-base font-semibold">
                {examInfo.label}
              </Label>
              <div className="relative">
                <Input
                  id="regNumber"
                  type="text"
                  value={regNumber}
                  onChange={(e) => handleRegChange(e.target.value)}
                  placeholder={examInfo.placeholder}
                  className={cn(
                    "h-12 pr-10 text-base",
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
              <p className="text-xs text-gray-400">Enter your number — we will look it up automatically</p>

              {/* Student name banner */}
              {verifyState === "ok" && studentName && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm">
                  <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                  <div>
                    <span className="font-bold text-green-900">{studentName}</span>
                    <span className="text-green-600 text-xs ml-2">— registration verified</span>
                  </div>
                </div>
              )}
              {verifyState === "ok" && !studentName && regNumber.length >= 6 && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Registration number accepted. You may proceed.
                </div>
              )}
              {verifyState === "error" && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> {verifyError}
                </p>
              )}
            </div>

            {/* Plans */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Select Plan</Label>
              {isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : plans.length === 0 ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center text-sm text-orange-700 flex items-center justify-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  No {examBody} plans available. Ask admin to sync plans.
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
                <Label className="text-base font-semibold">Quantity (PINs)</Label>
                <Select value={quantity} onValueChange={setQuantity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 PIN</SelectItem>
                    <SelectItem value="2">2 PINs</SelectItem>
                    <SelectItem value="5">5 PINs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Order summary */}
            {canProceed && selectedPlan && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-1.5 text-sm">
                <p className="font-semibold text-blue-900 mb-2">Order Summary</p>
                <div className="flex justify-between text-blue-800">
                  <span>Exam Body</span><span className="font-medium">{examBody}</span>
                </div>
                <div className="flex justify-between text-blue-800">
                  <span>Reg. Number</span><span className="font-medium">{regNumber}</span>
                </div>
                {studentName && (
                  <div className="flex justify-between text-blue-800">
                    <span>Name</span><span className="font-medium">{studentName}</span>
                  </div>
                )}
                <div className="flex justify-between text-blue-800">
                  <span>Plan</span><span className="font-medium">{selectedPlan.plan_name}</span>
                </div>
                {Number(quantity) > 1 && (
                  <div className="flex justify-between text-blue-800 text-xs">
                    <span>{quantity} × {formatNaira(selectedPlan.retail_price)}</span>
                  </div>
                )}
                <div className="flex justify-between text-blue-900 font-bold pt-1 border-t border-blue-200">
                  <span>Total</span><span>{formatNaira(total)}</span>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full h-14 text-lg"
              disabled={!canProceed || buyEducation.isPending}>
              {buyEducation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyEducation.isPending
                ? "Processing..."
                : verifyState === "loading"
                ? "Verifying registration number..."
                : !selectedPlan || verifyState !== "ok"
                ? "Enter registration number above"
                : `Pay ${formatNaira(total)}`}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal open={isPinModalOpen} onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase} amount={total} actionTitle="Confirm Exam PIN Purchase" />
    </div>
  );
}
