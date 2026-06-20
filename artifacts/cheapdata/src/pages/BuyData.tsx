import { useState } from "react";
import { useForm } from "react-hook-form";
import { AppLayout } from "@/components/layout/AppLayout";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useGetDataPlans, useGetProfile } from "@/lib/supabase-hooks";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatNaira } from "@/lib/utils";
import { Loader2, Wifi } from "lucide-react";

const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"];

type FormData = { phone: string; network: string };

export default function BuyData() {
  const [network, setNetwork] = useState("MTN");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { data: plans, isLoading } = useGetDataPlans(network);
  const { data: profile } = useGetProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormData>({
    defaultValues: { network: "MTN", phone: "" },
  });

  const onFormSubmit = (plan: any) => {
    setSelectedPlan(plan);
    setPinOpen(true);
  };

  const executePurchase = async () => {
    if (!selectedPlan) return;
    const { phone } = getValues();
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.BASE_URL}api/services/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ phone, plan_id: selectedPlan.plan_id, network, pin: "verified" }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Data Purchased!", description: result.message });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      } else {
        toast({ title: "Purchase Failed", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <AppLayout>
      <PinPromptModal open={pinOpen} onOpenChange={setPinOpen} onSuccess={executePurchase}
        amount={selectedPlan?.retail_price} actionTitle="Confirm Data Purchase" />
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buy Data</h1>
          <p className="text-sm text-gray-500 mt-1">
            Balance: <span className="font-semibold text-primary">{formatNaira(profile?.wallet_balance ?? 0)}</span>
          </p>
        </div>

        {/* Network selector */}
        <div className="flex gap-2 flex-wrap">
          {NETWORKS.map((n) => (
            <button key={n} onClick={() => setNetwork(n)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${network === n ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary"}`}>
              {n}
            </button>
          ))}
        </div>

        {/* Phone number */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label htmlFor="phone">Phone Number</Label>
            <Input id="phone" type="tel" placeholder="e.g. 08012345678"
              {...register("phone", { required: "Phone number is required", minLength: { value: 10, message: "Enter a valid phone number" } })} />
            {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
          </CardContent>
        </Card>

        {/* Plans */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3">{network} Data Plans</h3>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : plans?.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wifi className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No plans available for {network}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plans?.map((plan) => (
                <button key={plan.id} onClick={handleSubmit(() => onFormSubmit(plan))}
                  disabled={loading || (profile?.wallet_balance ?? 0) < plan.retail_price}
                  className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-primary hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-gray-900">{plan.data_size}</span>
                    <span className="font-bold text-primary">{formatNaira(plan.retail_price)}</span>
                  </div>
                  <p className="text-xs text-gray-400">{plan.validity} validity</p>
                  {(profile?.wallet_balance ?? 0) < plan.retail_price && (
                    <p className="text-xs text-red-400 mt-1">Insufficient balance</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
