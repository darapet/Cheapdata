import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getSupabaseAdmin, verifyAuthToken, hashPin, jsonResponse } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

    const supabaseAdmin = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const user = await verifyAuthToken(supabaseAdmin, token);
    if (!user) return jsonResponse({ success: false, message: 'Invalid or expired token' }, 401);

    const body = await req.json() as { action: string; email?: string; otp?: string; new_pin?: string };

    // ── ACTION: send ─────────────────────────────────────────────────────────
    // Uses Supabase Auth's built-in OTP email — no Brevo / SMTP needed
    if (body.action === 'send') {
      const email = body.email?.toString().trim().toLowerCase() || user.email || '';

      console.log('[send-otp] Sending built-in OTP to:', email || 'MISSING');

      if (!email) {
        return jsonResponse({ success: false, message: 'Please enter your email address.' }, 400);
      }

      // Use Supabase's own email system (same as signup/password-reset emails)
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { error } = await anonClient.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (error) {
        console.error('[send-otp] signInWithOtp error:', error.message);
        // "Email not confirmed" or "User not found" → the email doesn't match their account
        if (error.message.includes('not found') || error.message.includes('not exist') || error.message.includes('Email not confirmed')) {
          return jsonResponse({ success: false, message: 'No account found for that email. Please check and try again.' }, 400);
        }
        return jsonResponse({ success: false, message: `Could not send code: ${error.message}` }, 500);
      }

      // Save email to profile if missing
      await supabaseAdmin
        .from('profiles')
        .upsert({ id: user.id, email }, { onConflict: 'id' });

      console.log('[send-otp] OTP dispatched via Supabase Auth for:', email);
      return jsonResponse({ success: true, message: 'OTP sent to your email' });
    }

    // ── ACTION: verify_and_reset ──────────────────────────────────────────────
    if (body.action === 'verify_and_reset') {
      const { email, otp, new_pin } = body as { email?: string; otp?: string; new_pin?: string };

      if (!email || !otp || !new_pin || new_pin.length !== 4) {
        return jsonResponse({ success: false, message: 'Email, OTP code and 4-digit new PIN are all required.' }, 400);
      }

      // Verify the OTP using Supabase Auth — this is the same code Supabase emailed
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      const { data, error } = await anonClient.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });

      if (error || !data.user) {
        console.error('[send-otp] verifyOtp error:', error?.message);
        return jsonResponse({ success: false, message: 'Incorrect or expired code. Please try again.' }, 400);
      }

      // Make sure the verified email belongs to the same user making the request
      if (data.user.id !== user.id) {
        console.error('[send-otp] User mismatch:', data.user.id, '!==', user.id);
        return jsonResponse({ success: false, message: 'Email does not match your account.' }, 403);
      }

      const hashed = await hashPin(new_pin);
      const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({ transaction_pin: hashed })
        .eq('id', user.id);

      if (updateErr) {
        console.error('[send-otp] PIN update error:', updateErr);
        return jsonResponse({ success: false, message: 'Failed to save PIN. Please try again.' }, 500);
      }

      console.log('[send-otp] PIN reset successfully for user:', user.id);
      return jsonResponse({ success: true, message: 'Transaction PIN updated successfully' });
    }

    return jsonResponse({ success: false, message: 'Unknown action' }, 400);

  } catch (err) {
    console.error('[send-otp] Unexpected error:', err);
    return jsonResponse({ success: false, message: 'Server error. Please try again.' }, 500);
  }
});
