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

      // CheapDataHub only allows quantity 1, 2, or 5
      const validQty = [1, 2, 5];
      const qty = validQty.includes(Number(quantity)) ? Number(quantity) : 1;
      const totalRetail = Number(plan.retail_price) * qty;

      const ref = makeRef('EDU');
      const description = `${exam_body} Result Checker × ${qty}`;
      const deduct = await deductWallet(supabaseAdmin, user.id, totalRetail, description, ref);
      if (!deduct.success) return jsonResponse({ success: false, message: deduct.message }, 400);

      const settings = await getSettings(supabaseAdmin);
      let pins: string[] = [];

      if (settings?.cheapdatahub_api_key) {
        try {
          // Exam PIN API: POST /api/v1/resellers/exam-pin/purchase/
          // Required fields: product_id (integer from cheapdatahub_plan_id), quantity (1|2|5)
          if (!plan.cheapdatahub_plan_id) {
            await refundWallet(supabaseAdmin, user.id, totalRetail, ref);
            return jsonResponse({ success: false, message: 'Exam PIN product ID not configured. Contact admin.' }, 400);
          }

          const cdhPayload: Record<string, unknown> = {
            product_id: Number(plan.cheapdatahub_plan_id),
            quantity: qty,
          };

          const { ok, body } = await cheapdatahubCall(settings.cheapdatahub_api_key, 'exam-pin/purchase/', cdhPayload);
          if (!ok) {
            await refundWallet(supabaseAdmin, user.id, totalRetail, ref);
            const msg = String(body.message ?? body.detail ?? 'Education purchase failed');
            void sendReceipt(supabaseAdmin, user.id, description, totalRetail, ref, 'failed');
            return jsonResponse({ success: false, message: `${exam_body} PIN purchase failed: ${msg}. Your wallet has been refunded.` }, 400);
          }
          // Response: { "data": { "delivery": { "pins": ["..."] } } }
          const bodyData = body.data as Record<string, unknown> | undefined;
          const delivery = bodyData?.delivery as Record<string, unknown> | undefined;
          pins = (delivery?.pins ?? body.pins ?? []) as string[];
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
  