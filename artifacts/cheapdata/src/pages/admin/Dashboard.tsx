import { useAdminGetStats, getAdminGetStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/utils";
import { Users, CreditCard, Activity, TrendingUp } from "lucide-react";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminGetStats({
    query: { queryKey: getAdminGetStatsQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Platform overview and performance metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Users" 
          value={stats?.total_users?.toLocaleString() || "0"} 
          icon={Users}
          trend="+12% from last month"
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard 
          title="Total Revenue" 
          value={formatNaira(stats?.total_revenue || 0)} 
          icon={TrendingUp}
          trend="+8% from last month"
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard 
          title="Total Transactions" 
          value={stats?.total_transactions?.toLocaleString() || "0"} 
          icon={CreditCard}
          trend="All time"
          color="text-purple-600"
          bg="bg-purple-50"
        />
        <StatCard 
          title="Active Users Today" 
          value={stats?.active_users_today?.toLocaleString() || "0"} 
          icon={Activity}
          trend="Unique logins today"
          color="text-orange-600"
          bg="bg-orange-50"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm border-gray-100">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold mb-4">Today's Revenue</h3>
            <p className="text-4xl font-bold text-primary">{formatNaira(stats?.today_revenue || 0)}</p>
            <p className="text-sm text-gray-500 mt-2">From {stats?.today_transactions || 0} transactions</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-100">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold mb-4">Total Disbursed</h3>
            <p className="text-4xl font-bold text-gray-900">{formatNaira(stats?.total_disbursed || 0)}</p>
            <p className="text-sm text-gray-500 mt-2">Value of services delivered</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color, bg }: any) {
  return (
    <Card className="shadow-sm border-gray-100">
      <CardContent className="p-6 flex flex-col h-full justify-between">
        <div className="flex justify-between items-start mb-4">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <div className={`p-2 rounded-lg ${bg} ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div>
          <h4 className="text-2xl font-bold text-gray-900">{value}</h4>
          <p className="text-xs text-gray-500 mt-1">{trend}</p>
        </div>
      </CardContent>
    </Card>
  );
}
