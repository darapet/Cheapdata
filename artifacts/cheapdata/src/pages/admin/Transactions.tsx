import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAdminGetTransactions } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatNaira } from "@/lib/utils";
import { Search, History } from "lucide-react";
import { format } from "date-fns";

export default function AdminTransactions() {
  const { data: transactions, isLoading } = useAdminGetTransactions();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "credit" | "debit">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending" | "failed">("all");

  const filtered = (transactions ?? []).filter((tx: any) => {
    const matchSearch = (tx.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (tx.reference ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (tx.profiles?.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (tx.profiles?.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || tx.type === typeFilter;
    const matchStatus = statusFilter === "all" || tx.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const totalAmount = filtered.reduce((s: number, tx: any) => s + (tx.amount ?? 0), 0);

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} records · Total: {formatNaira(totalAmount)}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-10" placeholder="Search user, description or reference..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            {["all", "credit", "debit"].map((t) => (
              <button key={t} onClick={() => setTypeFilter(t as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${typeFilter === t ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200"}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {["all", "completed", "pending", "failed"].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${statusFilter === s ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No transactions found</p>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">User</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Reference</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Amount</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Type</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 text-xs">{tx.profiles?.full_name ?? "—"}</p>
                          <p className="text-gray-400 text-xs">{tx.profiles?.email ?? ""}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-[180px] truncate">{tx.description || tx.type}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400 max-w-[140px] truncate">{tx.reference ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatNaira(tx.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={tx.type === "credit" ? "default" : "secondary"} className="text-xs">{tx.type}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={tx.status === "completed" ? "default" : tx.status === "pending" ? "secondary" : "destructive"} className="text-xs">{tx.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400">{format(new Date(tx.created_at), "MMM d, h:mm a")}</td>
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
