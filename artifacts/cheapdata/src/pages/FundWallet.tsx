import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetProfile, useInitializeFunding, useGetPublicSettings } from "@/lib/supabase-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatNaira } from "@/lib/utils";
import { Loader2, CreditCard, AlertCircle } from "lucide-react";

declare global {
  interface Window {
    PaystackPop: { setup: (opts: Record<string, unknown>) => { openIframe: () => void } };
    FlutterwaveCheckout: (opts: Record<string, unknown>) => void;
  }
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];
const FEE = 50;

export default function FundWallet() {
  const { data: profile } = useGetProfile();
  const { data: settings } = useGetPublicSettings();
  const initialize = useInitializeFunding();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<{ amount: number; gateway: "paystack" | "flutterwave" }>({
    defaultValues: { amount: 1000, gateway: "paystack" },
  });
  const amount = watch("amount");
  const gateway = watch("gateway");

  // Load payment SDK
  useEffect(() => {
    const active = settings?.active_payment_gateway ?? "paystack";
    if (active === "paystack" && !document.getElementById("paystack-sdk")) {
      const s = document.createElement("script"); s.id = "paystack-sdk";
      s.src = "https://js.paystack.co/v1/inline.js"; document.body.appendChild(s);
    }
    if (active === "flutterwave" && !document.getElementById("flw-sdk")) {
      const s = document.createElement("script"); s.id = "flw-sdk";
      s.src = "https://checkout.flutterwave.com/v3.js"; document.body.appendChild(s);
    }
  }, [settings]);

  const onSubmit = async (data: { amount: number; gateway: "paystack" | "flutterwave" }) => {
    const activeGateway = (settings?.active_payment_gateway as "paystack" | "flutterwave") ?? "paystack";
    initialize.mutate({ data: { amount: Number(data.amount), gateway: activeGateway } }, {
      onSuccess: (result) => {
        if (result.gateway === "paystack") {
          const handler = window.PaystackPop.setup({
            key: result.public_key,
            email: profile?.email,
            amount: result.amount,
            ref: result.reference,
            currency: "NGN",
            onSuccess: () => {
              toast({ title: "Payment Received!", description: "Your wallet will be credited shortly." });
              queryClient.invalidateQueries({ queryKey: ["profile"] });
              queryClient.invalidateQueries({ queryKey: ["transactions"] });
            },
            onClose: () => toast({ title: "Payment Cancelled", variant: "destructive" }),
          });
          handler.openIframe();
        } else {
          window.FlutterwaveCheckout({
            public_key: result.public_key,
            tx_ref: result.reference,
            amount: result.amount,
            currency: "NGN",
            customer: { email: profile?.email, name: profile?.full_name, phonenumber: profile?.phone },
            customizations: { title: "CheapDataHub", description: "Wallet Funding" },
            callback: () => {
              toast({ title: "Payment Received!", description: "Your wallet will be credited shortly." });
              queryClient.invalidateQueries({ queryKey: ["profile"] });
              queryClient.invalidateQueries({ queryKey: ["transactions"] });
            },
            onclose: () => toast({ title: "Payment Cancelled", variant: "destructive" }),
          });
        }
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fund Wallet</h1>
          <p className="text-sm text-gray-500 mt-1">
            Current balance: <span className="font-semibold text-primary">{formatNaira(profile?.wallet_balance ?? 0)}</span>
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">A processing fee of ₦{FEE} applies to each funding transaction.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Amount to Fund (₦)</Label>
                <Input type="number" min={100} placeholder="1000"
                  {...register("amount", { required: "Amount is required", min: { value: 100, message: "Minimum is ₦100" } })} />
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

              {Number(amount) > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-500"><span>Amount</span><span>{formatNaira(Number(amount))}</span></div>
                  <div className="flex justify-between text-gray-500"><span>Processing fee</span><span>{formatNaira(FEE)}</span></div>
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1 mt-1"><span>Total charge</span><span>{formatNaira(Number(amount) + FEE)}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={initialize.isPending}>
            {initialize.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <><CreditCard className="h-5 w-5 mr-2" /> Pay {Number(amount) > 0 ? formatNaira(Number(amount) + FEE) : ""}</>
            )}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
