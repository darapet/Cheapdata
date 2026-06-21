import {
    corsHeaders, getSupabaseAdmin, verifyAuthToken, verifyUserPin, getSettings,
    cheapdatahubCall, deductWallet, refundWallet, updateTxStatus, makeRef, sendReceipt,
    getUserProfile, jsonResponse,
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

      const { smart_card_number, cable_provider, plan_id, phone: phoneParam, pin } = await req.json() as {
        smart_card_number: string; cable_provider: string; plan_id: string; phone?: string; pin: string;
      };

      const pinValid = await verifyUserPin(supabaseAdmin, user.id, pin);
      if (!pinValid) return jsonResponse({ success: false, message: 'Invalid transaction PIN' }, 403);

      const { data: plan } = await supabaseAdmin.from('data_plans').select('*')
        .eq('plan_id', plan_id).eq('service_type', 'cable').single();
      if (!plan) return jsonResponse({ success: false, message: 'Cable plan not found' }, 404);

      const retailPrice = Number(plan.retail_price);

      const ref = makeRef('CABLE');
      const description = `${cable_provider} ${plan.plan_name} — ${smart_card_number}`;
      const deduct = await deductWallet(supabaseAdmin, user.id, retailPrice, description, ref);
      if (!deduct.success) return jsonResponse({ success: false, message: deduct.message }, 400);

      const settings = await getSettings(supabaseAdmin);
      if (settings?.cheapdatahub_api_key) {
        try {
          // Cable TV API: POST /api/v1/resellers/cable/purchase/
          // Required fields: plan_id (integer), cardnumber (string), phone (string)
          const profile = await getUserProfile(supabaseAdmin, user.id);
          const phone = phoneParam || profile?.phone || '';

          const cdhPayload: Record<string, unknown> = {
            cardnumber: smart_card_number,
            phone,
          };
          if (plan.cheapdatahub_plan_id) {
            cdhPayload.plan_id = Number(plan.cheapdatahub_plan_id);
          }

          const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, 'cable/purchase/', cdhPayload);
          if (!ok) {
            await refundWallet(supabaseAdmin, user.id, retailPrice, ref);
            const msg = String(body.message ?? body.detail ?? 'Subscription failed');
            void sendReceipt(supabaseAdmin, user.id, description, retailPrice, ref, 'failed');
            return jsonResponse({ success: false, message: `Cable subscription failed: ${msg}. Your wallet has been refunded.` }, 400);
          }
          await updateTxStatus(supabaseAdmin, ref, 'completed');
        } catch {
          await refundWallet(supabaseAdmin, user.id, retailPrice, ref);
          void sendReceipt(supabaseAdmin, user.id, description, retailPrice, ref, 'failed');
          return jsonResponse({ success: false, message: 'Could not reach the cable provider. Your wallet has been refunded.' }, 502);
        }
      } else {
        await updateTxStatus(supabaseAdmin, ref, 'completed');
      }

      void sendReceipt(supabaseAdmin, user.id, description, retailPrice, ref, 'successful');
      return jsonResponse({ success: true, message: `${cable_provider} ${plan.plan_name} activated for ${smart_card_number}!`, reference: ref, new_balance: deduct.newBalance });
    } catch (err) {
      console.error('buy-cable error', err);
      return jsonResponse({ success: false, message: 'Failed to process cable subscription' }, 500);
    }
  });
  