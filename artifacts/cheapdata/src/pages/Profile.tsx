import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/utils";
import { User, Mail, Phone, MapPin, Calendar, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

export default function Profile() {
  const { data: profile, isLoading } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <User className="h-6 w-6 text-primary" />
          My Profile
        </h1>
        <p className="text-gray-500 mt-1">Manage your account details and settings</p>
      </div>

      <Card className="overflow-hidden border-0 shadow-md">
        <div className="h-24 bg-gradient-to-r from-primary to-red-400" />
        <CardContent className="pt-0 relative">
          <div className="w-20 h-20 bg-white rounded-full p-1 -mt-10 border-4 border-white shadow-sm flex items-center justify-center">
            <div className="w-full h-full bg-red-100 text-primary rounded-full flex items-center justify-center text-2xl font-bold">
              {profile.full_name?.charAt(0) || 'U'}
            </div>
          </div>
          
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-gray-900">{profile.full_name}</h2>
            <p className="text-gray-500">@{profile.username}</p>
          </div>
          
          <div className="flex items-center gap-2 mt-4 inline-flex px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium">
            <ShieldCheck className="h-4 w-4" />
            Verified Account
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1 border-b border-gray-100 pb-4">
              <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email Address
              </p>
              <p className="font-semibold text-gray-900">{profile.email}</p>
            </div>
            
            <div className="space-y-1 border-b border-gray-100 pb-4">
              <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Phone className="h-4 w-4" /> Phone Number
              </p>
              <p className="font-semibold text-gray-900">{profile.phone}</p>
            </div>
            
            <div className="space-y-1 border-b border-gray-100 pb-4">
              <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Address
              </p>
              <p className="font-semibold text-gray-900">{profile.address || 'Not provided'}</p>
            </div>
            
            <div className="space-y-1 border-b border-gray-100 pb-4">
              <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Member Since
              </p>
              <p className="font-semibold text-gray-900">
                {profile.created_at ? format(new Date(profile.created_at), 'MMMM d, yyyy') : 'Unknown'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
