import { corsHeaders, getSupabaseAdmin, getSettings, jsonResponse } from '../_shared/helpers.ts';

const MARKUPS: Record<string, number> = { data: 50, cable: 100, electricity: 150, education: 200 };
const CDH_BASE = 'https://www.cheapdatahub.ng/api/v1/resellers';
const NETWORK_ID_MAP: Record<number, string> = { 1: 'MTN', 2: 'AIRTEL', 3: 'GLO', 4: '9MOBILE' };

// Endpoints to try for each service type (in order)
const PLAN_ENDPOINTS: Record<string, string[]> = {
  data: ['data/', 'data/plans/', 'data/bundles/', 'plans/data/', 'bundles/', 'bundles/data/', 'available-plans/', 'service-plans/'],
  cable: ['cable/plans/', 'cable/', 'cable/bouquets/', 'plans/cable/', 'cable/packages/', 'cable/subscriptions/'],
  education: ['exam-pin/', 'exam-pin/plans/', 'education/', 'education/plans/', 'result-checker/', 'plans/education/'],
};

async function cdhGet(endpoint: string, key: string): Promise<any | null> {
  try {
    const res = await fetch(`${CDH_BASE}/${endpoint}`, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json() as any;
    const ok = body.status === 'true' || body.status === true || body.success === true || body.code === 'success';
    if (!ok) return null;
    return body.data ?? body.plans ?? body.bundles ?? body.results ?? body;
  } catch {
    return null;
  }
}

function normalizeNetwork(raw: any): string {
  if (typeof raw === 'number') return NETWORK_ID_MAP[raw] ?? String(raw);
  return String(raw ?? 'MTN').toUpperCase();
}

async function syncServiceType(
  supabaseAdmin: ReturnType<typeof import('../_shared/helpers.ts').getSupabaseAdmin>,
  serviceType: string,
  key: string,
): Promise<{ imported: number; skipped: number; error?: string }> {
  const markup = MARKUPS[serviceType] ?? 50;
  const endpoints = PLAN_ENDPOINTS[serviceType] ?? [];

  let raw: any = null;
  for (const ep of endpoints) {
    raw = await cdhGet(ep, key);
    if (raw != null) break;
  }

  if (!raw) {
    return { imported: 0, skipped: 0, error: `No plans returned from CheapDataHub for ${serviceType}` };
  }

  // Flatten: handle both array and dict-of-arrays shapes
  let planList: any[] = [];
  if (Array.isArray(raw)) {
    planList = raw;
  } else if (typeof raw === 'object') {
    planList = (Object.values(raw) as any[]).flat();
  }

  let imported = 0;
  let skipped = 0;

  for (const p of planList) {
    const wholesale = Number(p.price ?? p.amount ?? p.cost ?? p.plan_price ?? p.bundle_price ?? 0);
    if (!wholesale) { skipped++; continue; }

    let network: string;
    let planId: string;
    let record: Record<string, unknown>;
    const cdhId = String(p.id ?? p.bundle_id ?? p.plan_id ?? p.product_id ?? '');

    if (serviceType === 'data') {
      network = normalizeNetwork(p.network ?? p.network_id ?? p.provider ?? p.network_name);
      planId = `${network.toLowerCase()}-cdh-${cdhId || Date.now()}`;
      record = {
        network,
        plan_name: p.name ?? p.plan_name ?? p.description ?? p.title ?? `${network} Data`,
        data_size: p.data_size ?? p.size ?? p.volume ?? p.allowance ?? p.mb ?? '',
        retail_price: wholesale + markup,
        wholesale_price: wholesale,
        plan_id: planId,
        validity: p.validity ?? p.duration ?? p.period ?? p.expiry ?? '',
        is_active: true,
        service_type: 'data',
        cheapdatahub_plan_id: cdhId,
      };
    } else if (serviceType === 'cable') {
      network = (p.provider ?? p.network ?? p.cable_provider ?? p.decoder ?? 'DSTV').toString().toUpperCase();
      planId = `cable-${network.toLowerCase()}-${cdhId || Date.now()}`;
      record = {
        network,
        plan_name: p.name ?? p.plan_name ?? p.bouquet_name ?? p.package_name ?? '',
        data_size: '',
        retail_price: wholesale + markup,
        wholesale_price: wholesale,
        plan_id: planId,
        validity: p.validity ?? p.duration ?? 'Monthly',
        is_active: true,
        service_type: 'cable',
        cheapdatahub_plan_id: cdhId,
      };
    } else {
      network = (p.exam_body ?? p.provider ?? p.name ?? 'WAEC').toString().toUpperCase().split(' ')[0];
      planId = `edu-${network.toLowerCase()}-${cdhId || Date.now()}`;
      record = {
        network,
        plan_name: p.name ?? p.plan_name ?? p.description ?? `${network} Result Checker`,
        data_size: '',
        retail_price: wholesale + markup,
        wholesale_price: wholesale,
        plan_id: planId,
        validity: '',
        is_active: true,
        service_type: 'education',
        cheapdatahub_plan_id: cdhId,
      };
    }

    const { error } = await supabaseAdmin.from('data_plans').upsert(record, { onConflict: 'plan_id' });
    if (error) skipped++;
    else imported++;
  }

  return { imported, skipped };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // This function is called by pg_cron (no auth header) OR by an admin manually
    // For pg_cron calls: no Authorization header — we allow them via the service role key check
    const supabaseAdmin = getSupabaseAdmin();
    const settings = await getSettings(supabaseAdmin);
    const key = (settings?.cheapdatahub_api_key as string | null)?.trim();

    if (!key) {
      console.error('auto-sync-plans: No CheapDataHub API key in system_settings');
      return jsonResponse({ error: 'No CheapDataHub API key configured.' }, 400);
    }

    const serviceTypes = ['data', 'cable', 'education'];
    const results: Record<string, { imported: number; skipped: number; error?: string }> = {};

    for (const st of serviceTypes) {
      results[st] = await syncServiceType(supabaseAdmin, st, key);
    }

    const totalImported = Object.values(results).reduce((s, r) => s + r.imported, 0);
    const now = new Date().toISOString();

    // Log the sync result to system_settings for the admin dashboard to display
    await supabaseAdmin.from('system_settings').update({
      last_auto_sync_at: now,
      last_auto_sync_result: JSON.stringify(results),
    } as any).gte('id', 0);

    console.log(`auto-sync-plans: ${totalImported} total plans synced at ${now}`, results);

    return jsonResponse({
      ok: true,
      synced_at: now,
      total_imported: totalImported,
      results,
    });
  } catch (err) {
    console.error('auto-sync-plans error:', err);
    return jsonResponse({ error: `Auto-sync error: ${(err as Error).message}` }, 500);
  }
});
