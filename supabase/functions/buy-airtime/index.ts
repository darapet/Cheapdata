import {
    corsHeaders, getSupabaseAdmin, verifyAuthToken, verifyUserPin, getSettings,
    cheapdatahubCall, deductWallet, refundWallet, updateTxStatus, makeRef, sendReceipt, jsonResponse,
  } from '../_shared/helpers.ts';

  // CheapDataHub provider IDs (Airtime API: provider_id integer)
  const PROVIDER_IDS: Record<string, number> = { MTN: 1, AIRTEL: 2, GLO: 3, '9MOBILE': 4 };

  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.replace('Bearer ', '');
      const user = await verifyAuthToken(supabaseAdmin, token);
      if (!user) return jsonResponse({ success: false, message: 'Invalid or expired token' }, 401);

      const { phone, network, amount, pin } = await req.json() as {
        phone: string; network: string; amount: number; pin: string;
      };

      const pinValid = await verifyUserPin(supabaseAdmin, user.id, pin);
      if (!pinValid) return jsonResponse({ success: false, message: 'Invalid transaction PIN' }, 403);
      if (!amount || amount < 50) return jsonResponse({ success: false, message: 'Minimum airtime is ₦50' }, 400);

      const ref = makeRef('AIR');
      const description = `${network} Airtime ₦${Number(amount).toLocaleString()} — ${phone}`;
      const deduct = await deductWallet(supabaseAdmin, user.id, amount, description, ref);
      if (!deduct.success) return jsonResponse({ success: false, message: deduct.message }, 400);

      const settings = await getSettings(supabaseAdmin);
      if (settings?.cheapdatahub_api_key) {
        // Airtime API: POST /api/v1/resellers/airtime/purchase/
        // Fields: provider_id (integer), phone_number (string), amount (number)
        const providerId = PROVIDER_IDS[String(network).toUpperCase()] ?? 1;
        try {
          const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, 'airtime/purchase/', {
            provider_id: providerId,
            phone_number: phone,
            amount,
          });
          if (!ok) {
            await refundWallet(supabaseAdmin, user.id, amount, ref);
            const msg = String(body.message ?? body.detail ?? 'Service provider rejected the request');
            void sendReceipt(supabaseAdmin, user.id, description, amount, ref, 'failed');
            return jsonResponse({ success: false, message: `Airtime purchase failed: ${msg}. Your wallet has been refunded.` }, 400);
          }
          await updateTxStatus(supabaseAdmin, ref, 'completed');
        } catch {
          await refundWallet(supabaseAdmin, user.id, amount, ref);
          void sendReceipt(supabaseAdmin, user.id, description, amount, ref, 'failed');
          return jsonResponse({ success: false, message: 'Could not reach the airtime provider. Your wallet has been refunded.' }, 502);
        }
      } else {
        await updateTxStatus(supabaseAdmin, ref, 'completed');
      }

      void sendReceipt(supabaseAdmin, user.id, description, amount, ref, 'successful');
      return jsonResponse({
        success: true,
        message: `₦${Number(amount).toLocaleString()} airtime sent to ${phone}!`,
        reference: ref,
        new_balance: deduct.newBalance,
      });
    } catch (err) {
      console.error('buy-airtime error', err);
      return jsonResponse({ success: false, message: 'Failed to process airtime purchase' }, 500);
    }
  });
  