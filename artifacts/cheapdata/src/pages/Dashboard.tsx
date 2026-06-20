import { useState } from "react";
import { Link } from "wouter";
import { useGetProfile, useGetWalletTransactions, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupPinModal } from "@/components/SetupPinModal";
import { formatNaira, cn } from "@/lib/utils";
import { Eye, EyeOff, Plus, Wifi, Phone, Tv, Zap, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const [showBalance, setShowBalance] = useState(true);
  
  const { data: profile, isLoading: isProfileLoading } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey() }
  });
  
  const { data: transactions, isLoading: isTransactionsLoading } = useGetWalletTransactions();

  if (isProfileLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* PIN Setup Check */}
      {profile && !profile.is_pin_set && <SetupPinModal open={true} />}

      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hi, {profile?.full_name?.split(' ')[0] || 'User'} 👋</h1>
          <p className="text-gray-500 text-sm">Welcome back to CheapDataHub</p>
        </div>
      </div>

      {/* Wallet Card */}
      <Card className="bg-primary text-white overflow-hidden relative border-0 shadow-lg shadow-primary/20">
        <div className="absolute -right-10 -top-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-24 w-48 h-48 bg-black/10 rounded-full blur-2xl pointer-events-none" />
        
        <CardContent className="p-8 relative z-10">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-white/80 font-medium flex items-center gap-2">
                Available Balance
                <button onClick={() => setShowBalance(!showBalance)} className="hover:bg-white/10 p-1 rounded-full transition-colors">
                  {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </p>
              <h2 className="text-4xl font-bold tracking-tight">
                {showBalance ? formatNaira(profile?.wallet_balance || 0) : '••••••'}
              </h2>
            </div>
            <Link href="/fund-wallet">
              <a className="bg-white text-primary hover:bg-gray-50 font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
                <Plus className="h-4 w-4" />
                Fund
              </a>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-bold mb-4 text-gray-900">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-4">
          <ActionCard icon={Wifi} label="Buy Data" href="/buy-data" color="bg-blue-50 text-blue-600" />
          <ActionCard icon={Phone} label="Airtime" href="/buy-airtime" color="bg-green-50 text-green-600" />
          <ActionCard icon={Tv} label="Cable TV" href="/cable-tv" color="bg-purple-50 text-purple-600" />
          <ActionCard icon={Zap} label="Electricity" href="/electricity" color="bg-orange-50 text-orange-600" />
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Recent Transactions</h3>
          <Link href="/transactions">
            <a className="text-sm font-medium text-primary hover:underline">View All</a>
          </Link>
        </div>
        
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {isTransactionsLoading ? (
              <div className="p-6 text-center text-gray-500">Loading transactions...</div>
            ) : transactions && transactions.length > 0 ? (
              transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      tx.type === 'funding' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    )}>
                      {tx.type === 'funding' ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tx.description}</p>
                      <div className="flex items-center text-xs text-gray-500 gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {format(new Date(tx.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-bold",
                      tx.type === 'funding' ? "text-green-600" : "text-gray-900"
                    )}>
                      {tx.type === 'funding' ? '+' : '-'}{formatNaira(tx.amount)}
                    </p>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium inline-block mt-1",
                      tx.status === 'successful' ? "bg-green-100 text-green-700" :
                      tx.status === 'pending' ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                <History className="h-8 w-8 mb-2 text-gray-300" />
                <p>No transactions yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, label, href, color }: { icon: any, label: string, href: string, color: string }) {
  return (
    <Link href={href}>
      <a className="flex flex-col items-center p-4 rounded-2xl bg-white border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all text-center gap-3">
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", color)}>
          <Icon className="h-6 w-6" />
        </div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </a>
    </Link>
  );
}

function History({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}
