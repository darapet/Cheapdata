import { useState } from "react";
import { useBuyElectricity } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useToast } from "@/hooks/use-toast";
import { formatNaira, cn } from "@/lib/utils";
import { Loader2, Zap } from "lucide-react";

const discos = [
  "EKEDC", "IKEDC", "AEDC", "PHED", "EEDC", "KEDCO", "IBEDC", "BEDC", "JEDC", "YEDC"
];

export default function Electricity() {
  const [disco, setDisco] = useState<string>("EKEDC");
  const [meterType, setMeterType] = useState<string>("prepaid");
  const [meterNumber, setMeterNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const { toast } = useToast();

  const buyElectricity = useBuyElectricity();

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meterNumber) {
      toast({ title: "Error", description: "Please enter a valid meter number", variant: "destructive" });
      return;
    }
    if (!amount || Number(amount) < 500) {
      toast({ title: "Error", description: "Minimum amount is ₦500", variant: "destructive" });
      return;
    }
    setIsPinModalOpen(true);
  };

  const executePurchase = () => {
    buyElectricity.mutate(
      { data: { meter_number: meterNumber, disco, amount: Number(amount), meter_type: meterType, pin: "VERIFIED_BY_MODAL" } },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success", description: data.message });
            setMeterNumber("");
            setAmount("");
          } else {
            toast({ title: "Purchase Failed", description: data.message, variant: "destructive" });
          }
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "An unexpected error occurred", variant: "destructive" });
        }
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
              <Select value={disco} onValueChange={setDisco}>
                <SelectTrigger className="h-12 text-lg">
                  <SelectValue placeholder="Select Provider" />
                </SelectTrigger>
                <SelectContent>
                  {discos.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-base">Meter Type</Label>
              <div className="flex gap-4">
                <Button 
                  type="button" 
                  variant={meterType === "prepaid" ? "default" : "outline"}
                  onClick={() => setMeterType("prepaid")}
                  className="w-full h-12"
                >
                  Prepaid
                </Button>
                <Button 
                  type="button" 
                  variant={meterType === "postpaid" ? "default" : "outline"}
                  onClick={() => setMeterType("postpaid")}
                  className="w-full h-12"
                >
                  Postpaid
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meterNumber" className="text-base">Meter Number</Label>
              <Input
                id="meterNumber"
                type="text"
                value={meterNumber}
                onChange={(e) => setMeterNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Enter meter number"
                className="h-12 text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-base">Amount (₦)</Label>
              <Input
                id="amount"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="1000"
                className="h-12 text-lg font-bold"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-14 text-lg" 
              disabled={!meterNumber || !amount || buyElectricity.isPending}
            >
              {buyElectricity.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyElectricity.isPending ? "Processing..." : `Pay ${amount ? formatNaira(Number(amount)) : '₦0.00'}`}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal 
        open={isPinModalOpen} 
        onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase}
        amount={Number(amount)}
        actionTitle="Confirm Electricity Payment"
      />
    </div>
  );
}
