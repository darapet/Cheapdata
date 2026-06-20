import { Link, useLocation } from "wouter";
import { LayoutDashboard, Settings, Users, History, ArrowLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Transactions", href: "/admin/transactions", icon: History },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full bg-gray-50">
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-shrink-0 flex-col">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-bold text-gray-900">Admin Panel</span>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-1 py-4">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <a className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-white" : "text-gray-600 hover:bg-purple-50 hover:text-primary"
                )}>
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </a>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <Link href="/dashboard">
            <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5" />
              Back to App
            </a>
          </Link>
        </div>
      </div>

      {/* Mobile top nav */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-bold text-gray-900">Admin Panel</span>
        </div>
        <div className="md:hidden flex overflow-x-auto bg-white border-b border-gray-200 px-4 gap-1 pb-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <a className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap",
                  isActive ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
                )}>
                  <item.icon className="h-3.5 w-3.5" />
                  {item.name}
                </a>
              </Link>
            );
          })}
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
