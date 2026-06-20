import { useState } from "react";
import { useForm } from "react-hook-form";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetProfile, useUpdateProfile, useSetupPin, getGetProfileQueryKey } from "@/lib/supabase-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatNaira } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { Loader2, User, Lock, LogOut, Shield } from "lucide-react";

export default function Profile() {
  const { data: profile, isLoading } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const setupPin = useSetupPin();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [changingPin, setChangingPin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm({
    values: { full_name: profile?.full_name ?? "", phone: profile?.phone ?? "" },
  });

  const onSaveProfile = async (data: { full_name: string; phone: string }) => {
    updateProfile.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Profile Updated" });
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const onChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) return toast({ title: "Error", description: "PIN must be 4 digits", variant: "destructive" });
    if (pin !== confirmPin) return toast({ title: "Error", description: "PINs do not match", variant: "destructive" });
    setupPin.mutate({ data: { pin } }, {
      onSuccess: () => {
        toast({ title: "PIN Updated!" });
        setPin(""); setConfirmPin(""); setChangingPin(false);
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      },
      onError: () => toast({ title: "Error", description: "Failed to update PIN", variant: "destructive" }),
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  if (isLoading) {
    return <AppLayout><div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account settings</p>
        </div>

        {/* Wallet summary */}
        <div className="bg-gradient-to-br from-primary to-violet-700 rounded-2xl p-5 text-white">
          <p className="text-sm text-white/70">Wallet Balance</p>
          <p className="text-3xl font-bold mt-1">{formatNaira(profile?.wallet_balance ?? 0)}</p>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
              {profile?.full_name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div>
              <p className="text-sm font-medium">{profile?.full_name}</p>
              <p className="text-xs text-white/60">{profile?.email}</p>
            </div>
          </div>
        </div>

        {/* Edit profile */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" /> Personal Info</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSaveProfile)} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input {...register("full_name", { required: "Name is required" })} />
                {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input {...register("phone")} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile?.email ?? ""} disabled className="bg-gray-50" />
              </div>
              <Button type="submit" disabled={updateProfile.isPending || !isDirty} className="w-full">
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change PIN */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" /> Transaction PIN</CardTitle></CardHeader>
          <CardContent>
            {!changingPin ? (
              <Button variant="outline" onClick={() => setChangingPin(true)} className="w-full">
                <Lock className="h-4 w-4 mr-2" />{profile?.transaction_pin ? "Change PIN" : "Set PIN"}
              </Button>
            ) : (
              <form onSubmit={onChangePin} className="space-y-4">
                <div className="space-y-2">
                  <Label>New PIN</Label>
                  <Input type="password" inputMode="numeric" maxLength={4} value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0000" className="text-center text-2xl tracking-[1em]" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm PIN</Label>
                  <Input type="password" inputMode="numeric" maxLength={4} value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0000" className="text-center text-2xl tracking-[1em]" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setChangingPin(false)} className="flex-1">Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={setupPin.isPending}>
                    {setupPin.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save PIN"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Logout */}
        <Button variant="destructive" className="w-full" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" /> Logout
        </Button>
      </div>
    </AppLayout>
  );
}
