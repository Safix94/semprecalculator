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
  if (!BREVO_API_KEY) {
    return { success: false, error: 'BREVO_API_KEY is not configured' };
  }

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
  finish?: string | null;
  dimensionsText?: string;
  quantity?: number;
}) {
  const link = new URL(`/supplier/rfq/${params.rfqId}`, APP_URL);
  link.searchParams.set('t', params.token);
  const inviteLink = link.toString();
  const finishText = params.finish ? ` with finish "${params.finish}"` : '';
  const detailLines = [
    `<li><strong>Material:</strong> ${params.material}</li>`,
    `<li><strong>Shape:</strong> ${params.shape}</li>`,
    params.finish ? `<li><strong>Finish:</strong> ${params.finish}</li>` : null,
    params.dimensionsText ? `<li><strong>Dimensions:</strong> ${params.dimensionsText}</li>` : null,
    params.quantity !== undefined ? `<li><strong>Quantity:</strong> ${params.quantity}</li>` : null,
  ]
    .filter(Boolean)
    .join('');

  return sendEmail({
    to: { email: params.supplierEmail, name: params.supplierName },
    subject: `Request for quotation: ${params.material} - ${params.shape}${params.finish ? ` (${params.finish})` : ''}`,
    htmlContent: `
      <h2>New request for quotation</h2>
      <p>Dear ${params.supplierName},</p>
      <p>There is a new request for quotation for <strong>${params.material}</strong> (${params.shape})${finishText}.</p>
      <ul>${detailLines}</ul>
      <p>Click the link below to view the request and submit a quote:</p>
      <p><a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Submit quote</a></p>
      <p style="color:#666;font-size:12px;">This link is valid for 30 days.</p>
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
    subject: `Quote received from ${params.supplierName}`,
    htmlContent: `
      <h2>New quote received</h2>
      <p>Supplier <strong>${params.supplierName}</strong> has submitted a quote.</p>
      <p>Calculated final price: <strong>€${params.finalPrice.toFixed(2)}</strong></p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">View quotes</a></p>
    `,
  });
}

/**
 * Notify pricing team members that a draft RFQ is ready for review.
 */
export async function sendPricingTeamRfqNotification(params: {
  pricingEmails: string[];
  rfqId: string;
  rfqSummary: string;
}) {
  const link = `${APP_URL}/dashboard/rfqs/${params.rfqId}`;

  const results = await Promise.all(
    params.pricingEmails.map(async (email) => {
      const emailResult = await sendEmail({
        to: { email },
        subject: 'New price request ready for review',
        htmlContent: `
          <h2>New price request ready for review</h2>
          <p>A new draft request is available for pricing review.</p>
          <p><strong>Summary:</strong> ${params.rfqSummary}</p>
          <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Open request</a></p>
        `,
      });

      return { email, ...emailResult };
    })
  );

  return {
    sent: results.filter((result) => result.success).length,
    total: results.length,
    results,
  };
}
