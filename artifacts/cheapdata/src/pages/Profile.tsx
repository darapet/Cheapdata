import { useState, useEffect } from "react";
import { useGetProfile, useUpdateProfile, getGetProfileQueryKey } from "@/lib/supabase-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  User, Mail, Phone, MapPin, Calendar, ShieldCheck,
  KeyRound, Pencil, X, Save, Loader2, Wallet
} from "lucide-react";
import { format } from "date-fns";
import { ResetPinModal } from "@/components/ResetPinModal";

export default function Profile() {
  const { data: profile, isLoading } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey() },
  });
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [resetPinOpen, setResetPinOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        phone: (profile as any).phone ?? "",
        address: (profile as any).address ?? "",
      });
    }
  }, [profile]);

  const handleSave = () => {
    if (!form.full_name.trim()) {
      toast({ title: "Error", description: "Full name cannot be empty", variant: "destructive" });
      return;
    }
    updateProfile.mutate(
      { data: form },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
          setEditing(false);
          toast({ title: "Profile updated ✅", description: "Your details have been saved." });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to update profile", variant: "destructive" });
        },
      }
    );
  };

  const handleCancel = () => {
    setEditing(false);
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        phone: (profile as any).phone ?? "",
        address: (profile as any).address ?? "",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!profile) return null;

  const initials = (profile.full_name ?? "U")
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <User className="h-6 w-6 text-primary" />
            My Profile
          </h1>
          <p className="text-gray-500 mt-1">Manage your account details and security</p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Edit Profile
          </Button>
        )}
      </div>

      {/* Avatar / banner card */}
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="h-24 bg-gradient-to-r from-primary to-red-400" />
        <CardContent className="pt-0 pb-6 relative">
          <div className="w-20 h-20 bg-white rounded-full p-1 -mt-10 border-4 border-white shadow-sm flex items-center justify-center">
            <div className="w-full h-full bg-red-100 text-primary rounded-full flex items-center justify-center text-2xl font-bold select-none">
              {initials}
            </div>
          </div>
          <div className="mt-3 flex items-start justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{profile.full_name}</h2>
              <p className="text-gray-500 text-sm">{profile.email}</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium border border-green-200">
              <ShieldCheck className="h-4 w-4" />
              Verified
            </div>
          </div>

          {/* Wallet balance pill */}
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl border border-gray-200">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-sm text-gray-500">Wallet Balance:</span>
            <span className="font-bold text-gray-900">{formatNaira(profile.wallet_balance ?? 0)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Account Information */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Account Information</CardTitle>
          {editing && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1 text-gray-500">
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateProfile.isPending} className="gap-1">
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Full Name */}
          <div className="space-y-1">
            <Label className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <User className="h-4 w-4" /> Full Name
            </Label>
            {editing ? (
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Your full name"
                className="h-11"
                autoFocus
              />
            ) : (
              <p className="font-semibold text-gray-900 text-base">{profile.full_name || "—"}</p>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1">
            <Label className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email Address
              <span className="text-xs text-gray-400 font-normal">(cannot change)</span>
            </Label>
            <p className="font-semibold text-gray-900 text-base">{profile.email}</p>
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <Label className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Phone className="h-4 w-4" /> Phone Number
            </Label>
            {editing ? (
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9+]/g, "") }))}
                placeholder="080XXXXXXXX"
                className="h-11"
                maxLength={14}
              />
            ) : (
              <p className="font-semibold text-gray-900 text-base">
                {(profile as any).phone || <span className="text-gray-400 font-normal">Not provided</span>}
              </p>
            )}
          </div>

          {/* Address */}
          <div className="space-y-1">
            <Label className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Address
            </Label>
            {editing ? (
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Your address (optional)"
                className="h-11"
              />
            ) : (
              <p className="font-semibold text-gray-900 text-base">
                {(profile as any).address || <span className="text-gray-400 font-normal">Not provided</span>}
              </p>
            )}
          </div>

          {/* Member Since (always read-only) */}
          <div className="space-y-1">
            <Label className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Member Since
            </Label>
            <p className="font-semibold text-gray-900 text-base">
              {profile.created_at ? format(new Date(profile.created_at), "MMMM d, yyyy") : "—"}
            </p>
          </div>

          {editing && (
            <div className="pt-2 flex gap-3">
              <Button onClick={handleSave} disabled={updateProfile.isPending} className="flex-1 h-11 gap-2">
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {updateProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={handleCancel} className="h-11 px-6">
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Transaction PIN</p>
                <p className="text-sm text-gray-500">
                  {profile.is_pin_set
                    ? "PIN is set — used to authorize all transactions"
                    : "No PIN set — you must set one before transacting"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetPinOpen(true)}
              className="shrink-0"
            >
              {profile.is_pin_set ? "Change PIN" : "Set PIN"}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            We'll send a 4-digit code to your email to verify your identity before changing the PIN. Your PIN is always hashed and never stored in plain text.
          </p>
        </CardContent>
      </Card>

      <ResetPinModal open={resetPinOpen} onOpenChange={setResetPinOpen} />
    </div>
  );
}
