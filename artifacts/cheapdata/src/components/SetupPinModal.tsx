import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetupPin, getGetProfileQueryKey } from "@/lib/supabase-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function SetupPinModal({ open }: { open: boolean }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const setupPin = useSetupPin();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) {
      toast({ title: "Error", description: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    if (pin !== confirmPin) {
      toast({ title: "Error", description: "PINs do not match", variant: "destructive" });
      return;
    }
    setupPin.mutate({ data: { pin } }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Transaction PIN set successfully" });
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to set PIN", variant: "destructive" });
      },
    });
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Set Transaction PIN</DialogTitle>
          <DialogDescription>You need a 4-digit PIN to authorize transactions.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="pin">Enter PIN</Label>
            <Input id="pin" type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0000" className="text-center text-2xl tracking-[1em]" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPin">Confirm PIN</Label>
            <Input id="confirmPin" type="password" inputMode="numeric" maxLength={4} value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0000" className="text-center text-2xl tracking-[1em]" required />
          </div>
          <Button type="submit" className="w-full" disabled={setupPin.isPending}>
            {setupPin.isPending ? "Setting PIN..." : "Save PIN"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
