import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "cheapdatahub_salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Step = "email" | "otp" | "newpin";

interface ResetPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetPinModal({ open, onOpenChange }: ResetPinModalProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [userId, setUserId] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const EDGE_BASE =
    (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") +
    "/functions/v1";

  function reset() {
    setStep("email");
    setEmail("");
    setOtp("");
    setGeneratedOtp("");
    setUserId("");
    setNewPin("");
    setConfirmPin("");
    setIsLoading(false);
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  async function sendOtp() {
    if (!email.trim()) {
      toast({ title: "Error", description: "Please enter your email address", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();

      if (profileError || !profileData) {
        toast({ title: "Error", description: "No account found with this email address", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const code = String(Math.floor(1000 + Math.random() * 9000));
      setGeneratedOtp(code);
      setUserId(profileData.id);

      const res = await fetch(`${EDGE_BASE}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: code }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to send OTP");
      }

      setStep("otp");
      toast({ title: "OTP Sent", description: `A 4-digit code was sent to ${email}. Check your inbox.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send OTP email", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  function verifyOtp() {
    if (otp.length !== 4) {
      toast({ title: "Error", description: "Please enter the 4-digit code", variant: "destructive" });
      return;
    }
    if (otp !== generatedOtp) {
      toast({ title: "Invalid Code", description: "The code you entered is incorrect. Please try again.", variant: "destructive" });
      setOtp("");
      return;
    }
    setStep("newpin");
  }

  async function saveNewPin() {
    if (newPin.length !== 4) {
      toast({ title: "Error", description: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    if (newPin !== confirmPin) {
      toast({ title: "Error", description: "PINs do not match", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const hashedPin = await hashPin(newPin);
      const { error } = await supabase
        .from("profiles")
        .update({ transaction_pin: hashedPin, is_pin_set: true })
        .eq("id", userId);

      if (error) throw error;

      toast({ title: "PIN Updated", description: "Your transaction PIN has been reset successfully." });
      handleClose(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update PIN", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Reset Transaction PIN
          </DialogTitle>
          <DialogDescription>
            {step === "email" && "Enter your email address to receive a reset code."}
            {step === "otp" && `Enter the 4-digit code sent to ${email}.`}
            {step === "newpin" && "Create your new 4-digit transaction PIN."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2">
          {(["email", "otp", "newpin"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  step === s
                    ? "bg-primary text-white"
                    : ["email", "otp", "newpin"].indexOf(step) > i
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {["email", "otp", "newpin"].indexOf(step) > i ? "✓" : i + 1}
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 ${["email", "otp", "newpin"].indexOf(step) > i ? "bg-green-500" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Email */}
        {step === "email" && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email Address
              </Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              />
            </div>
            <Button className="w-full h-12" onClick={sendOtp} disabled={isLoading || !email.trim()}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isLoading ? "Sending..." : "Send Reset Code"}
            </Button>
          </div>
        )}

        {/* Step 2: OTP */}
        {step === "otp" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              A 4-digit code was sent to <strong>{email}</strong>. Check your inbox (and spam folder if not found).
            </div>
            <div className="space-y-2">
              <Label htmlFor="otp-input">4-Digit Code</Label>
              <Input
                id="otp-input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0000"
                className="text-center text-3xl tracking-[1em] h-16 font-bold"
                autoFocus
              />
            </div>
            <Button className="w-full h-12" onClick={verifyOtp} disabled={otp.length !== 4}>
              Verify Code
            </Button>
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-primary w-full text-center transition-colors"
              onClick={() => { setStep("email"); setOtp(""); }}
            >
              ← Back / Resend code
            </button>
          </div>
        )}

        {/* Step 3: New PIN */}
        {step === "newpin" && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Identity verified. Set your new PIN below.
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pin">New PIN</Label>
              <Input
                id="new-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0000"
                className="text-center text-3xl tracking-[1em] h-16 font-bold"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pin">Confirm New PIN</Label>
              <Input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0000"
                className="text-center text-3xl tracking-[1em] h-16 font-bold"
              />
            </div>
            <Button
              className="w-full h-12 text-base"
              onClick={saveNewPin}
              disabled={isLoading || newPin.length !== 4 || confirmPin.length !== 4}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isLoading ? "Saving..." : "Save New PIN"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
