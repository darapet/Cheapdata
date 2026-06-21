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
import AdminSettings from "@/pages/admin/Settings";
import AdminPlans from "@/pages/admin/Plans";

import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

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
      <Route path="/admin/settings">
        {() => (
          <ProtectedRoute adminOnly>
            <AdminLayout><AdminSettings /></AdminLayout>
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/:rest*">
        {() => (
          <ProtectedRoute>
            <AppLayout>
              <Switch>
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/buy-data" component={BuyData} />
                <Route path="/buy-airtime" component={BuyAirtime} />
                <Route path="/cable-tv" component={CableTV} />
                <Route path="/electricity" component={Electricity} />
                <Route path="/education" component={Education} />
                <Route path="/fund-wallet" component={FundWallet} />
                <Route path="/transactions" component={Transactions} />
                <Route path="/profile" component={Profile} />
                <Route component={NotFound} />
              </Switch>
            </AppLayout>
          </ProtectedRoute>
        )}
      </Route>
    </Switch>
  );
}

function App() {
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

export default App;
