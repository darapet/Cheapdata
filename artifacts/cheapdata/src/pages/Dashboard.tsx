import { Link } from "wouter";
import { Wifi, Phone, Tv, Zap, Wallet, History, TrendingUp, ArrowUpRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SetupPinModal } from "@/components/SetupPinModal";
import { useGetProfile, useGetTransactions } from "@/lib/supabase-hooks";
import { formatNaira } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const services = [
  { name: "Buy Data", href: "/buy-data", icon: Wifi, color: "bg-blue-500", desc: "Mobile internet bundles" },
  { name: "Buy Airtime", href: "/buy-airtime", icon: Phone, color: "bg-green-500", desc: "Recharge any network" },
  { name: "Cable TV", href: "/cable-tv", icon: Tv, color: "bg-orange-500", desc: "DStv, GOtv, StarTimes" },
  { name: "Electricity", href: "/electricity", icon: Zap, color: "bg-yellow-500", desc: "Buy power tokens" },
  { name: "Fund Wallet", href: "/fund-wallet", icon: Wallet, color: "bg-primary", desc: "Top up your balance" },
  { name: "Transactions", href: "/transactions", icon: History, color: "bg-purple-500", desc: "View history" },
];

export default function Dashboard() {
  const { data: profile, isLoading } = useGetProfile();
  const { data: transactions } = useGetTransactions();
  const needsPin = !isLoading && profile && !profile.transaction_pin;
  const recent = transactions?.slice(0, 5) ?? [];

  return (
    <AppLayout>
      <SetupPinModal open={!!needsPin} />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Wallet card */}
        <div className="bg-gradient-to-br from-primary to-violet-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-white/70">Wallet Balance</p>
              <h2 className="text-3xl font-bold mt-1">
                {isLoading ? "—" : formatNaira(profile?.wallet_balance ?? 0)}
              </h2>
            </div>
            <div className="bg-white/20 rounded-xl p-2">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
              {profile?.full_name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div>
              <p className="text-sm font-medium">{profile?.full_name ?? "Loading..."}</p>
              <p className="text-xs text-white/60">{profile?.email}</p>
            </div>
          </div>
        </div>

        {/* Services grid */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Services</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {services.map((s) => (
              <Link key={s.name} href={s.href}>
                <a className="bg-white rounded-xl p-4 border border-gray-100 hover:shadow-md hover:border-primary/20 transition-all group">
                  <div className={`${s.color} rounded-xl w-10 h-10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <s.icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="font-semibold text-gray-800 text-sm">{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                </a>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        {recent.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recent Transactions</h3>
              <Link href="/transactions">
                <a className="text-xs text-primary font-medium flex items-center gap-1">View all <ArrowUpRight className="h-3 w-3" /></a>
              </Link>
            </div>
            <Card>
              <CardContent className="p-0">
                {recent.map((tx, i) => (
                  <div key={tx.id} className={`flex items-center justify-between px-4 py-3 ${i < recent.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${tx.type === "credit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {tx.type === "credit" ? "+" : "-"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{tx.description || tx.type}</p>
                        <p className="text-xs text-gray-400">{format(new Date(tx.created_at), "MMM d, h:mm a")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${tx.type === "credit" ? "text-green-600" : "text-gray-800"}`}>
                        {tx.type === "credit" ? "+" : "-"}{formatNaira(tx.amount)}
                      </p>
                      <Badge variant={tx.status === "completed" ? "default" : tx.status === "pending" ? "secondary" : "destructive"} className="text-xs">
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
