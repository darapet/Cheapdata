import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/utils";
import { ArrowUpRight, Download, TrendingUp, Zap } from "lucide-react";
import { format } from "date-fns";

type Transfer = {
  id: string;
  order_reference: string;
  amount: number;
  recipient_code: string;
  transfer_code: string | null;
  status: string;
  reason: string | null;
  created_at: string;
  user_id: string | null;
};

type TransferStats = {
  total_transferred: number;
  total_count: number;
  successful_count: number;
  failed_count: number;
};

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  if (s === "success" || s === "successful") return <Badge className="bg-green-100 text-green-700 border-green-200 font-medium">Successful</Badge>;
  if (s === "failed" || s === "failure") return <Badge className="bg-red-100 text-red-700 border-red-200 font-medium">Failed</Badge>;
  if (s === "pending") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 font-medium">Pending</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function AdminTransfers() {
  const [date, setDate] = useState("");
  const [stats, setStats] = useState<TransferStats | null>(null);

  const { data: transfers = [], isLoading } = useQuery<Transfer[]>({
    queryKey: ["admin-transfers", date],
    queryFn: async () => {
      let q = supabase
        .from("paystack_transfers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (date) {
        q = q.gte("created_at", `${date}T00:00:00`).lte("created_at", `${date}T23:59:59`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Transfer[];
    },
  });

  useEffect(() => {
    if (!transfers.length) { setStats(null); return; }
    const successful = transfers.filter(t => ["success","successful"].includes(t.status?.toLowerCase()));
    const failed = transfers.filter(t => ["failed","failure"].includes(t.status?.toLowerCase()));
    setStats({
      total_transferred: successful.reduce((s, t) => s + Number(t.amount), 0),
      total_count: transfers.length,
      successful_count: successful.length,
      failed_count: failed.length,
    });
  }, [transfers]);

  const handleDownloadCSV = () => {
    if (!transfers.length) return;
    const headers = ["Date", "Order Reference", "Transfer Code", "Amount (₦)", "Status", "Reason"];
    const rows = transfers.map(t => [
      t.created_at ? format(new Date(t.created_at), "dd/MM/yyyy HH:mm") : "",
      t.order_reference,
      t.transfer_code ?? "",
      t.amount,
      t.status,
      t.reason ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(String).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transfers${date ? `-${date}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="h-6 w-6 text-blue-600" />
            Auto-Transfer History
          </h1>
          <p className="text-gray-500 mt-1">Wholesale payments sent to CheapDataHub after each service</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Input
            type="date"
            className="h-10 w-full sm:w-auto"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <Button onClick={handleDownloadCSV} variant="outline" className="h-10 gap-2 shrink-0">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-blue-100">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Sent</p>
              <p className="text-xl font-bold text-blue-700 mt-1">{formatNaira(stats.total_transferred)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">All Transfers</p>
              <p className="text-xl font-bold mt-1">{stats.total_count}</p>
            </CardContent>
          </Card>
          <Card className="border-green-100">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Successful</p>
              <p className="text-xl font-bold text-green-700 mt-1">{stats.successful_count}</p>
            </CardContent>
          </Card>
          <Card className="border-red-100">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Failed</p>
              <p className="text-xl font-bold text-red-600 mt-1">{stats.failed_count}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="shadow-sm border-gray-100">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Order Reference</th>
                  <th className="px-6 py-4">Transfer Code</th>
                  <th className="px-6 py-4 text-right">Amount Sent</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : transfers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="font-medium">No transfers yet</p>
                      <p className="text-xs mt-1">Auto-transfers appear here once auto-funding is enabled and a service is purchased.</p>
                    </td>
                  </tr>
                ) : (
                  transfers.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap">
                        {t.created_at ? format(new Date(t.created_at), "dd MMM yyyy, HH:mm") : "—"}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-700">{t.order_reference}</td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-500">{t.transfer_code ?? "—"}</td>
                      <td className="px-6 py-4 text-right font-semibold text-blue-700">{formatNaira(t.amount)}</td>
                      <td className="px-6 py-4"><StatusBadge status={t.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
