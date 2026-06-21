import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Plus, Trash2, ToggleLeft, ToggleRight, Database } from "lucide-react";
import { formatNaira } from "@/lib/utils";

const EDGE_BASE = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1';
async function edgeHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const MARKUPS = { data: 50, cable: 100, electricity: 150, education: 200 };

type Plan = {
  id: number;
  network: string;
  plan_name: string;
  data_size: string;
  retail_price: number;
  wholesale_price: number;
  plan_id: string;
  validity: string;
  is_active: boolean;
  service_type: string;
  cheapdatahub_plan_id: string | null;
};

type NewPlan = Omit<Plan, "id" | "is_active"> & { is_active: boolean };

const SERVICE_TABS = [
  { key: "data", label: "Data Plans", networks: ["MTN", "AIRTEL", "GLO", "9MOBILE"] },
  { key: "cable", label: "Cable TV", networks: ["DSTV", "GOTV", "STARTIMES"] },
  { key: "education", label: "WAEC / JAMB", networks: ["WAEC", "NECO", "JAMB", "GCE"] },
];

function PlanRow({ plan, onToggle, onDelete }: { plan: Plan; onToggle: (id: number, active: boolean) => void; onDelete: (id: number) => void }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${plan.is_active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">{plan.plan_name}</span>
          <Badge variant="outline" className="text-xs">{plan.network}</Badge>
          {plan.cheapdatahub_plan_id && <Badge variant="secondary" className="text-xs">ID: {plan.cheapdatahub_plan_id}</Badge>}
        </div>
        <div className="flex gap-3 mt-1 text-xs text-gray-500">
          <span>Cost: {formatNaira(plan.wholesale_price)}</span>
          <span>Your Price: {formatNaira(plan.retail_price)}</span>
          <span>Profit: {formatNaira(plan.retail_price - plan.wholesale_price)}</span>
          {plan.validity && <span>Validity: {plan.validity}</span>}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => onToggle(plan.id, !plan.is_active)}
          className={`p-1.5 rounded ${plan.is_active ? "text-green-600" : "text-gray-400"}`}>
          {plan.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
        </button>
        <button onClick={() => onDelete(plan.id)} className="p-1.5 rounded text-red-400 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function AdminPlans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("data");
  const [syncing, setSyncing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newPlan, setNewPlan] = useState<Partial<NewPlan>>({ service_type: "data", is_active: true });

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["admin-plans", activeTab],
    queryFn: async () => {
      const { data, error } = await supabase.from("data_plans").select("*")
        .eq("service_type", activeTab).order("network").order("retail_price");
      if (error) throw error;
      return data ?? [];
    },
  });

  const togglePlan = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const { error } = await supabase.from("data_plans").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-plans", activeTab] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("data_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-plans", activeTab] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addPlan = useMutation({
    mutationFn: async (plan: Partial<NewPlan>) => {
      const markup = MARKUPS[plan.service_type as keyof typeof MARKUPS] ?? 50;
      const wholesale = Number(plan.wholesale_price ?? 0);
      const payload = {
        network: (plan.network ?? "").toUpperCase(),
        plan_name: plan.plan_name ?? "",
        data_size: plan.data_size ?? "",
        retail_price: wholesale + markup,
        wholesale_price: wholesale,
        plan_id: plan.plan_id || `${plan.service_type}-${Date.now()}`,
        validity: plan.validity ?? "",
        is_active: true,
        service_type: plan.service_type ?? "data",
        cheapdatahub_plan_id: plan.cheapdatahub_plan_id || null,
      };
      const { error } = await supabase.from("data_plans").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans", activeTab] });
      setShowAdd(false);
      setNewPlan({ service_type: activeTab, is_active: true });
      toast({ title: "Plan Added", description: "New plan added successfully." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${EDGE_BASE}/sync-plans`, {
        method: 'POST',
        headers: await edgeHeaders(),
        body: JSON.stringify({ service_type: activeTab }),
      });
      const result = await res.json() as any;

      if (!res.ok) {
        toast({ title: "Sync Failed", description: result.error ?? "Unknown error", variant: "destructive" });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });

      if (result.imported > 0) {
        toast({
          title: `✓ Synced ${result.imported} plans`,
          description: result.message + (result.warnings?.length ? ` (${result.warnings.join('; ')})` : ''),
        });
      } else {
        toast({
          title: "No Plans Imported",
          description: result.message ?? "CheapDataHub returned no plans. Check your API key and account status.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const currentTab = SERVICE_TABS.find(t => t.key === activeTab)!;
  const grouped = currentTab.networks.reduce((acc, net) => {
    acc[net] = plans.filter(p => p.network === net);
    return acc;
  }, {} as Record<string, Plan[]>);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plans Management</h1>
          <p className="text-sm text-gray-500 mt-1">Sync from CheapDataHub or add plans manually. Markups: Data +₦50 · Cable +₦100 · WAEC +₦200</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="flex items-center gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Syncing..." : "Sync from CheapDataHub"}
          </Button>
          <Button onClick={() => { setShowAdd(true); setNewPlan({ service_type: activeTab, is_active: true }); }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Plan
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {SERVICE_TABS.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setShowAdd(false); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Add Plan Form */}
      {showAdd && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Add New {currentTab.label} Plan</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Provider / Network</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={newPlan.network ?? ""} onChange={e => setNewPlan(p => ({ ...p, network: e.target.value }))}>
                  <option value="">-- Select --</option>
                  {currentTab.networks.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Plan Name</Label>
                <Input placeholder="e.g. MTN 1GB 30 Days" value={newPlan.plan_name ?? ""} onChange={e => setNewPlan(p => ({ ...p, plan_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>CheapDataHub Cost (₦) <span className="text-gray-400 text-xs">— your purchase price</span></Label>
                <Input type="number" placeholder="228" value={newPlan.wholesale_price ?? ""} onChange={e => setNewPlan(p => ({ ...p, wholesale_price: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Your Price (₦) <span className="text-green-600 text-xs">= Cost + ₦{MARKUPS[activeTab as keyof typeof MARKUPS]} auto-added</span></Label>
                <Input type="number" readOnly value={(Number(newPlan.wholesale_price ?? 0) + MARKUPS[activeTab as keyof typeof MARKUPS])} className="bg-gray-50" />
              </div>
              <div className="space-y-1.5">
                <Label>{activeTab === "data" ? "Data Size" : "Description"}</Label>
                <Input placeholder={activeTab === "data" ? "1GB" : "e.g. DStv Compact"} value={newPlan.data_size ?? ""} onChange={e => setNewPlan(p => ({ ...p, data_size: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Validity</Label>
                <Input placeholder="30 days / Monthly" value={newPlan.validity ?? ""} onChange={e => setNewPlan(p => ({ ...p, validity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>CheapDataHub Plan ID <span className="text-gray-400 text-xs">(from their Plan IDs page)</span></Label>
                <Input placeholder="e.g. 101" value={newPlan.cheapdatahub_plan_id ?? ""} onChange={e => setNewPlan(p => ({ ...p, cheapdatahub_plan_id: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => addPlan.mutate(newPlan)} disabled={addPlan.isPending || !newPlan.network || !newPlan.plan_name || !newPlan.wholesale_price}>
                {addPlan.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Plan
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans by network */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-4">
          {currentTab.networks.map(network => {
            const netPlans = grouped[network] ?? [];
            return (
              <Card key={network}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="h-4 w-4 text-gray-400" />
                    {network}
                    <Badge variant="outline" className="text-xs">{netPlans.length} plans</Badge>
                    {netPlans.length === 0 && <span className="text-xs text-orange-600 font-normal">No plans yet — sync or add manually</span>}
                  </CardTitle>
                </CardHeader>
                {netPlans.length > 0 && (
                  <CardContent className="pt-0 space-y-2">
                    {netPlans.map(plan => (
                      <PlanRow key={plan.id} plan={plan}
                        onToggle={(id, active) => togglePlan.mutate({ id, active })}
                        onDelete={id => { if (confirm("Delete this plan?")) deletePlan.mutate(id); }}
                      />
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
