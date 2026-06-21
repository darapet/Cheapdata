import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  useAdminGetSettings, useAdminUpdateSettings, getAdminGetSettingsQueryKey,
} from "@/lib/supabase-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle, FlaskConical } from "lucide-react";

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
};

export default function AdminSettings() {
  const { data: settings, isLoading } = useAdminGetSettings();
  const updateSettings = useAdminUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [paystackResult, setPaystackResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [flutterwaveResult, setFlutterwaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [brevoResult, setBrevoResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [paystackTesting, setPaystackTesting] = useState(false);
  const [flutterwaveTesting, setFlutterwaveTesting] = useState(false);
  const [brevoTesting, setBrevoTesting] = useState(false);

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

  const handleTestPaystack = async () => {
    const key = settings?.paystack_secret_key;
    if (!key) return setPaystackResult({ ok: false, message: "Save your Paystack secret key first." });
    setPaystackResult(null);
    setPaystackTesting(true);
    try {
      const res = await fetch("https://api.paystack.co/bank", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        setPaystackResult({ ok: true, message: "Paystack key is valid! Connection successful." });
      } else {
        const body = await res.json().catch(() => ({}));
        setPaystackResult({ ok: false, message: (body as any).message ?? "Invalid Paystack key." });
      }
    } catch (e: any) {
      setPaystackResult({ ok: false, message: "Network error: " + e.message });
    } finally {
      setPaystackTesting(false);
    }
  };

  const handleTestFlutterwave = async () => {
    const key = settings?.flutterwave_secret_key;
    if (!key) return setFlutterwaveResult({ ok: false, message: "Save your Flutterwave secret key first." });
    setFlutterwaveResult(null);
    setFlutterwaveTesting(true);
    try {
      const res = await fetch("https://api.flutterwave.com/v3/banks/NG", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        setFlutterwaveResult({ ok: true, message: "Flutterwave key is valid! Connection successful." });
      } else {
        const body = await res.json().catch(() => ({}));
        setFlutterwaveResult({ ok: false, message: (body as any).message ?? "Invalid Flutterwave key." });
      }
    } catch (e: any) {
      setFlutterwaveResult({ ok: false, message: "Network error: " + e.message });
    } finally {
      setFlutterwaveTesting(false);
    }
  };

  const handleTestBrevo = async () => {
    const key = settings?.brevo_api_key;
    const senderEmail = settings?.brevo_sender_email;
    const senderName = settings?.brevo_sender_name || "CheapDataHub";
    const adminEmail = (settings as any)?.admin_email;
    if (!key) return setBrevoResult({ ok: false, message: "Save your Brevo API key first." });
    if (!senderEmail) return setBrevoResult({ ok: false, message: "Set your Sender Email first, then save." });
    if (!adminEmail) return setBrevoResult({ ok: false, message: "Set your Admin Email in General settings first, then save." });
    setBrevoResult(null);
    setBrevoTesting(true);
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": key },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: adminEmail, name: "Admin" }],
          subject: "CheapDataHub — Test Email",
          htmlContent: "<h2 style='color:#16a34a'>✅ Email is working!</h2><p>Your Brevo email integration is configured correctly. Users will receive emails from <strong>" + senderName + "</strong>.</p>",
        }),
      });
      if (res.ok || res.status === 201) {
        setBrevoResult({ ok: true, message: `Test email sent to ${adminEmail} — check your inbox!` });
      } else {
        const body = await res.json().catch(() => ({}));
        setBrevoResult({ ok: false, message: (body as any).message ?? "Failed to send test email." });
      }
    } catch (e: any) {
      setBrevoResult({ ok: false, message: "Network error: " + e.message });
    } finally {
      setBrevoTesting(false);
    }
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
              onClick={handleTestPaystack} disabled={paystackTesting || !settings?.paystack_secret_key}
              className="flex items-center gap-2">
              {paystackTesting
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
              onClick={handleTestFlutterwave} disabled={flutterwaveTesting || !settings?.flutterwave_secret_key}
              className="flex items-center gap-2">
              {flutterwaveTesting
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
              <Label htmlFor="cheapdatahub_funding_account">Funding Account Number</Label>
              <Input id="cheapdatahub_funding_account" placeholder="Account number for wallet funding" {...register("cheapdatahub_funding_account")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cheapdatahub_base_url">Base URL</Label>
              <Input id="cheapdatahub_base_url" placeholder="https://www.cheapdatahub.com/api/v1" {...register("cheapdatahub_base_url")} />
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
              onClick={handleTestBrevo} disabled={brevoTesting || !settings?.brevo_api_key}
              className="flex items-center gap-2">
              {brevoTesting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                : <><FlaskConical className="h-4 w-4" /> Send Test Email</>}
            </Button>
            {!settings?.brevo_api_key && (
              <p className="text-xs text-gray-400">Save your Brevo API key first to enable testing.</p>
            )}
            <p className="text-xs text-gray-400">Test email goes to the Admin Email set above.</p>
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
