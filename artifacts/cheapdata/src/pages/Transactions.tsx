import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetTransactions } from "@/lib/supabase-hooks";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatNaira } from "@/lib/utils";
import { format } from "date-fns";
import { Search, History, ArrowDownLeft, ArrowUpRight } from "lucide-react";

export default function Transactions() {
  const { data: transactions, isLoading } = useGetTransactions();
  const [search, setSearch] = useState("");

  const filtered = (transactions ?? []).filter((t) =>
    (t.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (t.reference ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">Your complete transaction history</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-10" placeholder="Search by description or reference..." value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse h-16" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No transactions yet</p>
            <p className="text-sm">Your transactions will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((tx) => (
              <div key={tx.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === "credit" ? "bg-green-100" : "bg-red-100"}`}>
                  {tx.type === "credit"
                    ? <ArrowDownLeft className="h-5 w-5 text-green-600" />
                    : <ArrowUpRight className="h-5 w-5 text-red-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{tx.description || (tx.type === "credit" ? "Wallet Credit" : "Wallet Debit")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{format(new Date(tx.created_at), "MMM d, yyyy · h:mm a")}</p>
                  {tx.reference && <p className="text-xs text-gray-300 font-mono mt-0.5 truncate">{tx.reference}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`font-bold text-sm ${tx.type === "credit" ? "text-green-600" : "text-gray-900"}`}>
                    {tx.type === "credit" ? "+" : "-"}{formatNaira(tx.amount)}
                  </p>
                  <Badge variant={tx.status === "completed" ? "default" : tx.status === "pending" ? "secondary" : "destructive"} className="text-xs mt-1">
                    {tx.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
