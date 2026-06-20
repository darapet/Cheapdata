import { useAdminGetUsers, getAdminGetUsersQueryKey } from "@/lib/supabase-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/utils";
import { Users as UsersIcon } from "lucide-react";
import { format } from "date-fns";

export default function AdminUsers() {
  const { data: users, isLoading } = useAdminGetUsers({
    query: { queryKey: getAdminGetUsersQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UsersIcon className="h-6 w-6 text-primary" />
          Users Management
        </h1>
        <p className="text-gray-500 mt-1">View and manage all registered users</p>
      </div>

      <Card className="shadow-sm border-gray-100">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Email & Phone</th>
                  <th className="px-6 py-4">Wallet Balance</th>
                  <th className="px-6 py-4">PIN Set</th>
                  <th className="px-6 py-4">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-4">
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                      </div>
                    </td>
                  </tr>
                ) : users?.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{user.full_name}</div>
                      <div className="text-gray-500 text-xs">@{user.username}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900">{user.email}</div>
                      <div className="text-gray-500 text-xs">{user.phone}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {formatNaira(user.wallet_balance)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${user.is_pin_set ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.is_pin_set ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
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
