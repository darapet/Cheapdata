import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * One-time setup: Creates a Paystack Transfer Recipient for CheapDataHub's bank account.
 * Call this once from the Admin panel after configuring CheapDataHub bank details.
 * The recipient code is saved to system_settings for future auto-transfers.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Only admin can call this
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user || user.email !== 'daramolapeter98@gmail.com') {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: settings } = await supabase
      .from('system_settings')
      .select('paystack_secret_key, cheapdatahub_bank_account, cheapdatahub_bank_code, cheapdatahub_account_name, cheapdatahub_paystack_recipient_code')
      .limit(1)
      .single()

    if (!settings?.paystack_secret_key) {
      return new Response(JSON.stringify({ error: 'Paystack secret key not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!settings?.cheapdatahub_bank_account || !settings?.cheapdatahub_bank_code) {
      return new Response(JSON.stringify({ error: 'CheapDataHub bank details not configured. Add bank account, bank code and account name in admin settings first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create recipient on Paystack
    const res = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.paystack_secret_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'nuban',
        name: settings.cheapdatahub_account_name || 'CheapDataHub',
        account_number: settings.cheapdatahub_bank_account,
        bank_code: settings.cheapdatahub_bank_code,
        currency: 'NGN',
      }),
    })

    const data = await res.json()

    if (!res.ok || !data?.data?.recipient_code) {
      return new Response(JSON.stringify({ error: 'Paystack rejected recipient creation', details: data }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const recipientCode = data.data.recipient_code

    // Save to system_settings
    await supabase
      .from('system_settings')
      .update({ cheapdatahub_paystack_recipient_code: recipientCode })
      .neq('id', 0)

    return new Response(JSON.stringify({
      success: true,
      recipient_code: recipientCode,
      message: 'Paystack recipient created and saved. Auto-transfer is now ready.',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Setup recipient error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
