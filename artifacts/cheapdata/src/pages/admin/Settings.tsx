import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useAdminGetSettings, useAdminUpdateSettings, useAdminTestPaystack, useAdminTestBrevo,
  useAdminTestFlutterwave, getAdminGetSettingsQueryKey,
} from "@/lib/supabase-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle, FlaskConical } from "lucide-react";

// Secret field with show/hide toggle and "saved" indicator
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

// Inline result banner shown after a test
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
};

export default function AdminSettings() {
  const { data: settings, isLoading } = useAdminGetSettings();
  const updateSettings = useAdminUpdateSettings();
  const testPaystack = useAdminTestPaystack();
  const testBrevo = useAdminTestBrevo();
  const testFlutterwave = useAdminTestFlutterwave();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [paystackResult, setPaystackResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [flutterwaveResult, setFlutterwaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [brevoResult, setBrevoResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { register, handleSubmit, reset } = useForm<SettingsForm>({
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
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        active_payment_gateway: settings.active_payment_gateway ?? "paystack",
        admin_email: settings.admin_email ?? "",
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
      });
    }
  }, [settings, reset]);

  const onSubmit = (data: SettingsForm) => {
    updateSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Settings Saved", description: "All settings updated successfully." });
        queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["public-settings"] });
      },
      onError: (err: any) => {
        toast({ title: "Save Failed", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleTestPaystack = () => {
    setPaystackResult(null);
    testPaystack.mutate(undefined, {
      onSuccess: (message) => setPaystackResult({ ok: true, message: message as string }),
      onError: (err: any) => setPaystackResult({ ok: false, message: err.message }),
    });
  };

  const handleTestFlutterwave = () => {
    setFlutterwaveResult(null);
    testFlutterwave.mutate(undefined, {
      onSuccess: (message) => setFlutterwaveResult({ ok: true, message: message as string }),
      onError: (err: any) => setFlutterwaveResult({ ok: false, message: err.message }),
    });
  };

  const handleTestBrevo = () => {
    setBrevoResult(null);
    testBrevo.mutate(undefined, {
      onSuccess: (message) => setBrevoResult({ ok: true, message: message as string }),
      onError: (err: any) => setBrevoResult({ ok: false, message: err.message }),
    });
  };

  if (isLoading) {
    return <AdminLayout><div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AdminLayout>;
  }

  return (
    <AdminLayout>
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
                <Input id="admin_email" type="email" {...register("admin_email")} />
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
              <SecretInput id="paystack_secret_key" label="Secret Key" registration={register("paystack_secret_key")}
                hasSavedValue={!!settings?.paystack_secret_key} />
              <TestResult result={paystackResult} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestPaystack}
                disabled={testPaystack.isPending || !settings?.paystack_secret_key}
                className="flex items-center gap-2"
              >
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
              <SecretInput id="flutterwave_secret_key" label="Secret Key / Webhook Hash" registration={register("flutterwave_secret_key")}
                hasSavedValue={!!settings?.flutterwave_secret_key} />
              <p className="text-xs text-gray-400">The secret key is also used to verify Flutterwave webhook payloads.</p>
              <TestResult result={flutterwaveResult} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestFlutterwave}
                disabled={testFlutterwave.isPending || !settings?.flutterwave_secret_key}
                className="flex items-center gap-2"
              >
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
              <SecretInput id="cheapdatahub_api_key" label="API Key" registration={register("cheapdatahub_api_key")}
                hasSavedValue={!!settings?.cheapdatahub_api_key} />
              <div className="space-y-1.5">
                <Label htmlFor="cheapdatahub_funding_account">Funding Account Number</Label>
                <Input id="cheapdatahub_funding_account" placeholder="Account number for funding" {...register("cheapdatahub_funding_account")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cheapdatahub_base_url">Base URL</Label>
                <Input id="cheapdatahub_base_url" placeholder="https://www.cheapdatahub.com/api/v1" {...register("cheapdatahub_base_url")} />
              </div>
            </CardContent>
          </Card>

          {/* Brevo (Email) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Brevo Email
                <Badge variant="secondary" className="text-xs">Email Service</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SecretInput id="brevo_api_key" label="Brevo API Key" registration={register("brevo_api_key")}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestBrevo}
                disabled={testBrevo.isPending || !settings?.brevo_api_key}
                className="flex items-center gap-2"
              >
                {testBrevo.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                  : <><FlaskConical className="h-4 w-4" /> Send Test Email</>}
              </Button>
              {!settings?.brevo_api_key && (
                <p className="text-xs text-gray-400">Save your Brevo API key first to enable testing.</p>
              )}
              <p className="text-xs text-gray-400">Test email will be sent to the Admin Email address set in General settings.</p>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Saving...</> : "Save All Settings"}
          </Button>
        </form>
      </div>
    </AdminLayout>
  );
}
