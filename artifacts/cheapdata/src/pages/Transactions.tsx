import { useState, useMemo } from "react";
import { useGetWalletTransactions, useGetProfile, getGetWalletTransactionsQueryKey } from "@/lib/supabase-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatNaira, cn } from "@/lib/utils";
import {
  History, ArrowUpRight, ArrowDownRight, Clock,
  TrendingUp, TrendingDown, Wallet, RefreshCw, Search
} from "lucide-react";
import { format } from "date-fns";

type FilterType = "all" | "funding" | "debit";

const TYPE_ICONS: Record<string, { icon: typeof ArrowUpRight; bg: string; color: string; label: string }> = {
  funding: { icon: ArrowDownRight, bg: "bg-green-100", color: "text-green-600", label: "Wallet Funding" },
  debit:   { icon: ArrowUpRight,   bg: "bg-red-100",   color: "text-red-600",   label: "Purchase"       },
  airtime: { icon: ArrowUpRight,   bg: "bg-orange-100", color: "text-orange-600", label: "Airtime"       },
  data:    { icon: ArrowUpRight,   bg: "bg-blue-100",  color: "text-blue-600",  label: "Data"           },
  cable:   { icon: ArrowUpRight,   bg: "bg-purple-100",color: "text-purple-600",label: "Cable TV"       },
  electricity: { icon: ArrowUpRight, bg: "bg-yellow-100", color: "text-yellow-600", label: "Electricity" },
  education:   { icon: ArrowUpRight, bg: "bg-teal-100",   color: "text-teal-600",   label: "Education"   },
};

function getTypeStyle(type: string) {
  return TYPE_ICONS[type] ?? TYPE_ICONS.debit;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    successful: "bg-green-100 text-green-700",
    pending:    "bg-yellow-100 text-yellow-700",
    failed:     "bg-red-100 text-red-700",
    refunded:   "bg-gray-100 text-gray-600",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold inline-block", styles[status] ?? styles.pending)}>
      {status.toUpperCase()}
    </span>
  );
}

export default function Transactions() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading, refetch } = useGetWalletTransactions({
    query: { queryKey: getGetWalletTransactionsQueryKey() }
  });
  const { data: profile } = useGetProfile();

  const filtered = useMemo(() => {
    let list = transactions as any[];
    if (filter === "funding") list = list.filter((t) => t.type === "funding");
    if (filter === "debit")   list = list.filter((t) => t.type !== "funding");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.reference ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, filter, search]);

  const totalFunded = useMemo(() =>
    (transactions as any[]).filter((t) => t.type === "funding" && t.status === "successful").reduce((s: number, t: any) => s + Number(t.amount), 0),
    [transactions]
  );
  const totalSpent = useMemo(() =>
    (transactions as any[]).filter((t) => t.type !== "funding" && t.status === "successful").reduce((s: number, t: any) => s + Number(t.amount), 0),
    [transactions]
  );

  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: getGetWalletTransactionsQueryKey() });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Transaction History
          </h1>
          <p className="text-gray-500 mt-1">All your wallet activity in one place</p>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 text-gray-400 hover:text-primary transition-colors rounded-lg hover:bg-gray-50"
          title="Refresh"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Wallet className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 truncate">Balance</p>
                <p className="font-bold text-gray-900 text-sm truncate">{formatNaira(profile?.wallet_balance ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <TrendingDown className="h-5 w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 truncate">Total Funded</p>
                <p className="font-bold text-green-700 text-sm truncate">{formatNaira(totalFunded)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 truncate">Total Spent</p>
                <p className="font-bold text-red-700 text-sm truncate">{formatNaira(totalSpent)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2">
          {(["all", "funding", "debit"] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f === "all" ? "All" : f === "funding" ? "Funded" : "Purchases"}
            </Button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description or reference…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Transaction list */}
      <Card>
        <CardContent className="p-0 divide-y divide-gray-100">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="flex gap-4 items-center">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <Skeleton className="h-5 w-20 ml-auto" />
                    <Skeleton className="h-4 w-16 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            filtered.map((tx: any) => {
              const style = getTypeStyle(tx.type);
              const Icon = style.icon;
              const isFunding = tx.type === "funding";
              return (
                <div
                  key={tx.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-11 h-11 rounded-full flex items-center justify-center shrink-0", style.bg, style.color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{tx.description}</p>
                      <div className="flex items-center text-xs text-gray-400 gap-1 mt-0.5 flex-wrap">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{format(new Date(tx.created_at), "MMM d, yyyy h:mm a")}</span>
                        {tx.reference && (
                          <>
                            <span className="mx-0.5">·</span>
                            <span className="font-mono text-[10px] truncate max-w-[120px]">{tx.reference}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("font-bold text-base", isFunding ? "text-green-600" : "text-gray-900")}>
                      {isFunding ? "+" : "−"}{formatNaira(tx.amount)}
                    </p>
                    <div className="mt-1">
                      <StatusBadge status={tx.status} />
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center flex flex-col items-center text-gray-400">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <History className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-base font-medium text-gray-700">
                {search ? "No matching transactions" : "No transactions yet"}
              </p>
              <p className="text-sm mt-1">
                {search ? "Try a different search term." : "Fund your wallet to get started."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <p className="text-xs text-center text-gray-400">
          Showing {filtered.length} of {(transactions as any[]).length} transaction{(transactions as any[]).length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
