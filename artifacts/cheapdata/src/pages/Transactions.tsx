import { useGetWalletTransactions, getGetWalletTransactionsQueryKey } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira, cn } from "@/lib/utils";
import { History, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { format } from "date-fns";

export default function Transactions() {
  const { data: transactions, isLoading } = useGetWalletTransactions({
    query: { queryKey: getGetWalletTransactionsQueryKey() }
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Transaction History
        </h1>
        <p className="text-gray-500 mt-1">View all your past activities and payments</p>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-gray-100">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex justify-between items-center">
                  <div className="flex gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : transactions && transactions.length > 0 ? (
            transactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                    tx.type === 'funding' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                  )}>
                    {tx.type === 'funding' ? <ArrowDownRight className="h-6 w-6" /> : <ArrowUpRight className="h-6 w-6" />}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-base">{tx.description}</p>
                    <div className="flex items-center text-sm text-gray-500 gap-1 mt-1">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(tx.created_at), 'MMM d, yyyy h:mm a')}
                      <span className="mx-1">•</span>
                      <span>Ref: {tx.reference || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-bold text-lg",
                    tx.type === 'funding' ? "text-green-600" : "text-gray-900"
                  )}>
                    {tx.type === 'funding' ? '+' : '-'}{formatNaira(tx.amount)}
                  </p>
                  <span className={cn(
                    "text-xs px-2.5 py-1 rounded-full font-semibold inline-block mt-1",
                    tx.status === 'successful' ? "bg-green-100 text-green-700" :
                    tx.status === 'pending' ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  )}>
                    {tx.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-gray-500 flex flex-col items-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <History className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-lg font-medium text-gray-900">No transactions found</p>
              <p className="text-sm mt-1">When you make a transaction, it will appear here.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
