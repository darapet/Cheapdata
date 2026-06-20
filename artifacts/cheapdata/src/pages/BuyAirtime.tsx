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

const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"];
const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

type FormData = { phone: string; network: string; amount: number };

export default function BuyAirtime() {
  const [network, setNetwork] = useState("MTN");
  const [pinOpen, setPinOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);
  const { data: profile } = useGetProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { phone: "", amount: 100 },
  });
  const amount = watch("amount");

  const onFormSubmit = (data: FormData) => {
    setPendingData({ ...data, network });
    setPinOpen(true);
  };

  const executePurchase = async () => {
    if (!pendingData) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.BASE_URL}api/services/airtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(pendingData),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Airtime Sent!", description: result.message });
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
        amount={Number(amount)} actionTitle="Confirm Airtime Purchase" />
      <div className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buy Airtime</h1>
          <p className="text-sm text-gray-500 mt-1">Balance: <span className="font-semibold text-primary">{formatNaira(profile?.wallet_balance ?? 0)}</span></p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {NETWORKS.map((n) => (
            <button key={n} onClick={() => setNetwork(n)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${network === n ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary"}`}>
              {n}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input type="tel" placeholder="08012345678"
                  {...register("phone", { required: "Phone is required", minLength: { value: 10, message: "Invalid phone number" } })} />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Amount (₦)</Label>
                <Input type="number" min={50} max={50000} placeholder="100"
                  {...register("amount", { required: "Amount is required", min: { value: 50, message: "Minimum is ₦50" } })} />
                {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <button key={a} type="button" onClick={() => setValue("amount", a)}
                      className={`px-3 py-1 rounded-lg text-xs border transition-colors ${Number(amount) === a ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary"}`}>
                      ₦{a.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading || (profile?.wallet_balance ?? 0) < Number(amount)}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : `Buy ₦${Number(amount).toLocaleString()} Airtime`}
          </Button>
          {(profile?.wallet_balance ?? 0) < Number(amount) && (
            <p className="text-center text-sm text-red-500">Insufficient wallet balance</p>
          )}
        </form>
      </div>
    </AppLayout>
  );
}
