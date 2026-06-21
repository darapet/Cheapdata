// Email sending is handled server-side via SMTP.
// This stub exists so existing imports continue to work.

export interface TransactionEmailParams {
  toEmail: string;
  toName: string;
  type: string;
  description: string;
  amount: number;
  reference: string;
  status: 'successful' | 'failed';
}

// No-op: the backend API server sends emails via SMTP, not the browser.
export async function sendTransactionEmail(_params: TransactionEmailParams): Promise<void> {
  return;
}
