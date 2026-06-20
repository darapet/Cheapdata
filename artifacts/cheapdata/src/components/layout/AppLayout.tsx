import { Link, useLocation } from "wouter";
import { Home, Wifi, Phone, Tv, Zap, Wallet, History, User, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Buy Data", href: "/buy-data", icon: Wifi },
  { name: "Buy Airtime", href: "/buy-airtime", icon: Phone },
  { name: "Cable TV", href: "/cable-tv", icon: Tv },
  { name: "Electricity", href: "/electricity", icon: Zap },
  { name: "Fund Wallet", href: "/fund-wallet", icon: Wallet },
  { name: "Transactions", href: "/transactions", icon: History },
  { name: "Profile", href: "/profile", icon: User },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 flex-col md:flex-row">
      <div className="w-full md:w-64 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col hidden md:flex">
        <div className="p-5 flex items-center">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="CheapDataHub" className="h-10 w-auto" />
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <a
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-white"
                      : "text-gray-600 hover:bg-red-50 hover:text-primary"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "")} />
                  {item.name}
                </a>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          {user?.email === "daramolapeter98@gmail.com" && (
            <Link href="/admin">
              <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors mb-2">
                <User className="h-5 w-5" />
                Admin Panel
              </a>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors w-full text-left"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </div>

      {/* Mobile nav header */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="CheapDataHub" className="h-8 w-auto" />
        <button onClick={handleLogout} className="p-2 text-gray-600">
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <div className="md:hidden bg-white border-t border-gray-200 p-2 flex items-center justify-around">
        {navigation.slice(0, 5).map((item) => (
          <Link key={item.name} href={item.href}>
            <a className={cn("p-2 rounded-lg flex flex-col items-center gap-1", location === item.href ? "text-primary" : "text-gray-500")}>
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name.split(' ')[0]}</span>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
