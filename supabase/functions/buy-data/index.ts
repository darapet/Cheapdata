import {
    corsHeaders, getSupabaseAdmin, verifyAuthToken, verifyUserPin, getSettings,
    cheapdatahubCall, deductWallet, refundWallet, updateTxStatus, makeRef, sendReceipt, jsonResponse,
  } from '../_shared/helpers.ts';

  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.replace('Bearer ', '');
      const user = await verifyAuthToken(supabaseAdmin, token);
      if (!user) return jsonResponse({ success: false, message: 'Invalid or expired token' }, 401);

      const { phone, plan_id, network, pin } = await req.json() as {
        phone: string; plan_id: string; network: string; pin: string;
      };

      const pinValid = await verifyUserPin(supabaseAdmin, user.id, pin);
      if (!pinValid) return jsonResponse({ success: false, message: 'Invalid transaction PIN' }, 403);

      const { data: plan } = await supabaseAdmin.from('data_plans').select('*').eq('plan_id', plan_id).single();
      if (!plan) return jsonResponse({ success: false, message: 'Data plan not found' }, 404);

      const ref = makeRef('DATA');
      const description = `${network} ${plan.data_size} Data — ${phone}`;
      const deduct = await deductWallet(supabaseAdmin, user.id, plan.retail_price, description, ref);
      if (!deduct.success) return jsonResponse({ success: false, message: deduct.message }, 400);

      const settings = await getSettings(supabaseAdmin);
      if (settings?.cheapdatahub_api_key) {
        // Data API: POST /api/v1/resellers/data/purchase/
        // Required fields: bundle_id (integer), phone_number (string)
        const payload: Record<string, unknown> = { phone_number: phone };
        if (plan.cheapdatahub_plan_id) {
          payload.bundle_id = Number(plan.cheapdatahub_plan_id);
        }

        try {
          const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, 'data/purchase/', payload);
          if (!ok) {
            await refundWallet(supabaseAdmin, user.id, plan.retail_price, ref);
            const msg = String(body.message ?? body.detail ?? 'Service provider rejected the request');
            void sendReceipt(supabaseAdmin, user.id, description, plan.retail_price, ref, 'failed');
            return jsonResponse({ success: false, message: `Data purchase failed: ${msg}. Your wallet has been refunded.` }, 400);
          }
          await updateTxStatus(supabaseAdmin, ref, 'completed');
        } catch {
          await refundWallet(supabaseAdmin, user.id, plan.retail_price, ref);
          void sendReceipt(supabaseAdmin, user.id, description, plan.retail_price, ref, 'failed');
          return jsonResponse({ success: false, message: 'Could not reach the data provider. Your wallet has been refunded.' }, 502);
        }
      } else {
        await updateTxStatus(supabaseAdmin, ref, 'completed');
      }

      void sendReceipt(supabaseAdmin, user.id, description, plan.retail_price, ref, 'successful');
      return jsonResponse({ success: true, message: `${plan.data_size} data activated on ${phone}!`, reference: ref, new_balance: deduct.newBalance });
    } catch (err) {
      console.error('buy-data error', err);
      return jsonResponse({ success: false, message: 'Failed to process data purchase' }, 500);
    }
  });
  