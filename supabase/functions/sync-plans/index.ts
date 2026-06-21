import { corsHeaders, getSupabaseAdmin, verifyAuthToken, getSettings, jsonResponse } from '../_shared/helpers.ts';

const ADMIN_EMAIL = 'daramolapeter98@gmail.com';
const BASE = 'https://www.cheapdatahub.ng/api/v1';

const MARKUPS: Record<string, number> = { data: 50, cable: 100, electricity: 150, education: 200 };

async function cdh<T>(path: string, key: string): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) return null;
    const body = await r.json() as any;
    // CheapDataHub wraps in { status: 'true', data: [...] } or returns array directly
    if (Array.isArray(body)) return body as T;
    if (body.status === 'true' || body.status === true) {
      return (body.data ?? body.plans ?? body.results ?? body) as T;
    }
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const user = await verifyAuthToken(supabaseAdmin, token);
    if (!user || user.email !== ADMIN_EMAIL) return jsonResponse({ error: 'Forbidden' }, 403);

    const settings = await getSettings(supabaseAdmin);
    const key = (settings?.cheapdatahub_api_key as string | null)?.trim();
    if (!key) return jsonResponse({ error: 'No CheapDataHub API key saved. Save it in Settings first.' }, 400);

    const { service_type } = await req.json() as { service_type: string };
    if (!service_type) return jsonResponse({ error: 'Missing service_type' }, 400);

    const markup = MARKUPS[service_type] ?? 50;
    let imported = 0;
    const errors: string[] = [];

    if (service_type === 'data') {
      // Provider IDs: MTN=1, AIRTEL=2, GLO=3, 9MOBILE=4
      const networks = [
        { name: 'MTN', id: 1 },
        { name: 'AIRTEL', id: 2 },
        { name: 'GLO', id: 3 },
        { name: '9MOBILE', id: 4 },
      ];

      for (const { name: network, id: pid } of networks) {
        // Try multiple endpoint patterns CheapDataHub may use
        const paths = [
          `/resellers/data/plans/?network_id=${pid}`,
          `/resellers/data/plans/?provider_id=${pid}`,
          `/resellers/data/plans/${pid}/`,
          `/data/plans/?network_id=${pid}`,
          `/data/plans/${pid}/`,
        ];

        let plans: any[] | null = null;
        for (const path of paths) {
          const result = await cdh<any[]>(path, key);
          if (result && Array.isArray(result) && result.length > 0) {
            plans = result;
            break;
          }
        }

        if (!plans || plans.length === 0) {
          errors.push(`No plans found for ${network}`);
          continue;
        }

        for (const p of plans) {
          const wholesale = Number(p.price ?? p.amount ?? p.cost ?? p.plan_price ?? 0);
          if (!wholesale) continue;
          const planId = `${network.toLowerCase()}-cdh-${p.id ?? p.plan_id}`;
          const { error } = await supabaseAdmin.from('data_plans').upsert({
            network,
            plan_name: p.name ?? p.plan_name ?? p.description ?? `${network} Plan`,
            data_size: p.data_size ?? p.size ?? p.volume ?? p.allowance ?? '',
            retail_price: wholesale + markup,
            wholesale_price: wholesale,
            plan_id: planId,
            validity: p.validity ?? p.duration ?? p.period ?? '',
            is_active: true,
            service_type: 'data',
            cheapdatahub_plan_id: String(p.id ?? p.plan_id ?? ''),
          }, { onConflict: 'plan_id' });
          if (!error) imported++;
        }
      }

    } else if (service_type === 'cable') {
      const paths = [
        '/resellers/cable/plans/',
        '/cable/plans/',
        '/resellers/cable/bouquets/',
      ];

      let plans: any[] | null = null;
      for (const path of paths) {
        const result = await cdh<any[]>(path, key);
        if (result && Array.isArray(result) && result.length > 0) { plans = result; break; }
      }

      if (plans && plans.length > 0) {
        for (const p of plans) {
          const wholesale = Number(p.price ?? p.amount ?? p.plan_price ?? 0);
          if (!wholesale) continue;
          const network = (p.provider ?? p.network ?? p.cable_provider ?? 'DSTV').toUpperCase();
          const planId = `cable-${network.toLowerCase()}-${p.id ?? p.plan_id ?? Date.now()}`;
          const { error } = await supabaseAdmin.from('data_plans').upsert({
            network,
            plan_name: p.name ?? p.plan_name ?? p.bouquet_name ?? '',
            data_size: '',
            retail_price: wholesale + markup,
            wholesale_price: wholesale,
            plan_id: planId,
            validity: p.validity ?? p.duration ?? 'Monthly',
            is_active: true,
            service_type: 'cable',
            cheapdatahub_plan_id: String(p.id ?? p.plan_id ?? ''),
          }, { onConflict: 'plan_id' });
          if (!error) imported++;
        }
      } else {
        errors.push('No cable plans returned from CheapDataHub');
      }

    } else if (service_type === 'education') {
      const paths = [
        '/resellers/education/plans/',
        '/education/plans/',
        '/resellers/exam/plans/',
      ];

      let plans: any[] | null = null;
      for (const path of paths) {
        const result = await cdh<any[]>(path, key);
        if (result && Array.isArray(result) && result.length > 0) { plans = result; break; }
      }

      if (plans && plans.length > 0) {
        for (const p of plans) {
          const wholesale = Number(p.price ?? p.amount ?? p.plan_price ?? 0);
          if (!wholesale) continue;
          const network = (p.exam_body ?? p.provider ?? p.name ?? 'WAEC').toUpperCase().split(' ')[0];
          const planId = `edu-${network.toLowerCase()}-${p.id ?? p.plan_id ?? Date.now()}`;
          const { error } = await supabaseAdmin.from('data_plans').upsert({
            network,
            plan_name: p.name ?? p.plan_name ?? p.description ?? `${network} Result Checker`,
            data_size: '',
            retail_price: wholesale + markup,
            wholesale_price: wholesale,
            plan_id: planId,
            validity: '',
            is_active: true,
            service_type: 'education',
            cheapdatahub_plan_id: String(p.id ?? p.plan_id ?? ''),
          }, { onConflict: 'plan_id' });
          if (!error) imported++;
        }
      } else {
        errors.push('No education plans returned from CheapDataHub');
      }
    }

    if (imported > 0) {
      return jsonResponse({
        ok: true,
        imported,
        message: `Synced ${imported} ${service_type} plans (markup +₦${markup} applied)`,
        warnings: errors.length > 0 ? errors : undefined,
      });
    } else {
      return jsonResponse({
        ok: false,
        imported: 0,
        message: 'No plans imported. CheapDataHub may use different endpoint paths — check your API key and account status.',
        warnings: errors,
      }, 200);
    }

  } catch (err) {
    console.error('sync-plans error', err);
    return jsonResponse({ error: `Sync failed: ${(err as Error).message}` }, 500);
  }
});
