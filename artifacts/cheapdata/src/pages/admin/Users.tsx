import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAdminGetUsers, useAdminCreditWallet } from "@/lib/supabase-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatNaira } from "@/lib/utils";
import { Search, Users, PlusCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function AdminUsers() {
  const { data: users, isLoading } = useAdminGetUsers();
  const creditWallet = useAdminCreditWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [creditUser, setCreditUser] = useState<any>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDesc, setCreditDesc] = useState("");

  const filtered = (users ?? []).filter((u: any) =>
    (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.phone ?? "").includes(search)
  );

  const handleCredit = () => {
    if (!creditUser || !creditAmount || Number(creditAmount) <= 0) return;
    creditWallet.mutate({ userId: creditUser.id, amount: Number(creditAmount), description: creditDesc || "Admin Credit" }, {
      onSuccess: () => {
        toast({ title: "Wallet Credited", description: `₦${Number(creditAmount).toLocaleString()} added to ${creditUser.full_name}'s wallet` });
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        setCreditUser(null); setCreditAmount(""); setCreditDesc("");
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <AdminLayout>
      <Dialog open={!!creditUser} onOpenChange={(o) => !o && setCreditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credit Wallet</DialogTitle>
            <DialogDescription>Add funds to {creditUser?.full_name}'s wallet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Amount (₦)</Label>
              <Input type="number" min={1} value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="Enter amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input value={creditDesc} onChange={(e) => setCreditDesc(e.target.value)} placeholder="e.g. Bonus, Refund..." />
            </div>
            <Button className="w-full" onClick={handleCredit} disabled={creditWallet.isPending || !creditAmount}>
              {creditWallet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Credit Wallet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-sm text-gray-500 mt-1">{(users ?? []).length} total users</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-10" placeholder="Search by name, email or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No users found</p>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Phone</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Balance</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">PIN Set</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Joined</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((user: any) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{user.full_name ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{user.email}</td>
                        <td className="px-4 py-3 text-gray-600">{user.phone ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">{formatNaira(user.wallet_balance ?? 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={user.transaction_pin ? "default" : "secondary"} className="text-xs">
                            {user.transaction_pin ? "Yes" : "No"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400">{format(new Date(user.created_at), "MMM d, yyyy")}</td>
                        <td className="px-4 py-3 text-center">
                          <Button size="sm" variant="outline" onClick={() => setCreditUser(user)} className="text-xs h-7 px-2">
                            <PlusCircle className="h-3 w-3 mr-1" /> Credit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
