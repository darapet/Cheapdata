import {
    corsHeaders, getSupabaseAdmin, verifyAuthToken, verifyUserPin, getSettings,
    cheapdatahubCall, deductWallet, refundWallet, updateTxStatus, makeRef, sendReceipt,
    getUserProfile, jsonResponse,
  } from '../_shared/helpers.ts';

  const ELECTRICITY_FEE = 150;

  // CheapDataHub disco_id integers — match frontend disco names (case-insensitive)
  const DISCO_IDS: Record<string, number> = {
    ikedc: 1, 'ikeja electric': 1, ikeja: 1,
    ekedc: 2, 'eko electric': 2, eko: 2,
    aedc: 3, 'abuja electric': 3, abuja: 3,
    eedc: 4, 'enugu electric': 4, enugu: 4,
    ibedc: 5, 'ibadan electric': 5, ibadan: 5,
    phedc: 6, phed: 6, 'portharcourt electric': 6, 'port harcourt': 6, ph: 6,
    kaedco: 7, 'kaduna electric': 7, kaduna: 7,
    kedco: 8, 'kano electric': 8, kano: 8,
    jed: 9, jedc: 9, 'jos electric': 9, jos: 9,
    bedc: 10, 'benin electric': 10, benin: 10,
    yedc: 11, 'yola electric': 11, yola: 11,
  };

  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.replace('Bearer ', '');
      const user = await verifyAuthToken(supabaseAdmin, token);
      if (!user) return jsonResponse({ success: false, message: 'Invalid or expired token' }, 401);

      const { meter_number, disco, amount, meter_type, phone: phoneParam, pin } = await req.json() as {
        meter_number: string; disco: string; amount: number; meter_type: string; phone?: string; pin: string;
      };

      const pinValid = await verifyUserPin(supabaseAdmin, user.id, pin);
      if (!pinValid) return jsonResponse({ success: false, message: 'Invalid transaction PIN' }, 403);
      if (!amount || amount < 500) return jsonResponse({ success: false, message: 'Minimum electricity amount is ₦500' }, 400);

      const totalCharge = amount + ELECTRICITY_FEE;
      const ref = makeRef('ELEC');
      const description = `${disco} Electricity ₦${Number(amount).toLocaleString()} — Meter ${meter_number}`;
      const deduct = await deductWallet(supabaseAdmin, user.id, totalCharge, description, ref);
      if (!deduct.success) return jsonResponse({ success: false, message: deduct.message }, 400);

      const settings = await getSettings(supabaseAdmin);
      let token_value: string | null = null;

      if (settings?.cheapdatahub_api_key) {
        try {
          // Electricity API: POST /api/v1/resellers/electricity/purchase/
          // Fields: disco_id (integer), meter_number, amount, meter_type, phone
          const discoKey = String(disco).toLowerCase().trim();
          const disco_id = DISCO_IDS[discoKey];
          if (!disco_id) {
            await refundWallet(supabaseAdmin, user.id, totalCharge, ref);
            return jsonResponse({
              success: false,
              message: `Unknown electricity provider: "${disco}". Supported: IKEDC, EKEDC, AEDC, EEDC, IBEDC, PHEDC/PHED, KAEDCO, KEDCO, JED/JEDC, BEDC, YEDC.`
            }, 400);
          }

          const profile = await getUserProfile(supabaseAdmin, user.id);
          const phone = phoneParam?.trim() || profile?.phone || '';

          const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, 'electricity/purchase/', {
            disco_id, meter_number, meter_type, amount, phone,
          });
          if (!ok) {
            await refundWallet(supabaseAdmin, user.id, totalCharge, ref);
            const msg = String(body.message ?? body.detail ?? 'Electricity purchase failed');
            void sendReceipt(supabaseAdmin, user.id, description, totalCharge, ref, 'failed');
            return jsonResponse({ success: false, message: `Electricity purchase failed: ${msg}. Your wallet has been refunded.` }, 400);
          }
          const bodyData = body.data as Record<string, unknown> | undefined;
          token_value = String(bodyData?.token ?? body.token ?? '') || null;
          await updateTxStatus(supabaseAdmin, ref, 'completed');
        } catch {
          await refundWallet(supabaseAdmin, user.id, totalCharge, ref);
          void sendReceipt(supabaseAdmin, user.id, description, totalCharge, ref, 'failed');
          return jsonResponse({ success: false, message: 'Could not reach the electricity provider. Your wallet has been refunded.' }, 502);
        }
      } else {
        await updateTxStatus(supabaseAdmin, ref, 'completed');
      }

      const finalDesc = token_value ? `${description} — Token: ${token_value}` : description;
      void sendReceipt(supabaseAdmin, user.id, finalDesc, totalCharge, ref, 'successful');
      return jsonResponse({
        success: true,
        message: token_value
          ? `Electricity token: ${token_value} (₦${Number(amount).toLocaleString()} + ₦${ELECTRICITY_FEE} fee)`
          : `₦${Number(amount).toLocaleString()} electricity purchased for meter ${meter_number}!`,
        token: token_value,
        reference: ref,
        new_balance: deduct.newBalance,
      });
    } catch (err) {
      console.error('buy-electricity error', err);
      return jsonResponse({ success: false, message: 'Failed to process electricity purchase' }, 500);
    }
  });
  