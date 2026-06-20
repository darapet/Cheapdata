import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVerifyPin } from "@/lib/supabase-hooks";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface PinPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  amount?: number;
  actionTitle?: string;
}

export function PinPromptModal({ open, onOpenChange, onSuccess, amount, actionTitle = "Confirm Transaction" }: PinPromptModalProps) {
  const [pin, setPin] = useState("");
  const verifyPin = useVerifyPin();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) {
      toast({ title: "Error", description: "PIN must be 4 digits", variant: "destructive" });
      return;
    }

    verifyPin.mutate(
      { data: { pin } },
      {
        onSuccess: (data) => {
          if (data.valid) {
            setPin("");
            onOpenChange(false);
            onSuccess();
          } else {
            toast({ title: "Error", description: "Invalid PIN", variant: "destructive" });
            setPin("");
          }
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to verify PIN", variant: "destructive" });
          setPin("");
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionTitle}</DialogTitle>
          <DialogDescription>
            {amount ? `You are about to spend ₦${amount.toLocaleString()}. ` : ''}
            Please enter your 4-digit transaction PIN to confirm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <Input
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0000"
            className="text-center text-3xl tracking-[1em] h-16"
            autoFocus
          />
          <Button type="submit" className="w-full h-12 text-lg font-medium" disabled={verifyPin.isPending || pin.length !== 4}>
            {verifyPin.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirm"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
