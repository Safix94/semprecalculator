/**
 * Brevo (formerly SendInBlue) email helper.
 * Sends transactional emails via Brevo HTTP API.
 */

const BREVO_API_KEY = process.env.BREVO_API_KEY!;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@sempre.com';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Sempre';
const FALLBACK_APP_URL = 'http://localhost:3000';

function resolveAppUrl(rawValue: string | undefined): string {
  const trimmed = (rawValue ?? '').trim();
  if (!trimmed) {
    return FALLBACK_APP_URL;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    return parsed.toString();
  } catch {
    return FALLBACK_APP_URL;
  }
}

const APP_URL = resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL);

/** Button style matching app primary (oklch(0.5251 0.0369 140.9133) → hex for email clients). */
const EMAIL_BUTTON_STYLE =
  'display:inline-block;padding:12px 24px;background:#4d5d50;color:#fff;text-decoration:none;border-radius:6px;';

interface SendEmailParams {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toExcerpt(text: string, maxLength = 240): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

function buildSupplierRfqLink(rfqId: string, token: string): string {
  const path = `/supplier/rfq/${rfqId}`;

  try {
    const link = new URL(path, APP_URL);
    link.searchParams.set('t', token);
    return link.toString();
  } catch {
    const fallbackLink = new URL(path, FALLBACK_APP_URL);
    fallbackLink.searchParams.set('t', token);
    return fallbackLink.toString();
  }
}

export function getPricingTeamEmailsFromEnv(): string[] {
  const raw = process.env.PRICING_TEAM_EMAIL ?? '';
  return [...new Set(raw.split(',').map((email) => email.trim()).filter(Boolean))];
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
  invitePart?: 'default' | 'table_top' | 'table_foot' | 'table_both';
  materialTableTop?: string | null;
  finishTableTop?: string | null;
  materialTableFoot?: string | null;
  finishTableFoot?: string | null;
  finishTop?: string | null;
  finishEdge?: string | null;
  finishColor?: string | null;
  dimensionsText?: string;
  quantity?: number;
}) {
  const inviteLink = buildSupplierRfqLink(params.rfqId, params.token);
  const invitePart = params.invitePart ?? 'default';
  const topMaterial = params.materialTableTop || 'Table top';
  const footMaterial = params.materialTableFoot || 'Table foot';
  const topFinishText = params.finishTableTop ? ` (${params.finishTableTop})` : '';
  const footFinishText = params.finishTableFoot ? ` (${params.finishTableFoot})` : '';

  let subjectMaterial = `${params.material} - ${params.shape}${params.finish ? ` (${params.finish})` : ''}`;
  let introText = `There is a new request for quotation for <strong>${params.material}</strong> (${params.shape}).`;
  let detailLines: string[] = [
    `<li><strong>Shape:</strong> ${params.shape}</li>`,
  ];

  if (invitePart === 'table_top') {
    subjectMaterial = `Table top - ${topMaterial}${topFinishText}`;
    introText = `There is a new request for quotation for a <strong>table top</strong>.`;
    detailLines = [
      `<li><strong>Part:</strong> Table top</li>`,
      `<li><strong>Material:</strong> ${topMaterial}</li>`,
      params.finishTableTop ? `<li><strong>Finish:</strong> ${params.finishTableTop}</li>` : null,
      `<li><strong>Shape:</strong> ${params.shape}</li>`,
    ].filter(Boolean) as string[];
  } else if (invitePart === 'table_foot') {
    subjectMaterial = `Table foot - ${footMaterial}${footFinishText}`;
    introText = `There is a new request for quotation for a <strong>table foot</strong>.`;
    detailLines = [
      `<li><strong>Part:</strong> Table foot</li>`,
      `<li><strong>Material:</strong> ${footMaterial}</li>`,
      params.finishTableFoot ? `<li><strong>Finish:</strong> ${params.finishTableFoot}</li>` : null,
      `<li><strong>Shape:</strong> ${params.shape}</li>`,
    ].filter(Boolean) as string[];
  } else if (invitePart === 'table_both') {
    subjectMaterial = `Table top + foot - ${params.shape}`;
    introText = 'There is a new combined request for quotation for a <strong>table top and table foot</strong>.';
    detailLines = [
      `<li><strong>Part:</strong> Table top + table foot</li>`,
      `<li><strong>Table top:</strong> ${topMaterial}${topFinishText}</li>`,
      `<li><strong>Table foot:</strong> ${footMaterial}${footFinishText}</li>`,
      `<li><strong>Shape:</strong> ${params.shape}</li>`,
    ];
  } else {
    detailLines = [
      `<li><strong>Material:</strong> ${params.material}</li>`,
      `<li><strong>Shape:</strong> ${params.shape}</li>`,
      params.finish ? `<li><strong>Finish:</strong> ${params.finish}</li>` : null,
      params.finishTop ? `<li><strong>Top finish:</strong> ${params.finishTop}</li>` : null,
      params.finishEdge ? `<li><strong>Edge finish:</strong> ${params.finishEdge}</li>` : null,
      params.finishColor ? `<li><strong>Color finish:</strong> ${params.finishColor}</li>` : null,
    ].filter(Boolean) as string[];
  }

  if (params.dimensionsText) {
    detailLines.push(`<li><strong>Dimensions:</strong> ${params.dimensionsText}</li>`);
  }

  if (params.quantity !== undefined) {
    detailLines.push(`<li><strong>Quantity:</strong> ${params.quantity}</li>`);
  }

  return sendEmail({
    to: { email: params.supplierEmail, name: params.supplierName },
    subject: `Request for quotation: ${subjectMaterial}`,
    htmlContent: `
      <h2>New request for quotation</h2>
      <p>Dear ${params.supplierName},</p>
      <p>${introText}</p>
      <ul>${detailLines.join('')}</ul>
      <p>Click the link below to view the request and submit a quote:</p>
      <p><a href="${inviteLink}" style="${EMAIL_BUTTON_STYLE}">Submit quote</a></p>
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
      <p><a href="${link}" style="${EMAIL_BUTTON_STYLE}">View quotes</a></p>
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
          <p><a href="${link}" style="${EMAIL_BUTTON_STYLE}">Open request</a></p>
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

/**
 * Notify pricing team members that an RFQ with received quotes is ready for CRM creation.
 */
export async function sendPricingTeamRfqCrmNotification(params: {
  pricingEmails: string[];
  rfqId: string;
  rfqSummary: string;
  attachmentCount?: number;
  quotes: Array<{
    supplierName: string;
    basePrice: number;
    finalPrice: number;
    leadTimeDays: number | null;
    comment: string | null;
  }>;
}) {
  const link = `${APP_URL}/dashboard/rfqs/${params.rfqId}`;
  const attachmentCount = Number.isFinite(params.attachmentCount) ? Number(params.attachmentCount) : 0;

  const quoteRows =
    params.quotes.length === 0
      ? '<p>No quotes are available yet.</p>'
      : `
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ddd;">
        <thead>
          <tr>
            <th align="left">Supplier</th>
            <th align="right">Base price</th>
            <th align="right">Final price</th>
            <th align="right">Lead time</th>
            <th align="left">Comment</th>
          </tr>
        </thead>
        <tbody>
          ${params.quotes
            .map((quote) => {
              const supplierName = escapeHtml(quote.supplierName);
              const leadTime = quote.leadTimeDays ? `${quote.leadTimeDays} days` : '-';
              const comment = quote.comment ? escapeHtml(toExcerpt(quote.comment, 120)) : '-';
              return `
                <tr>
                  <td>${supplierName}</td>
                  <td align="right">€${quote.basePrice.toFixed(2)}</td>
                  <td align="right">€${quote.finalPrice.toFixed(2)}</td>
                  <td align="right">${leadTime}</td>
                  <td>${comment}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;

  const results = await Promise.all(
    params.pricingEmails.map(async (email) => {
      const emailResult = await sendEmail({
        to: { email },
        subject: 'RFQ ready for CRM creation',
        htmlContent: `
          <h2>RFQ ready for CRM creation</h2>
          <p>An RFQ with received supplier quotes is ready to be created in CRM.</p>
          <p><strong>Summary:</strong> ${escapeHtml(params.rfqSummary)}</p>
          <p><strong>Attachments:</strong> ${attachmentCount}</p>
          ${quoteRows}
          <p><a href="${link}" style="${EMAIL_BUTTON_STYLE}">Open request</a></p>
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

export async function sendInternalSupplierCommentEmail(params: {
  recipients: string[];
  rfqId: string;
  supplierName: string;
  bodyExcerpt: string;
}) {
  const link = `${APP_URL}/dashboard/rfqs/${params.rfqId}`;
  const excerpt = escapeHtml(toExcerpt(params.bodyExcerpt));
  const recipients = [...new Set(params.recipients.map((email) => email.trim()).filter(Boolean))];

  const results = await Promise.all(
    recipients.map(async (email) => {
      const emailResult = await sendEmail({
        to: { email },
        subject: `New supplier message from ${params.supplierName}`,
        htmlContent: `
          <h2>New supplier message</h2>
          <p><strong>${escapeHtml(params.supplierName)}</strong> posted a new message in the RFQ thread.</p>
          <p><strong>Message:</strong> ${excerpt}</p>
          <p><a href="${link}" style="${EMAIL_BUTTON_STYLE}">Open RFQ thread</a></p>
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

export async function sendSupplierThreadReplyEmail(params: {
  supplierEmail: string;
  supplierName: string;
  rfqId: string;
  token: string;
  messageExcerpt: string;
  requestUpdatedQuote: boolean;
}) {
  const link = buildSupplierRfqLink(params.rfqId, params.token);
  const replyText = escapeHtml(toExcerpt(params.messageExcerpt));
  const updateNote = params.requestUpdatedQuote
    ? '<p><strong>You can now submit an updated quote using this fresh link.</strong></p>'
    : '';

  return sendEmail({
    to: { email: params.supplierEmail, name: params.supplierName },
    subject: `New message about RFQ ${params.rfqId}`,
    htmlContent: `
      <h2>There is a new message about your RFQ</h2>
      <p>Dear ${escapeHtml(params.supplierName)},</p>
      <p>There is a new message in your RFQ thread.</p>
      <p><strong>Message:</strong> ${replyText}</p>
      ${updateNote}
      <p>Open the link to view full history.</p>
      <p><a href="${link}" style="${EMAIL_BUTTON_STYLE}">Open RFQ thread</a></p>
      <p style="color:#666;font-size:12px;">This link is valid for 30 days.</p>
    `,
  });
}
