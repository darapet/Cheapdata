import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Step = "request" | "otp" | "newpin";
const EDGE_BASE = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") + "/functions/v1";

interface ResetPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetPinModal({ open, onOpenChange }: ResetPinModalProps) {
  const [step, setStep]             = useState<Step>("request");
  const [email, setEmail]           = useState("");
  const [otp, setOtp]               = useState("");
  const [otpToken, setOtpToken]     = useState("");
  const [newPin, setNewPin]         = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading]   = useState(false);
  const { toast } = useToast();

  function reset() {
    setStep("request"); setEmail(""); setOtp(""); setOtpToken("");
    setNewPin(""); setConfirmPin(""); setIsLoading(false);
  }

  function handleClose(v: boolean) { if (!v) reset(); onOpenChange(v); }

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Please log in and try again");
    return session.access_token;
  }

  // Pre-fill email from logged-in user when modal opens
  async function prefillEmail() {
    if (email) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) setEmail(user.email);
  }

  // Step 1 — send OTP to user-supplied email
  async function sendOtp() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Error", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const authToken = await getToken();
      const res = await fetch(`${EDGE_BASE}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({ action: "send", email }),
      });
      const body = await res.json() as { success: boolean; token?: string; message?: string };
      if (!body.success) throw new Error(body.message ?? "Failed to send code");

      setOtpToken(body.token ?? "");
      setStep("otp");
      toast({ title: "Code Sent ✉️", description: `A 6-digit code was sent to ${email}. Check your inbox (and spam).` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not send code", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  // Step 3 — verify OTP and save new PIN
  async function saveNewPin() {
    if (newPin.length !== 4) {
      toast({ title: "Error", description: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    if (newPin !== confirmPin) {
      toast({ title: "Error", description: "PINs do not match. Please try again.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const authToken = await getToken();
      const res = await fetch(`${EDGE_BASE}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({ action: "verify_and_reset", otp, token: otpToken, new_pin: newPin }),
      });
      const body = await res.json() as { success: boolean; message?: string };
      if (!body.success) throw new Error(body.message ?? "Failed to update PIN");

      toast({ title: "PIN Updated ✅", description: "Your new transaction PIN is now active." });
      handleClose(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update PIN", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  const steps: Step[] = ["request", "otp", "newpin"];
  const currentIndex = steps.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Reset Transaction PIN
          </DialogTitle>
          <DialogDescription>
            {step === "request" && "Enter your email address to receive a reset code."}
            {step === "otp"     && "Enter the 6-digit code sent to your email."}
            {step === "newpin"  && "Create your new 4-digit transaction PIN."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 py-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                step === s ? "bg-primary text-white" : currentIndex > i ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
              }`}>
                {currentIndex > i ? "✓" : i + 1}
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 ${currentIndex > i ? "bg-green-500" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 — Email input */}
        {step === "request" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" />
              Enter the email address on your account. We'll send a 6-digit code to it.
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-email">Your Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={prefillEmail}
                autoFocus
              />
            </div>
            <Button
              className="w-full h-12"
              onClick={sendOtp}
              disabled={isLoading || !email}
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isLoading ? "Sending code..." : "Send Reset Code"}
            </Button>
          </div>
        )}

        {/* Step 2 — OTP input */}
        {step === "otp" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              Check <strong>{email}</strong> — the 6-digit code expires in <strong>10 minutes</strong>.
            </div>
            <div className="space-y-2">
              <Label htmlFor="otp-input">6-Digit Code</Label>
              <Input
                id="otp-input" type="text" inputMode="numeric" maxLength={6}
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="000000" className="text-center text-2xl tracking-[0.5em] h-16 font-bold" autoFocus
              />
            </div>
            <Button className="w-full h-12" onClick={() => setStep("newpin")} disabled={otp.length !== 6}>
              Continue →
            </Button>
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-primary w-full text-center transition-colors"
              onClick={() => { setStep("request"); setOtp(""); setOtpToken(""); }}
            >
              ← Didn't get the code? Go back
            </button>
          </div>
        )}

        {/* Step 3 — New PIN */}
        {step === "newpin" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Code verified. Create your new 4-digit PIN.
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pin">New PIN (4 digits)</Label>
              <Input id="new-pin" type="password" inputMode="numeric" maxLength={4}
                value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="••••" className="text-center text-3xl tracking-[1em] h-16 font-bold" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pin">Confirm New PIN</Label>
              <Input id="confirm-pin" type="password" inputMode="numeric" maxLength={4}
                value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="••••" className="text-center text-3xl tracking-[1em] h-16 font-bold" />
            </div>
            <Button
              className="w-full h-12 text-base"
              onClick={saveNewPin}
              disabled={isLoading || newPin.length !== 4 || confirmPin.length !== 4}
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isLoading ? "Saving PIN..." : "Save New PIN"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
