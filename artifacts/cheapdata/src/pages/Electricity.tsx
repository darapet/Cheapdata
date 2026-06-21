import { useState, useRef } from "react";
import { useBuyElectricity } from "@/lib/supabase-hooks";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useToast } from "@/hooks/use-toast";
import { formatNaira, cn } from "@/lib/utils";
import { Loader2, Zap, Info, CheckCircle2, XCircle, UserCheck } from "lucide-react";

const SERVICE_FEE = 150;

const discos = [
  "EKEDC", "IKEDC", "AEDC", "PHED", "EEDC", "KEDCO", "IBEDC", "BEDC", "JEDC", "YEDC"
];

const EDGE_BASE = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") + "/functions/v1";

export default function Electricity() {
  const [disco, setDisco] = useState("EKEDC");
  const [meterType, setMeterType] = useState("prepaid");
  const [meterNumber, setMeterNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [verifyState, setVerifyState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [customerAddress, setCustomerAddress] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const verifyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const buyElectricity = useBuyElectricity();

  const amountNum = Number(amount) || 0;
  const total = amountNum > 0 ? amountNum + SERVICE_FEE : 0;

  async function verifyMeter(meterNum: string, currentDisco: string, currentType: string) {
    if (meterNum.length < 6) {
      setVerifyState("idle");
      setCustomerName(null);
      return;
    }
    setVerifyState("loading");
    setCustomerName(null);
    setCustomerAddress(null);
    setVerifyError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(
        `${EDGE_BASE}/verify-meter?disco=${encodeURIComponent(currentDisco)}&meter_number=${encodeURIComponent(meterNum)}&meter_type=${encodeURIComponent(currentType)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json() as { success: boolean; customer_name?: string | null; address?: string | null; skipped?: boolean; message?: string };
      if (json.skipped || json.success) {
        setVerifyState("ok");
        setCustomerName(json.customer_name ?? null);
        setCustomerAddress(json.address ?? null);
      } else {
        setVerifyState("error");
        setVerifyError(json.message ?? "Could not verify this meter number");
      }
    } catch {
      setVerifyState("ok");
      setCustomerName(null);
    }
  }

  function handleMeterChange(val: string) {
    const num = val.replace(/[^0-9]/g, "");
    setMeterNumber(num);
    setVerifyState("idle");
    setCustomerName(null);
    if (verifyTimeout.current) clearTimeout(verifyTimeout.current);
    if (num.length >= 6) {
      verifyTimeout.current = setTimeout(() => verifyMeter(num, disco, meterType), 800);
    }
  }

  function handleDiscoChange(val: string) {
    setDisco(val);
    setVerifyState("idle");
    setCustomerName(null);
    if (meterNumber.length >= 6) {
      if (verifyTimeout.current) clearTimeout(verifyTimeout.current);
      verifyTimeout.current = setTimeout(() => verifyMeter(meterNumber, val, meterType), 800);
    }
  }

  function handleMeterTypeChange(val: string) {
    setMeterType(val);
    setVerifyState("idle");
    setCustomerName(null);
    if (meterNumber.length >= 6) {
      if (verifyTimeout.current) clearTimeout(verifyTimeout.current);
      verifyTimeout.current = setTimeout(() => verifyMeter(meterNumber, disco, val), 800);
    }
  }

  const canProceed = meterNumber.length >= 6 && amountNum >= 500 && verifyState !== "loading" && verifyState !== "error";

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meterNumber) {
      toast({ title: "Error", description: "Please enter a valid meter number", variant: "destructive" });
      return;
    }
    if (!amount || amountNum < 500) {
      toast({ title: "Error", description: "Minimum electricity amount is ₦500", variant: "destructive" });
      return;
    }
    setIsPinModalOpen(true);
  };

  const executePurchase = () => {
    buyElectricity.mutate(
      { data: { meter_number: meterNumber, disco, amount: amountNum, meter_type: meterType, phone, pin: "VERIFIED_BY_MODAL" } },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success!", description: data.message });
            setMeterNumber("");
            setAmount("");
            setPhone("");
            setVerifyState("idle");
            setCustomerName(null);
          } else {
            toast({ title: "Purchase Failed", description: data.message, variant: "destructive" });
          }
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "An unexpected error occurred", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Electricity
        </h1>
        <p className="text-gray-500 mt-1">Pay for your prepaid or postpaid electricity</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <form onSubmit={handleInitiatePurchase} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-base">Distribution Company (DISCO)</Label>
              <Select value={disco} onValueChange={handleDiscoChange}>
                <SelectTrigger className="h-12 text-lg">
                  <SelectValue placeholder="Select Provider" />
                </SelectTrigger>
                <SelectContent>
                  {discos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-base">Meter Type</Label>
              <div className="flex gap-4">
                <Button type="button" variant={meterType === "prepaid" ? "default" : "outline"}
                  onClick={() => handleMeterTypeChange("prepaid")} className="w-full h-12">
                  Prepaid
                </Button>
                <Button type="button" variant={meterType === "postpaid" ? "default" : "outline"}
                  onClick={() => handleMeterTypeChange("postpaid")} className="w-full h-12">
                  Postpaid
                </Button>
              </div>
            </div>

            {/* Meter number + verify */}
            <div className="space-y-2">
              <Label htmlFor="meterNumber" className="text-base">Meter Number</Label>
              <div className="relative">
                <Input id="meterNumber" type="text" value={meterNumber}
                  onChange={e => handleMeterChange(e.target.value)}
                  placeholder="Enter meter number"
                  className={cn("h-12 text-lg pr-10",
                    verifyState === "ok" && customerName ? "border-green-400 focus-visible:ring-green-300" :
                    verifyState === "error" ? "border-red-400 focus-visible:ring-red-300" : ""
                  )} />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {verifyState === "loading" && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
                  {verifyState === "ok" && customerName && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  {verifyState === "error" && <XCircle className="h-5 w-5 text-red-500" />}
                </div>
              </div>

              {/* Customer name banner */}
              {verifyState === "ok" && customerName && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm space-y-0.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="font-semibold text-green-800">{customerName}</span>
                    <span className="text-green-600 text-xs">verified</span>
                  </div>
                  {customerAddress && (
                    <p className="text-xs text-green-700 pl-6">{customerAddress}</p>
                  )}
                </div>
              )}
              {verifyState === "error" && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> {verifyError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="elec-phone">Contact Phone Number</Label>
              <Input id="elec-phone" type="tel" placeholder="e.g. 08012345678"
                value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={11} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-base">Electricity Amount (₦)</Label>
              <Input id="amount" type="text" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="1000" className="h-12 text-lg font-bold" />
            </div>

            {amountNum >= 500 && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Electricity units</span>
                  <span>{formatNaira(amountNum)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span className="flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" /> Service fee
                  </span>
                  <span>{formatNaira(SERVICE_FEE)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2">
                  <span>Total deducted from wallet</span>
                  <span className="text-primary">{formatNaira(total)}</span>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full h-14 text-lg" disabled={!canProceed || buyElectricity.isPending}>
              {buyElectricity.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyElectricity.isPending ? "Processing..." : total > 0 ? `Pay ${formatNaira(total)}` : "Enter Amount"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal open={isPinModalOpen} onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase} amount={total}
        actionTitle="Confirm Electricity Payment" />
    </div>
  );
}
