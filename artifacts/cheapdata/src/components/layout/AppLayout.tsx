import { Link, useLocation } from "wouter";
import { Home, Wifi, Phone, Tv, Zap, Wallet, History, User, LogOut, ShieldCheck, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  const NavLinks = () => (
    <>
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto py-4">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <a
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-white" : "text-gray-600 hover:bg-purple-50 hover:text-primary"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </a>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-200 space-y-1">
        {user?.email === "daramolapeter98@gmail.com" && (
          <Link href="/admin">
            <a onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-purple-700 hover:bg-purple-50 transition-colors">
              <ShieldCheck className="h-5 w-5" />
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
    </>
  );

  return (
    <div className="flex h-screen w-full bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-shrink-0 flex-col">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="bg-primary rounded-lg p-1.5">
              <Wifi className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">CheapDataHub</span>
          </div>
        </div>
        <NavLinks />
      </div>

      {/* Mobile header */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="md:hidden flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary rounded-lg p-1.5">
              <Wifi className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">CheapDataHub</span>
          </div>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-gray-100">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden absolute inset-0 z-50 flex">
            <div className="w-72 bg-white flex flex-col shadow-xl">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <span className="font-bold text-gray-900">Menu</span>
                <button onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>
              </div>
              <NavLinks />
            </div>
            <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
