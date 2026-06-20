import { useState } from "react";
import { useBuyAirtime } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinPromptModal } from "@/components/PinPromptModal";
import { useToast } from "@/hooks/use-toast";
import { formatNaira, cn } from "@/lib/utils";
import { Loader2, Phone } from "lucide-react";

const networks = [
  { id: "MTN", name: "MTN", color: "bg-yellow-400 hover:bg-yellow-500", text: "text-black" },
  { id: "AIRTEL", name: "Airtel", color: "bg-red-500 hover:bg-red-600", text: "text-white" },
  { id: "GLO", name: "Glo", color: "bg-green-500 hover:bg-green-600", text: "text-white" },
  { id: "9MOBILE", name: "9mobile", color: "bg-green-800 hover:bg-green-900", text: "text-white" },
];

export default function BuyAirtime() {
  const [network, setNetwork] = useState<string>("MTN");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const { toast } = useToast();

  const buyAirtime = useBuyAirtime();

  const handleInitiatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      toast({ title: "Error", description: "Please enter a valid phone number", variant: "destructive" });
      return;
    }
    if (!amount || Number(amount) < 50) {
      toast({ title: "Error", description: "Minimum airtime amount is ₦50", variant: "destructive" });
      return;
    }
    setIsPinModalOpen(true);
  };

  const executePurchase = () => {
    buyAirtime.mutate(
      { data: { phone, network, amount: Number(amount), pin: "VERIFIED_BY_MODAL" } },
      {
        onSuccess: (data) => {
          if (data.success) {
            toast({ title: "Success", description: data.message });
            setPhone("");
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
          <Phone className="h-6 w-6 text-primary" />
          Buy Airtime
        </h1>
        <p className="text-gray-500 mt-1">Instant airtime recharge for all networks</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-3">
            <Label className="text-base">Select Network</Label>
            <div className="grid grid-cols-4 gap-3">
              {networks.map((net) => (
                <button
                  key={net.id}
                  type="button"
                  onClick={() => setNetwork(net.id)}
                  className={cn(
                    "h-16 rounded-xl font-bold text-sm transition-all border-2",
                    network === net.id 
                      ? `${net.color} ${net.text} border-transparent scale-[1.02] shadow-md` 
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {net.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleInitiatePurchase} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-base">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="080XXXXXXXX"
                className="h-12 text-lg"
                maxLength={11}
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
              disabled={!phone || !amount || buyAirtime.isPending}
            >
              {buyAirtime.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {buyAirtime.isPending ? "Processing..." : `Pay ${amount ? formatNaira(Number(amount)) : '₦0.00'}`}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PinPromptModal 
        open={isPinModalOpen} 
        onOpenChange={setIsPinModalOpen}
        onSuccess={executePurchase}
        amount={Number(amount)}
        actionTitle="Confirm Airtime Purchase"
      />
    </div>
  );
}
