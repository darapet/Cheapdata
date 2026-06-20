import { useState } from "react";
import { useAdminGetTransactions, getAdminGetTransactionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira, cn } from "@/lib/utils";
import { CreditCard, Download, Search } from "lucide-react";
import { format } from "date-fns";

export default function AdminTransactions() {
  const [date, setDate] = useState("");
  
  const { data: transactions, isLoading } = useAdminGetTransactions({ date: date || undefined }, {
    query: { queryKey: getAdminGetTransactionsQueryKey({ date: date || undefined }) }
  });

  const handleDownloadCSV = () => {
    // Basic CSV download logic since we're generating client-side for demo or using the API directly
    window.open(`/api/admin/transactions/export${date ? `?date=${date}` : ''}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            All Transactions
          </h1>
          <p className="text-gray-500 mt-1">Global transaction ledger</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              type="date" 
              className="pl-9 h-10 w-full sm:w-auto"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Button onClick={handleDownloadCSV} variant="outline" className="h-10 gap-2 shrink-0">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-gray-100">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Transaction ID / Date</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Type & Description</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-4">
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    </td>
                  </tr>
                ) : transactions?.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-gray-500">{tx.reference || tx.id.slice(0, 8)}</div>
                      <div className="text-gray-900 mt-1">{format(new Date(tx.created_at), 'MMM d, yyyy h:mm a')}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{tx.user_name || 'Unknown'}</div>
                      <div className="text-gray-500 text-xs">{tx.user_email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900 font-medium">{tx.description}</div>
                      <div className="text-gray-500 text-xs mt-0.5 uppercase tracking-wider">{tx.type}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900 text-base">
                      {formatNaira(tx.amount)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-xs px-2.5 py-1 rounded-full font-semibold",
                        tx.status === 'successful' ? "bg-green-100 text-green-700" :
                        tx.status === 'pending' ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {tx.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
