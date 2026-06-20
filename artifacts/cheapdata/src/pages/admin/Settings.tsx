import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAdminGetSettings, useAdminUpdateSettings, getAdminGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings as SettingsIcon, Save } from "lucide-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  active_payment_gateway: z.string(),
  paystack_secret_key: z.string().optional(),
  flutterwave_secret_key: z.string().optional(),
  cheapdatahub_api_key: z.string().optional(),
  cheapdatahub_funding_account: z.string().optional(),
  brevo_api_key: z.string().optional(),
});

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useAdminGetSettings({
    query: { queryKey: getAdminGetSettingsQueryKey() }
  });

  const updateSettings = useAdminUpdateSettings();

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      active_payment_gateway: "paystack",
      paystack_secret_key: "",
      flutterwave_secret_key: "",
      cheapdatahub_api_key: "",
      cheapdatahub_funding_account: "",
      brevo_api_key: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        active_payment_gateway: settings.active_payment_gateway || "paystack",
        cheapdatahub_funding_account: settings.cheapdatahub_funding_account || "",
      });
    }
  }, [settings, form]);

  const onSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateSettings.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success", description: "System settings updated successfully" });
            queryClient.invalidateQueries({ queryKey: getAdminGetSettingsQueryKey() });
          } else {
            toast({ title: "Update Failed", description: data.message || "Failed to update", variant: "destructive" });
          }
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "An unexpected error occurred", variant: "destructive" });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          System Settings
        </h1>
        <p className="text-gray-500 mt-1">Configure global application parameters and API keys</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Update payment gateways and third-party API credentials</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Payment Gateway</h3>
              
              <div className="space-y-2">
                <Label>Active Gateway</Label>
                <Select 
                  value={form.watch("active_payment_gateway")} 
                  onValueChange={(val) => form.setValue("active_payment_gateway", val)}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select Gateway" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paystack">Paystack</SelectItem>
                    <SelectItem value="flutterwave">Flutterwave</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Paystack Secret Key</Label>
                <Input 
                  type="password" 
                  {...form.register("paystack_secret_key")} 
                  placeholder="Leave blank to keep unchanged" 
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label>Flutterwave Secret Key</Label>
                <Input 
                  type="password" 
                  {...form.register("flutterwave_secret_key")} 
                  placeholder="Leave blank to keep unchanged"
                  className="h-12"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="text-lg font-semibold border-b pb-2">Platform Details</h3>
              
              <div className="space-y-2">
                <Label>Funding Account (Displayed to Users)</Label>
                <Input 
                  {...form.register("cheapdatahub_funding_account")} 
                  placeholder="e.g. 0123456789 Wema Bank"
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label>VTU API Key (Underlying Provider)</Label>
                <Input 
                  type="password" 
                  {...form.register("cheapdatahub_api_key")} 
                  placeholder="Leave blank to keep unchanged"
                  className="h-12"
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-14 text-lg mt-6" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
              {updateSettings.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
