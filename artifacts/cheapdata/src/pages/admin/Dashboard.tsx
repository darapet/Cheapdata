import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAdminGetStats, useAdminGetTransactions } from "@/lib/supabase-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNaira } from "@/lib/utils";
import { Users, TrendingUp, Activity, ArrowUpRight, DollarSign, CreditCard } from "lucide-react";
import { format } from "date-fns";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminGetStats();
  const { data: transactions } = useAdminGetTransactions();
  const recent = (transactions ?? []).slice(0, 10);

  const statCards = [
    { title: "Total Users", value: stats?.total_users ?? 0, icon: Users, format: "number", color: "text-blue-600" },
    { title: "Total Revenue", value: stats?.total_revenue ?? 0, icon: DollarSign, format: "naira", color: "text-green-600" },
    { title: "Total Disbursed", value: stats?.total_disbursed ?? 0, icon: CreditCard, format: "naira", color: "text-orange-600" },
    { title: "All Transactions", value: stats?.total_transactions ?? 0, icon: Activity, format: "number", color: "text-purple-600" },
    { title: "Today's Revenue", value: stats?.today_revenue ?? 0, icon: TrendingUp, format: "naira", color: "text-emerald-600" },
    { title: "Today's Transactions", value: stats?.today_transactions ?? 0, icon: ArrowUpRight, format: "number", color: "text-indigo-600" },
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of CheapDataHub platform</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {statCards.map((s) => (
            <Card key={s.title}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500">{s.title}</p>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className={`text-xl font-bold ${s.color}`}>
                  {isLoading ? "—" : s.format === "naira" ? formatNaira(s.value as number) : (s.value as number).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent Transactions</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">User</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Description</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Amount</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Type</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent.map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-800">{tx.profiles?.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{tx.description || tx.type}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatNaira(tx.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={tx.type === "credit" ? "default" : "secondary"} className="text-xs">{tx.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={tx.status === "completed" ? "default" : tx.status === "pending" ? "secondary" : "destructive"} className="text-xs">{tx.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">{format(new Date(tx.created_at), "MMM d, h:mm a")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recent.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">No transactions yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
