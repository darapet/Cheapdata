import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'node:crypto'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch Paystack secret key from settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('paystack_secret_key')
      .limit(1)
      .single()

    const paystackSecret = settings?.paystack_secret_key || Deno.env.get('PAYSTACK_SECRET_KEY')

    if (!paystackSecret) {
      return new Response('Paystack not configured', { status: 500 })
    }

    // Verify Paystack signature
    const signature = req.headers.get('x-paystack-signature')
    const body = await req.text()

    const hash = createHmac('sha512', paystackSecret).update(body).digest('hex')
    if (hash !== signature) {
      return new Response('Invalid signature', { status: 401 })
    }

    const event = JSON.parse(body)
    const { event: eventType, data } = event

    if (eventType === 'charge.success') {
      const reference = data.reference
      const amountKobo = data.amount
      const amount = amountKobo / 100
      const customerEmail = data.customer?.email

      // Find the user by email
      const { data: authUser } = await supabase.auth.admin.listUsers()
      const user = authUser?.users?.find((u: any) => u.email === customerEmail)

      if (!user) {
        console.error(`No user found for email: ${customerEmail}`)
        return new Response('ok', { status: 200 })
      }

      // Check if this reference was already processed (prevent duplicate crediting)
      const { data: existing } = await supabase
        .from('wallet_fundings')
        .select('id')
        .eq('reference', reference)
        .eq('status', 'successful')
        .single()

      if (existing) {
        return new Response('Already processed', { status: 200 })
      }

      // Credit user wallet
      const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user.id)
        .single()

      const currentBalance = Number(profile?.wallet_balance || 0)
      const newBalance = currentBalance + amount

      await supabase
        .from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', user.id)

      // Record successful funding transaction
      await supabase.from('wallet_fundings').upsert({
        user_id: user.id,
        type: 'funding',
        description: `Wallet funded via Paystack`,
        amount,
        status: 'successful',
        reference,
      }, { onConflict: 'reference' })
    }

    if (eventType === 'transfer.success') {
      // Update the transfer record in our DB
      const transferCode = data.transfer_code
      await supabase
        .from('paystack_transfers')
        .update({ status: 'success' })
        .eq('transfer_code', transferCode)
    }

    if (eventType === 'transfer.failed' || eventType === 'transfer.reversed') {
      const transferCode = data.transfer_code
      await supabase
        .from('paystack_transfers')
        .update({ status: eventType === 'transfer.failed' ? 'failed' : 'reversed' })
        .eq('transfer_code', transferCode)
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
