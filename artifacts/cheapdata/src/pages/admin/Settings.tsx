import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAdminGetSettings, useAdminUpdateSettings, getAdminGetSettingsQueryKey } from "@/lib/supabase-hooks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings as SettingsIcon, Save, Eye, EyeOff, Mail, Zap, CreditCard, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  active_payment_gateway: z.string(),
  paystack_secret_key: z.string().optional(),
  flutterwave_secret_key: z.string().optional(),
  cheapdatahub_api_key: z.string().optional(),
  cheapdatahub_base_url: z.string().optional(),
  cheapdatahub_funding_account: z.string().optional(),
  brevo_api_key: z.string().optional(),
  brevo_sender_email: z.string().email().optional().or(z.literal("")),
  brevo_sender_name: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

function SecretInput({ label, name, placeholder, register, description }: any) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          {...register(name)}
          placeholder={placeholder}
          className="h-11 pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useAdminGetSettings({
    query: { queryKey: getAdminGetSettingsQueryKey() }
  });

  const updateSettings = useAdminUpdateSettings();

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      active_payment_gateway: "paystack",
      paystack_secret_key: "",
      flutterwave_secret_key: "",
      cheapdatahub_api_key: "",
      cheapdatahub_base_url: "",
      cheapdatahub_funding_account: "",
      brevo_api_key: "",
      brevo_sender_email: "",
      brevo_sender_name: "CheapDataHub",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        active_payment_gateway: settings.active_payment_gateway || "paystack",
        cheapdatahub_funding_account: settings.cheapdatahub_funding_account || "",
        cheapdatahub_base_url: settings.cheapdatahub_base_url || "",
        brevo_sender_email: settings.brevo_sender_email || "",
        brevo_sender_name: settings.brevo_sender_name || "CheapDataHub",
      });
    }
  }, [settings, form]);

  const onSubmit = (values: SettingsForm) => {
    updateSettings.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Saved", description: "Settings updated successfully." });
            queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
          } else {
            toast({ title: "Failed", description: data.message || "Could not save settings.", variant: "destructive" });
          }
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Unexpected error.", variant: "destructive" });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          System Settings
        </h1>
        <p className="text-gray-500 mt-1">Configure API keys and platform parameters. Keys are encrypted in Supabase.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* Payment Gateway */}
        <Card className="shadow-sm border-gray-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment Gateway
            </CardTitle>
            <CardDescription>Configure your payment processor for wallet funding</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Active Gateway</Label>
              <Select
                value={form.watch("active_payment_gateway")}
                onValueChange={(val) => form.setValue("active_payment_gateway", val)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select Gateway" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paystack">Paystack</SelectItem>
                  <SelectItem value="flutterwave">Flutterwave</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SecretInput
              label="Paystack Secret Key"
              name="paystack_secret_key"
              placeholder="sk_live_xxxxxxxxxx (leave blank to keep existing)"
              register={form.register}
              description="Your Paystack secret key from dashboard.paystack.com"
            />

            <SecretInput
              label="Flutterwave Secret Key"
              name="flutterwave_secret_key"
              placeholder="FLWSECK_TEST-xxxxxxxxxx (leave blank to keep existing)"
              register={form.register}
            />
          </CardContent>
        </Card>

        {/* VTU / Data Provider */}
        <Card className="shadow-sm border-gray-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              VTU Data Provider (CheapDataHub API)
            </CardTitle>
            <CardDescription>API credentials used to deliver data, airtime, cable, and electricity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecretInput
              label="API Key"
              name="cheapdatahub_api_key"
              placeholder="Your CheapDataHub API key (leave blank to keep existing)"
              register={form.register}
              description="Found in your CheapDataHub merchant dashboard"
            />

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">API Base URL</Label>
              <p className="text-xs text-gray-500">The root endpoint of your VTU provider's API</p>
              <Input
                {...form.register("cheapdatahub_base_url")}
                placeholder="https://cheapdatahub.com/api/v1"
                className="h-11"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bank Account */}
        <Card className="shadow-sm border-gray-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Funding Bank Account
            </CardTitle>
            <CardDescription>The bank account users will transfer funds to</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Account Details</Label>
              <p className="text-xs text-gray-500">Shown to users on the Fund Wallet page</p>
              <Input
                {...form.register("cheapdatahub_funding_account")}
                placeholder="e.g. 0123456789 — Wema Bank — CheapDataHub Ltd"
                className="h-11"
              />
            </div>
          </CardContent>
        </Card>

        {/* Brevo Email */}
        <Card className="shadow-sm border-gray-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Email Notifications (Brevo)
            </CardTitle>
            <CardDescription>Customers receive transaction alerts via Brevo transactional email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecretInput
              label="Brevo API Key"
              name="brevo_api_key"
              placeholder="xkeysib-xxxxxxxxxx (leave blank to keep existing)"
              register={form.register}
              description="Found in Brevo dashboard → SMTP & API → API Keys"
            />

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Sender Email Address</Label>
              <p className="text-xs text-gray-500">Must be a verified sender in your Brevo account</p>
              <Input
                type="email"
                {...form.register("brevo_sender_email")}
                placeholder="noreply@yourdomain.com"
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Sender Display Name</Label>
              <Input
                {...form.register("brevo_sender_name")}
                placeholder="CheapDataHub"
                className="h-11"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          className="w-full h-14 text-lg"
          disabled={updateSettings.isPending}
        >
          {updateSettings.isPending
            ? <><Loader2 className="h-5 w-5 animate-spin mr-2" />Saving...</>
            : <><Save className="h-5 w-5 mr-2" />Save All Settings</>
          }
        </Button>
      </form>
    </div>
  );
}
