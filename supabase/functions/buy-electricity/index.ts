import {
  corsHeaders, getSupabaseAdmin, verifyAuthToken, verifyUserPin, getSettings,
  cheapdatahubCall, deductWallet, refundWallet, updateTxStatus, makeRef, sendReceipt, jsonResponse,
} from '../_shared/helpers.ts';

const ELECTRICITY_FEE = 150;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

    const supabaseAdmin = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const user = await verifyAuthToken(supabaseAdmin, token);
    if (!user) return jsonResponse({ success: false, message: 'Invalid or expired token' }, 401);

    const { meter_number, disco, amount, meter_type, pin } = await req.json() as {
      meter_number: string; disco: string; amount: number; meter_type: string; pin: string;
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
        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, 'electricity/purchase/', {
          disco: String(disco).toLowerCase(), meter_number, meter_type, amount, request_id: ref,
        });
        if (!ok) {
          await refundWallet(supabaseAdmin, user.id, totalCharge, ref);
          const msg = String(body.message ?? body.detail ?? 'Electricity purchase failed');
          void sendReceipt(supabaseAdmin, user.id, description, totalCharge, ref, 'failed');
          return jsonResponse({ success: false, message: `Electricity purchase failed: ${msg}. Your wallet has been refunded.` }, 400);
        }
        token_value = String(body.token ?? (body.data as Record<string, unknown>)?.token ?? '') || null;
        await updateTxStatus(supabaseAdmin, ref, 'completed');
      } catch {
        await refundWallet(supabaseAdmin, user.id, totalCharge, ref);
        void sendReceipt(supabaseAdmin, user.id, description, totalCharge, ref, 'failed');
        return jsonResponse({ success: false, message: 'Could not reach the electricity provider. Your wallet has been refunded.' }, 502);
      }
    } else {
      await updateTxStatus(supabaseAdmin, ref, 'completed');
    }

    const finalDesc = token_value ? `${description} | Token: ${token_value}` : description;
    void sendReceipt(supabaseAdmin, user.id, finalDesc, totalCharge, ref, 'successful');
    return jsonResponse({
      success: true,
      message: token_value ? `Token: ${token_value}` : `Electricity payment processed for meter ${meter_number}`,
      token: token_value,
      reference: ref,
      new_balance: deduct.newBalance,
    });
  } catch (err) {
    console.error('buy-electricity error', err);
    return jsonResponse({ success: false, message: 'Failed to process electricity purchase' }, 500);
  }
});
