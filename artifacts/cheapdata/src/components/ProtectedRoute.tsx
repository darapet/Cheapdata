import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { session, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!session) {
        setLocation("/login");
      } else if (adminOnly && user?.email !== "daramolapeter98@gmail.com") {
        setLocation("/dashboard");
      }
    }
  }, [session, isLoading, setLocation, adminOnly, user]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return null;
  if (adminOnly && user?.email !== "daramolapeter98@gmail.com") return null;

  return <>{children}</>;
}
