import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { plan_id, phone_number } = await req.json()
    if (!plan_id || !phone_number) {
      return new Response(JSON.stringify({ error: 'plan_id and phone_number are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch plan
    const { data: plan, error: planError } = await supabase
      .from('data_plans')
      .select('*')
      .eq('plan_id', plan_id)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found or inactive' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch user wallet balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const retailPrice = Number(plan.retail_price)
    const wholesalePrice = Number(plan.wholesale_price)
    const walletBalance = Number(profile.wallet_balance)

    if (walletBalance < retailPrice) {
      return new Response(JSON.stringify({
        error: 'Insufficient wallet balance',
        balance: walletBalance,
        required: retailPrice
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch system settings
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .single()

    if (settingsError || !settings) {
      return new Response(JSON.stringify({ error: 'System settings not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Deduct wallet balance FIRST (reserve the amount)
    const newBalance = walletBalance - retailPrice
    const { error: deductError } = await supabase
      .from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', user.id)

    if (deductError) {
      return new Response(JSON.stringify({ error: 'Failed to deduct wallet balance' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Record debit transaction
    const txRef = `DATA-${Date.now()}-${user.id.slice(0, 8)}`
    await supabase.from('wallet_fundings').insert({
      user_id: user.id,
      type: 'data',
      description: `${plan.data_size} ${plan.network} data for ${phone_number}`,
      amount: -retailPrice,
      status: 'pending',
      reference: txRef,
    })

    // Call CheapDataHub API to purchase data
    let dataPurchaseSuccess = false
    let dataPurchaseResponse: any = null

    try {
      const cheapdataRes = await fetch(`${settings.cheapdatahub_base_url}/api/data`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${settings.cheapdatahub_api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          network: plan.network.toLowerCase(),
          mobile_number: phone_number,
          plan: plan.cheapdatahub_plan_id || plan.plan_id,
          Ported_number: true,
        }),
      })
      dataPurchaseResponse = await cheapdataRes.json()
      dataPurchaseSuccess = cheapdataRes.ok || dataPurchaseResponse?.status === 'success'
    } catch (err) {
      console.error('CheapDataHub API error:', err)
    }

    if (!dataPurchaseSuccess) {
      // Refund wallet if CheapDataHub purchase failed
      await supabase.from('profiles').update({ wallet_balance: walletBalance }).eq('id', user.id)
      await supabase.from('wallet_fundings').update({ status: 'failed' }).eq('reference', txRef)

      return new Response(JSON.stringify({
        error: 'Data purchase failed. Your wallet has been refunded.',
        details: dataPurchaseResponse
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Mark transaction successful
    await supabase.from('wallet_fundings').update({ status: 'successful' }).eq('reference', txRef)

    // AUTO-FUND: Send wholesale cost to CheapDataHub bank account via Paystack Transfer
    let transferResult: any = null
    if (settings.cheapdatahub_auto_fund && settings.paystack_secret_key) {
      transferResult = await initiatePaystackTransfer({
        paystackKey: settings.paystack_secret_key,
        recipientCode: settings.cheapdatahub_paystack_recipient_code,
        amount: wholesalePrice,
        reason: `Auto-fund for order ${txRef} (${plan.data_size} ${plan.network})`,
        supabase,
        orderId: txRef,
        userId: user.id,
        // Bank details for creating recipient if code not set yet
        bankAccount: settings.cheapdatahub_bank_account,
        bankCode: settings.cheapdatahub_bank_code,
        accountName: settings.cheapdatahub_account_name,
      })
    }

    return new Response(JSON.stringify({
      success: true,
      message: `${plan.data_size} ${plan.network} data sent to ${phone_number}`,
      reference: txRef,
      new_balance: newBalance,
      profit: retailPrice - wholesalePrice,
      auto_transfer: transferResult,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('buy-data error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function initiatePaystackTransfer({
  paystackKey,
  recipientCode,
  amount,
  reason,
  supabase,
  orderId,
  userId,
  bankAccount,
  bankCode,
  accountName,
}: {
  paystackKey: string
  recipientCode: string | null
  amount: number
  reason: string
  supabase: any
  orderId: string
  userId: string
  bankAccount: string
  bankCode: string
  accountName: string
}) {
  try {
    let code = recipientCode

    // Create recipient if not saved yet
    if (!code) {
      code = await createPaystackRecipient({ paystackKey, bankAccount, bankCode, accountName, supabase })
      if (!code) return { error: 'Failed to create Paystack recipient' }
    }

    // Initiate transfer (amount in kobo)
    const transferRes = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'balance',
        amount: Math.round(amount * 100),
        recipient: code,
        reason,
        reference: `AUTOFUND-${orderId}`,
      }),
    })

    const transferData = await transferRes.json()

    // Save transfer record
    await supabase.from('paystack_transfers').insert({
      order_reference: orderId,
      user_id: userId,
      amount,
      recipient_code: code,
      transfer_code: transferData?.data?.transfer_code || null,
      status: transferData?.data?.status || 'failed',
      reason,
      response: transferData,
    })

    return { transfer_code: transferData?.data?.transfer_code, status: transferData?.data?.status }
  } catch (err) {
    console.error('Paystack transfer error:', err)
    return { error: String(err) }
  }
}

async function createPaystackRecipient({
  paystackKey,
  bankAccount,
  bankCode,
  accountName,
  supabase,
}: {
  paystackKey: string
  bankAccount: string
  bankCode: string
  accountName: string
  supabase: any
}) {
  try {
    const res = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'nuban',
        name: accountName,
        account_number: bankAccount,
        bank_code: bankCode,
        currency: 'NGN',
      }),
    })
    const data = await res.json()
    const code = data?.data?.recipient_code

    if (code) {
      // Save recipient code so we don't recreate it every time
      await supabase
        .from('system_settings')
        .update({ cheapdatahub_paystack_recipient_code: code })
        .neq('id', 0)
    }

    return code || null
  } catch (err) {
    console.error('Create recipient error:', err)
    return null
  }
}
