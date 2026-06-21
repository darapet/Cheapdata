import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  useAdminGetSettings, useAdminUpdateSettings, getAdminGetSettingsQueryKey,
  useAdminTestPaystack, useAdminTestFlutterwave, useAdminTestBrevo,
  useAdminTestCheapDataHub, useAdminTopupCheapDataHub,
} from "@/lib/supabase-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle, FlaskConical, Info, Zap } from "lucide-react";

function SecretInput({
  id, label, placeholder, registration, hasSavedValue,
}: {
  id: string; label: string; placeholder?: string;
  registration: ReturnType<ReturnType<typeof useForm>["register"]>;
  hasSavedValue?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hasSavedValue && (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckCircle className="h-3 w-3" /> Key saved
          </span>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          placeholder={hasSavedValue ? "Leave blank to keep existing key" : (placeholder ?? "Enter key...")}
          className="pr-10"
          {...registration}
        />
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function TestResult({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
      result.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
    }`}>
      {result.ok
        ? <CheckCircle className="h-4 w-4 shrink-0" />
        : <XCircle className="h-4 w-4 shrink-0" />}
      {result.message}
    </div>
  );
}

type SettingsForm = {
  active_payment_gateway: string;
  admin_email: string;
  paystack_public_key: string;
  paystack_secret_key: string;
  flutterwave_public_key: string;
  flutterwave_secret_key: string;
  cheapdatahub_api_key: string;
  cheapdatahub_funding_account: string;
  cheapdatahub_base_url: string;
  brevo_api_key: string;
  brevo_sender_email: string;
  brevo_sender_name: string;
  cheapdatahub_bank_name: string;
  cheapdatahub_bank_code: string;
  cheapdatahub_bank_account: string;
  cheapdatahub_account_name: string;
  cheapdatahub_low_balance_threshold: number;
  cheapdatahub_topup_amount: number;
  cheapdatahub_auto_fund: boolean;
};

export default function AdminSettings() {
  const { data: settings, isLoading } = useAdminGetSettings();
  const updateSettings = useAdminUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const testPaystack = useAdminTestPaystack();
  const testFlutterwave = useAdminTestFlutterwave();
  const testBrevo = useAdminTestBrevo();
  const testCheapDataHub = useAdminTestCheapDataHub();
  const topupCheapDataHub = useAdminTopupCheapDataHub();

  const [paystackResult, setPaystackResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [flutterwaveResult, setFlutterwaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [brevoResult, setBrevoResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [cheapdatahubResult, setCheapdatahubResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [topupAmount, setTopupAmount] = useState(5000);

  const { register, handleSubmit, reset, watch } = useForm<SettingsForm>({
    defaultValues: {
      active_payment_gateway: "paystack",
      admin_email: "",
      paystack_public_key: "",
      paystack_secret_key: "",
      flutterwave_public_key: "",
      flutterwave_secret_key: "",
      cheapdatahub_api_key: "",
      cheapdatahub_funding_account: "",
      cheapdatahub_base_url: "",
      brevo_api_key: "",
      brevo_sender_email: "",
      brevo_sender_name: "CheapDataHub",
      cheapdatahub_bank_name: "",
      cheapdatahub_bank_code: "",
      cheapdatahub_bank_account: "",
      cheapdatahub_account_name: "",
      cheapdatahub_low_balance_threshold: 5000,
      cheapdatahub_topup_amount: 20000,
      cheapdatahub_auto_fund: false,
    },
  });

  const autoFundEnabled = watch("cheapdatahub_auto_fund");

  useEffect(() => {
    if (settings) {
      reset({
        active_payment_gateway: settings.active_payment_gateway ?? "paystack",
        admin_email: (settings as any).admin_email ?? "",
        paystack_public_key: settings.paystack_public_key ?? "",
        paystack_secret_key: settings.paystack_secret_key ?? "",
        flutterwave_public_key: settings.flutterwave_public_key ?? "",
        flutterwave_secret_key: settings.flutterwave_secret_key ?? "",
        cheapdatahub_api_key: settings.cheapdatahub_api_key ?? "",
        cheapdatahub_funding_account: settings.cheapdatahub_funding_account ?? "",
        cheapdatahub_base_url: settings.cheapdatahub_base_url ?? "",
        brevo_api_key: settings.brevo_api_key ?? "",
        brevo_sender_email: settings.brevo_sender_email ?? "",
        brevo_sender_name: settings.brevo_sender_name ?? "CheapDataHub",
        cheapdatahub_bank_name: (settings as any).cheapdatahub_bank_name ?? "",
        cheapdatahub_bank_code: (settings as any).cheapdatahub_bank_code ?? "",
        cheapdatahub_bank_account: (settings as any).cheapdatahub_bank_account ?? "",
        cheapdatahub_account_name: (settings as any).cheapdatahub_account_name ?? "",
        cheapdatahub_low_balance_threshold: (settings as any).cheapdatahub_low_balance_threshold ?? 5000,
        cheapdatahub_topup_amount: (settings as any).cheapdatahub_topup_amount ?? 20000,
        cheapdatahub_auto_fund: Boolean((settings as any).cheapdatahub_auto_fund),
      });
    }
  }, [settings, reset]);

  const onSubmit = (data: SettingsForm) => {
    updateSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Settings Saved", description: "All settings updated successfully." });
        queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Save Failed", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleTestPaystack = () => {
    setPaystackResult(null);
    testPaystack.mutate(undefined, {
      onSuccess: (msg) => setPaystackResult({ ok: true, message: msg as string }),
      onError: (err: any) => setPaystackResult({ ok: false, message: err.message }),
    });
  };

  const handleTestFlutterwave = () => {
    setFlutterwaveResult(null);
    testFlutterwave.mutate(undefined, {
      onSuccess: (msg) => setFlutterwaveResult({ ok: true, message: msg as string }),
      onError: (err: any) => setFlutterwaveResult({ ok: false, message: err.message }),
    });
  };

  const handleTestBrevo = () => {
    setBrevoResult(null);
    testBrevo.mutate(undefined, {
      onSuccess: (msg) => setBrevoResult({ ok: true, message: msg as string }),
      onError: (err: any) => setBrevoResult({ ok: false, message: err.message }),
    });
  };

  const handleTestCheapDataHub = () => {
    setCheapdatahubResult(null);
    testCheapDataHub.mutate(undefined, {
      onSuccess: (msg) => setCheapdatahubResult({ ok: true, message: msg as string }),
      onError: (err: any) => setCheapdatahubResult({ ok: false, message: err.message }),
    });
  };

  const handleManualTopup = () => {
    topupCheapDataHub.mutate({ amount: topupAmount }, {
      onSuccess: (msg) => toast({ title: "Transfer Initiated", description: msg as string }),
      onError: (err: any) => toast({ title: "Top-up Failed", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure payment gateways, APIs, and email</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* General */}
        <Card>
          <CardHeader><CardTitle className="text-base">General</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin_email">Admin Email</Label>
              <Input id="admin_email" type="email" placeholder="your@email.com" {...register("admin_email")} />
              <p className="text-xs text-gray-400">Test emails will be sent to this address.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Active Payment Gateway</Label>
              <div className="flex gap-3">
                {["paystack", "flutterwave"].map((g) => (
                  <label key={g} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={g} {...register("active_payment_gateway")} className="accent-primary" />
                    <span className="text-sm capitalize">{g}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Paystack */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Paystack
              <Badge variant="secondary" className="text-xs">Payment Gateway</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="paystack_public_key">Public Key</Label>
              <Input id="paystack_public_key" placeholder="pk_live_..." {...register("paystack_public_key")} />
            </div>
            <SecretInput id="paystack_secret_key" label="Secret Key"
              registration={register("paystack_secret_key")}
              hasSavedValue={!!settings?.paystack_secret_key} />
            <TestResult result={paystackResult} />
            <Button type="button" variant="outline" size="sm"
              onClick={handleTestPaystack} disabled={testPaystack.isPending || !settings?.paystack_secret_key}
              className="flex items-center gap-2">
              {testPaystack.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing...</>
                : <><FlaskConical className="h-4 w-4" /> Test Paystack Key</>}
            </Button>
            {!settings?.paystack_secret_key && (
              <p className="text-xs text-gray-400">Save your secret key first to enable testing.</p>
            )}
          </CardContent>
        </Card>

        {/* Flutterwave */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Flutterwave
              <Badge variant="secondary" className="text-xs">Payment Gateway</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="flutterwave_public_key">Public Key</Label>
              <Input id="flutterwave_public_key" placeholder="FLWPUBK_TEST-..." {...register("flutterwave_public_key")} />
            </div>
            <SecretInput id="flutterwave_secret_key" label="Secret Key"
              registration={register("flutterwave_secret_key")}
              hasSavedValue={!!settings?.flutterwave_secret_key} />
            <TestResult result={flutterwaveResult} />
            <Button type="button" variant="outline" size="sm"
              onClick={handleTestFlutterwave} disabled={testFlutterwave.isPending || !settings?.flutterwave_secret_key}
              className="flex items-center gap-2">
              {testFlutterwave.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing...</>
                : <><FlaskConical className="h-4 w-4" /> Test Flutterwave Key</>}
            </Button>
            {!settings?.flutterwave_secret_key && (
              <p className="text-xs text-gray-400">Save your secret key first to enable testing.</p>
            )}
          </CardContent>
        </Card>

        {/* CheapDataHub API */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              CheapDataHub API
              <Badge variant="secondary" className="text-xs">Services Provider</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecretInput id="cheapdatahub_api_key" label="API Key"
              registration={register("cheapdatahub_api_key")}
              hasSavedValue={!!settings?.cheapdatahub_api_key} />
            <div className="space-y-1.5">
              <Label htmlFor="cheapdatahub_funding_account">Your CheapDataHub Account Number</Label>
              <Input id="cheapdatahub_funding_account" placeholder="Account number users pay to fund wallet" {...register("cheapdatahub_funding_account")} />
              <p className="text-xs text-gray-400">This is the bank account users pay into to fund their wallet (your CheapDataHub virtual account).</p>
            </div>
            <TestResult result={cheapdatahubResult} />
            <Button type="button" variant="outline" size="sm"
              onClick={handleTestCheapDataHub} disabled={testCheapDataHub.isPending || !settings?.cheapdatahub_api_key}
              className="flex items-center gap-2">
              {testCheapDataHub.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking...</>
                : <><FlaskConical className="h-4 w-4" /> Test API Key & Check Balance</>}
            </Button>
            {!settings?.cheapdatahub_api_key && (
              <p className="text-xs text-gray-400">Save your API key first to enable testing.</p>
            )}
          </CardContent>
        </Card>

        {/* Auto-Funding */}
        <Card className="border-blue-100 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600" />
              Auto-Funding — How Your Money Splits
              <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">Optional</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Explanation */}
            <div className="rounded-lg border border-blue-200 bg-white p-4 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm text-gray-700 space-y-1">
                  <p className="font-semibold text-gray-900">How the money flow works:</p>
                  <p>① User pays ₦300 for MTN 1GB → goes into <strong>your Paystack account</strong></p>
                  <p>② CheapDataHub delivers the data → deducts <strong>~₦228</strong> from your CheapDataHub wallet</p>
                  <p>③ Your profit (<strong>₦72</strong>) stays in Paystack automatically</p>
                  <p className="text-blue-700 font-medium mt-2">Enable Auto-Funding below so the system automatically transfers ₦228 back to CheapDataHub's bank account after each delivery — so your CheapDataHub wallet never runs dry.</p>
                </div>
              </div>
            </div>

            {/* Toggle */}
            <div className="flex items-center gap-3">
              <input type="checkbox" id="cheapdatahub_auto_fund" {...register("cheapdatahub_auto_fund")}
                className="h-4 w-4 accent-primary cursor-pointer" />
              <Label htmlFor="cheapdatahub_auto_fund" className="cursor-pointer">
                Enable Auto-Funding (automatically transfer wholesale cost to CheapDataHub after each service)
              </Label>
            </div>

            {autoFundEnabled && (
              <div className="space-y-4 rounded-lg border border-blue-200 bg-white p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CheapDataHub Bank Details (from their dashboard → Fund Wallet)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cheapdatahub_account_name">Account Name</Label>
                    <Input id="cheapdatahub_account_name" placeholder="e.g. CheapDataHub Ltd" {...register("cheapdatahub_account_name")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cheapdatahub_bank_name">Bank Name</Label>
                    <Input id="cheapdatahub_bank_name" placeholder="e.g. Access Bank" {...register("cheapdatahub_bank_name")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cheapdatahub_bank_account">Account Number</Label>
                    <Input id="cheapdatahub_bank_account" placeholder="10-digit account number" {...register("cheapdatahub_bank_account")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cheapdatahub_bank_code">Bank Code</Label>
                    <Input id="cheapdatahub_bank_code" placeholder="e.g. 044 (Access), 058 (GTB)" {...register("cheapdatahub_bank_code")} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cheapdatahub_low_balance_threshold">Low Balance Alert (₦)</Label>
                    <Input id="cheapdatahub_low_balance_threshold" type="number" placeholder="5000" {...register("cheapdatahub_low_balance_threshold", { valueAsNumber: true })} />
                    <p className="text-xs text-gray-400">Warn when CheapDataHub balance drops below this.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cheapdatahub_topup_amount">Auto Top-up Amount (₦)</Label>
                    <Input id="cheapdatahub_topup_amount" type="number" placeholder="20000" {...register("cheapdatahub_topup_amount", { valueAsNumber: true })} />
                    <p className="text-xs text-gray-400">Amount to transfer when balance is low.</p>
                  </div>
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  ⚠️ Requires Paystack Transfers to be enabled on your Paystack dashboard (Business → Transfers). Once enabled, transfers happen automatically after each service.
                </p>
              </div>
            )}

            {/* Manual top-up */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Manual Top-up — Send funds to CheapDataHub now</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label>Amount (₦)</Label>
                  <Input type="number" value={topupAmount} onChange={(e) => setTopupAmount(Number(e.target.value))} placeholder="5000" />
                </div>
                <Button type="button" variant="outline" onClick={handleManualTopup}
                  disabled={topupCheapDataHub.isPending || !(settings as any)?.cheapdatahub_bank_account}
                  className="flex items-center gap-2 h-10">
                  {topupCheapDataHub.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                    : <><Zap className="h-4 w-4" /> Transfer to CheapDataHub</>}
                </Button>
              </div>
              {!(settings as any)?.cheapdatahub_bank_account && (
                <p className="text-xs text-gray-400">Add CheapDataHub bank details above and save to enable transfers.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Brevo Email */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Brevo Email
              <Badge variant="secondary" className="text-xs">Email Service</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecretInput id="brevo_api_key" label="Brevo API Key"
              registration={register("brevo_api_key")}
              hasSavedValue={!!settings?.brevo_api_key} />
            <div className="space-y-1.5">
              <Label htmlFor="brevo_sender_email">Sender Email</Label>
              <Input id="brevo_sender_email" type="email" placeholder="noreply@yourdomain.com" {...register("brevo_sender_email")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brevo_sender_name">Sender Name</Label>
              <Input id="brevo_sender_name" placeholder="CheapDataHub" {...register("brevo_sender_name")} />
            </div>
            <TestResult result={brevoResult} />
            <Button type="button" variant="outline" size="sm"
              onClick={handleTestBrevo} disabled={testBrevo.isPending || !settings?.brevo_api_key}
              className="flex items-center gap-2">
              {testBrevo.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                : <><FlaskConical className="h-4 w-4" /> Send Test Email</>}
            </Button>
            {!settings?.brevo_api_key && (
              <p className="text-xs text-gray-400">Save your Brevo API key first to enable testing.</p>
            )}
          </CardContent>
        </Card>

        <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={updateSettings.isPending}>
          {updateSettings.isPending
            ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Saving...</>
            : "Save All Settings"}
        </Button>
      </form>
    </div>
  );
}
