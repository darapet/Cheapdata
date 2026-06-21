import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, CreditCard, Settings, LogOut, Home, ListChecks } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Plans", href: "/admin/plans", icon: ListChecks },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Transactions", href: "/admin/transactions", icon: CreditCard },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  return (
    <div className="flex h-screen w-full bg-gray-100 flex-col md:flex-row">
      <div className="w-full md:w-64 bg-gray-900 text-white border-r border-gray-800 flex-shrink-0 flex flex-col hidden md:flex">
        <div className="p-6">
          <span className="text-xl font-bold tracking-tight text-white">Admin Panel</span>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <a className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )}>
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </a>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-800 space-y-2">
          <Link href="/dashboard">
            <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full text-left">
              <Home className="h-5 w-5" />
              Exit Admin
            </a>
          </Link>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full text-left">
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </div>

      {/* Mobile nav header */}
      <div className="md:hidden bg-gray-900 text-white border-b border-gray-800 p-4 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight text-white">Admin Panel</span>
        <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-white">
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <div className="md:hidden bg-gray-900 border-t border-gray-800 p-2 flex items-center justify-around">
        {navigation.map((item) => (
          <Link key={item.name} href={item.href}>
            <a className={cn("p-2 rounded-lg flex flex-col items-center gap-1",
              location === item.href ? "text-primary" : "text-gray-400")}>
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
