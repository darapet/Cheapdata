import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import BuyData from "@/pages/BuyData";
import BuyAirtime from "@/pages/BuyAirtime";
import CableTV from "@/pages/CableTV";
import Electricity from "@/pages/Electricity";
import Education from "@/pages/Education";
import FundWallet from "@/pages/FundWallet";
import Transactions from "@/pages/Transactions";
import Profile from "@/pages/Profile";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminUsers from "@/pages/admin/Users";
import AdminTransactions from "@/pages/admin/Transactions";
import AdminTransfers from "@/pages/admin/Transfers";
import AdminSettings from "@/pages/admin/Settings";
import AdminPlans from "@/pages/admin/Plans";

import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      <Route path="/admin">
        {() => <Redirect to="/admin/dashboard" />}
      </Route>
      <Route path="/admin/dashboard">
        {() => (
          <ProtectedRoute adminOnly>
            <AdminLayout><AdminDashboard /></AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/plans">
        {() => (
          <ProtectedRoute adminOnly>
            <AdminLayout><AdminPlans /></AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/users">
        {() => (
          <ProtectedRoute adminOnly>
            <AdminLayout><AdminUsers /></AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/transactions">
        {() => (
          <ProtectedRoute adminOnly>
            <AdminLayout><AdminTransactions /></AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/transfers">
        {() => (
          <ProtectedRoute adminOnly>
            <AdminLayout><AdminTransfers /></AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/settings">
        {() => (
          <ProtectedRoute adminOnly>
            <AdminLayout><AdminSettings /></AdminLayout>
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/dashboard">
        {() => (
          <ProtectedRoute>
            <AppLayout><Dashboard /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/buy-data">
        {() => (
          <ProtectedRoute>
            <AppLayout><BuyData /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/buy-airtime">
        {() => (
          <ProtectedRoute>
            <AppLayout><BuyAirtime /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/cable-tv">
        {() => (
          <ProtectedRoute>
            <AppLayout><CableTV /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/electricity">
        {() => (
          <ProtectedRoute>
            <AppLayout><Electricity /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/education">
        {() => (
          <ProtectedRoute>
            <AppLayout><Education /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/fund-wallet">
        {() => (
          <ProtectedRoute>
            <AppLayout><FundWallet /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/transactions">
        {() => (
          <ProtectedRoute>
            <AppLayout><Transactions /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/profile">
        {() => (
          <ProtectedRoute>
            <AppLayout><Profile /></AppLayout>
          </ProtectedRoute>
        )}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
