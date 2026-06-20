import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import BuyData from "@/pages/BuyData";
import BuyAirtime from "@/pages/BuyAirtime";
import CableTV from "@/pages/CableTV";
import Electricity from "@/pages/Electricity";
import FundWallet from "@/pages/FundWallet";
import Transactions from "@/pages/Transactions";
import Profile from "@/pages/Profile";
import NotFound from "@/pages/not-found";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminSettings from "@/pages/admin/Settings";
import AdminUsers from "@/pages/admin/Users";
import AdminTransactions from "@/pages/admin/Transactions";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/buy-data">
        <ProtectedRoute><BuyData /></ProtectedRoute>
      </Route>
      <Route path="/buy-airtime">
        <ProtectedRoute><BuyAirtime /></ProtectedRoute>
      </Route>
      <Route path="/cable-tv">
        <ProtectedRoute><CableTV /></ProtectedRoute>
      </Route>
      <Route path="/electricity">
        <ProtectedRoute><Electricity /></ProtectedRoute>
      </Route>
      <Route path="/fund-wallet">
        <ProtectedRoute><FundWallet /></ProtectedRoute>
      </Route>
      <Route path="/transactions">
        <ProtectedRoute><Transactions /></ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute><Profile /></ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute adminOnly><AdminSettings /></ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>
      </Route>
      <Route path="/admin/transactions">
        <ProtectedRoute adminOnly><AdminTransactions /></ProtectedRoute>
      </Route>
      <Route path="/">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
