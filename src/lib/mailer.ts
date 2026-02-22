/**
 * Brevo (formerly SendInBlue) email helper.
 * Sends transactional emails via Brevo HTTP API.
 */

const BREVO_API_KEY = process.env.BREVO_API_KEY!;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@sempre.com';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Sempre';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface SendEmailParams {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}

async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
        to: [{ email: params.to.email, name: params.to.name }],
        subject: params.subject,
        htmlContent: params.htmlContent,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: `Brevo API error: ${response.status} - ${errorBody}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.messageId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email error',
    };
  }
}

/**
 * Send supplier invite email with magic link.
 */
export async function sendSupplierInviteEmail(params: {
  supplierEmail: string;
  supplierName: string;
  rfqId: string;
  token: string;
  material: string;
  shape: string;
}) {
  const link = `${APP_URL}/supplier/rfq/${params.rfqId}?t=${params.token}`;

  return sendEmail({
    to: { email: params.supplierEmail, name: params.supplierName },
    subject: `Prijsaanvraag: ${params.material} - ${params.shape}`,
    htmlContent: `
      <h2>Nieuwe prijsaanvraag</h2>
      <p>Beste ${params.supplierName},</p>
      <p>Er is een nieuwe prijsaanvraag voor <strong>${params.material}</strong> (${params.shape}).</p>
      <p>Klik op de onderstaande link om de aanvraag te bekijken en een offerte in te dienen:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Offerte indienen</a></p>
      <p style="color:#666;font-size:12px;">Deze link is 30 dagen geldig.</p>
    `,
  });
}

/**
 * Notify sales that a supplier has submitted a quote.
 */
export async function sendSalesQuoteReceivedEmail(params: {
  salesEmail: string;
  rfqId: string;
  supplierName: string;
  finalPrice: number;
}) {
  const link = `${APP_URL}/dashboard/rfqs/${params.rfqId}`;

  return sendEmail({
    to: { email: params.salesEmail },
    subject: `Offerte ontvangen van ${params.supplierName}`,
    htmlContent: `
      <h2>Nieuwe offerte ontvangen</h2>
      <p>Leverancier <strong>${params.supplierName}</strong> heeft een offerte ingediend.</p>
      <p>Berekende eindprijs: <strong>€${params.finalPrice.toFixed(2)}</strong></p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Bekijk offertes</a></p>
    `,
  });
}
