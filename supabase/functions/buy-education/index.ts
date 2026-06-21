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

    const { exam_body, plan_id, quantity = 1, pin } = await req.json() as {
      exam_body: string; plan_id: string; quantity: number; pin: string;
    };

    const pinValid = await verifyUserPin(supabaseAdmin, user.id, pin);
    if (!pinValid) return jsonResponse({ success: false, message: 'Invalid transaction PIN' }, 403);

    const { data: plan } = await supabaseAdmin.from('data_plans').select('*')
      .eq('plan_id', plan_id).eq('service_type', 'education').single();
    if (!plan) return jsonResponse({ success: false, message: 'Education plan not found' }, 404);

    const qty = Math.max(1, Math.min(10, Number(quantity)));
    const totalRetail = Number(plan.retail_price) * qty;
    const wholesalePerPin = Number(plan.wholesale_price ?? (Number(plan.retail_price) - 200));

    const ref = makeRef('EDU');
    const description = `${exam_body} Result Checker × ${qty}`;
    const deduct = await deductWallet(supabaseAdmin, user.id, totalRetail, description, ref);
    if (!deduct.success) return jsonResponse({ success: false, message: deduct.message }, 400);

    const settings = await getSettings(supabaseAdmin);
    let pins: string[] = [];

    if (settings?.cheapdatahub_api_key) {
      try {
        const cdhPayload: Record<string, unknown> = {
          exam_body: String(exam_body).toLowerCase(),
          quantity: qty,
          amount: wholesalePerPin * qty,
          request_id: ref,
        };
        if (plan.cheapdatahub_plan_id) cdhPayload.plan_id = plan.cheapdatahub_plan_id;

        const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, 'education/purchase/', cdhPayload);
        if (!ok) {
          await refundWallet(supabaseAdmin, user.id, totalRetail, ref);
          const msg = String(body.message ?? body.detail ?? 'Education purchase failed');
          void sendReceipt(supabaseAdmin, user.id, description, totalRetail, ref, 'failed');
          return jsonResponse({ success: false, message: `${exam_body} PIN purchase failed: ${msg}. Your wallet has been refunded.` }, 400);
        }
        const bodyData = body.data as Record<string, unknown> | undefined;
        pins = (body.pins ?? bodyData?.pins ?? []) as string[];
        await updateTxStatus(supabaseAdmin, ref, 'completed');
      } catch {
        await refundWallet(supabaseAdmin, user.id, totalRetail, ref);
        void sendReceipt(supabaseAdmin, user.id, description, totalRetail, ref, 'failed');
        return jsonResponse({ success: false, message: 'Could not reach the education provider. Your wallet has been refunded.' }, 502);
      }
    } else {
      await updateTxStatus(supabaseAdmin, ref, 'completed');
    }

    void sendReceipt(supabaseAdmin, user.id, description, totalRetail, ref, 'successful');
    return jsonResponse({
      success: true,
      message: pins.length ? `Your ${exam_body} PIN(s): ${pins.join(', ')}` : `${exam_body} result checker processed successfully.`,
      pins,
      reference: ref,
      new_balance: deduct.newBalance,
    });
  } catch (err) {
    console.error('buy-education error', err);
    return jsonResponse({ success: false, message: 'Failed to process education purchase' }, 500);
  }
});
