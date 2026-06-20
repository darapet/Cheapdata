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

const DISCOS = [
  "EKEDC", "IKEDC", "AEDC", "PHEDC", "EEDC", "BEDC", "KEDCO", "JED", "YEDC", "KAEDCO",
];
const QUICK_AMOUNTS = [1000, 2000, 3000, 5000, 10000, 20000];

type FormData = {
  meter_number: string;
  disco: string;
  amount: number;
  meter_type: "prepaid" | "postpaid";
};

export default function Electricity() {
  const [pinOpen, setPinOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);
  const { data: profile } = useGetProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { disco: "EKEDC", amount: 1000, meter_type: "prepaid" },
  });
  const amount = watch("amount");

  const onFormSubmit = (data: FormData) => {
    setPendingData(data);
    setPinOpen(true);
  };

  const executePurchase = async () => {
    if (!pendingData) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.BASE_URL}api/services/electricity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(pendingData),
      });
      const result = await res.json();
      if (result.success) {
        const msg = result.token ? `Token: ${result.token}` : result.message;
        toast({ title: "Electricity Token!", description: msg });
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

  return (
    <AppLayout>
      <PinPromptModal open={pinOpen} onOpenChange={setPinOpen} onSuccess={executePurchase}
        amount={Number(amount)} actionTitle="Confirm Electricity Purchase" />
      <div className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Electricity</h1>
          <p className="text-sm text-gray-500 mt-1">Balance: <span className="font-semibold text-primary">{formatNaira(profile?.wallet_balance ?? 0)}</span></p>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Electricity Provider (DISCO)</Label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  {...register("disco", { required: true })}>
                  {DISCOS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Meter Number</Label>
                <Input placeholder="Enter meter number"
                  {...register("meter_number", { required: "Meter number is required" })} />
                {errors.meter_number && <p className="text-xs text-red-500">{errors.meter_number.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Meter Type</Label>
                <div className="flex gap-3">
                  {["prepaid", "postpaid"].map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value={t} {...register("meter_type")} className="accent-primary" />
                      <span className="text-sm capitalize">{t}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Amount (₦)</Label>
                <Input type="number" min={1000} placeholder="1000"
                  {...register("amount", { required: "Amount is required", min: { value: 1000, message: "Minimum is ₦1,000" } })} />
                {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <button key={a} type="button" onClick={() => setValue("amount", a)}
                      className={`px-3 py-1 rounded-lg text-xs border transition-colors ${Number(amount) === a ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200"}`}>
                      ₦{a.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading || (profile?.wallet_balance ?? 0) < Number(amount)}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : `Pay ₦${Number(amount).toLocaleString()}`}
          </Button>
          {(profile?.wallet_balance ?? 0) < Number(amount) && (
            <p className="text-center text-sm text-red-500">Insufficient balance</p>
          )}
        </form>
      </div>
    </AppLayout>
  );
}
