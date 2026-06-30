import { formatSupplierInputAmount, type QuotePriceCurrency } from '@/lib/currency';
import { getSupplierTranslations, normalizeSupplierLanguage, SUPPLIER_LANGUAGE_LOCALES, translateUsageEnvironment } from '@/lib/supplier-language';
import { dedupeEmails, isValidEmail } from '@/lib/email-recipients';
import { formatRfqDimensionsWithOptions } from '@/lib/rfq-format';
import type { SupplierLanguage } from '@/lib/supplier-language';

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

function cleanTitlePart(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function prefixProductType(title: string, productType: string | null | undefined) {
  const normalizedProductType = cleanTitlePart(productType);
  return normalizedProductType ? `${normalizedProductType} - ${title}` : title;
}

function buildPricingRequestTitle(params: {
  productType?: string | null;
  material?: string | null;
  shape?: string | null;
}) {
  const detail = [cleanTitlePart(params.material), cleanTitlePart(params.shape)].filter(Boolean).join(' - ');
  return `New price request: ${prefixProductType(detail || 'RFQ', params.productType)}`;
}

function buildSupplierRequestTitle(params: {
  productType?: string | null;
  subjectMaterial: string;
  requestLabel?: string;
}) {
  return `${params.requestLabel ?? 'Request for quotation'}: ${prefixProductType(params.subjectMaterial, params.productType)}`;
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
  supplierEmails: string[];
  supplierName: string;
  rfqId: string;
  token: string;
  material: string;
  productType?: string | null;
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
  model?: string | null;
  usageEnvironment?: 'Indoor' | 'Outdoor' | null;
  dimensionsText?: string;
  quantity?: number;
  language?: SupplierLanguage;
}) {
  const language = normalizeSupplierLanguage(params.language);
  const t = getSupplierTranslations(language);
  const inviteLink = buildSupplierRfqLink(params.rfqId, params.token);
  const invitePart = params.invitePart ?? 'default';
  const topMaterial = params.materialTableTop || t.tableTop;
  const footMaterial = params.materialTableFoot || t.tableFoot;
  const topFinishText = params.finishTableTop ? ` (${params.finishTableTop})` : '';
  const footFinishText = params.finishTableFoot ? ` (${params.finishTableFoot})` : '';

  let subjectMaterial = `${params.material} - ${params.shape}${params.finish ? ` (${params.finish})` : ''}`;
  let introText = t.emailIntroDefault(escapeHtml(params.material), escapeHtml(params.shape));
  let detailLines: string[] = [
    `<li><strong>${t.shape}:</strong> ${escapeHtml(params.shape)}</li>`,
  ];

  if (invitePart === 'table_top') {
    subjectMaterial = `${t.tableTop} - ${topMaterial}${topFinishText}`;
    introText = t.emailIntroTableTop;
    detailLines = [
      `<li><strong>${t.part}:</strong> ${t.tableTop}</li>`,
      `<li><strong>${t.material}:</strong> ${escapeHtml(topMaterial)}</li>`,
      params.finishTableTop ? `<li><strong>${t.finish}:</strong> ${escapeHtml(params.finishTableTop)}</li>` : null,
      `<li><strong>${t.shape}:</strong> ${escapeHtml(params.shape)}</li>`,
    ].filter(Boolean) as string[];
  } else if (invitePart === 'table_foot') {
    subjectMaterial = `${t.tableFoot} - ${footMaterial}${footFinishText}`;
    introText = t.emailIntroTableFoot;
    detailLines = [
      `<li><strong>${t.part}:</strong> ${t.tableFoot}</li>`,
      `<li><strong>${t.material}:</strong> ${escapeHtml(footMaterial)}</li>`,
      params.finishTableFoot ? `<li><strong>${t.finish}:</strong> ${escapeHtml(params.finishTableFoot)}</li>` : null,
      `<li><strong>${t.shape}:</strong> ${escapeHtml(params.shape)}</li>`,
    ].filter(Boolean) as string[];
  } else if (invitePart === 'table_both') {
    subjectMaterial = `${t.tableTopAndFoot} - ${params.shape}`;
    introText = t.emailIntroTableBoth;
    detailLines = [
      `<li><strong>${t.part}:</strong> ${t.tableTopAndFoot}</li>`,
      `<li><strong>${t.tableTop}:</strong> ${escapeHtml(topMaterial)}${escapeHtml(topFinishText)}</li>`,
      `<li><strong>${t.tableFoot}:</strong> ${escapeHtml(footMaterial)}${escapeHtml(footFinishText)}</li>`,
      `<li><strong>${t.shape}:</strong> ${escapeHtml(params.shape)}</li>`,
    ];
  } else {
    detailLines = [
      `<li><strong>${t.material}:</strong> ${escapeHtml(params.material)}</li>`,
      `<li><strong>${t.shape}:</strong> ${escapeHtml(params.shape)}</li>`,
      params.finish ? `<li><strong>${t.finish}:</strong> ${escapeHtml(params.finish)}</li>` : null,
      params.finishTop ? `<li><strong>${t.topFinish}:</strong> ${escapeHtml(params.finishTop)}</li>` : null,
      params.finishEdge ? `<li><strong>${t.edgeFinish}:</strong> ${escapeHtml(params.finishEdge)}</li>` : null,
      params.finishColor ? `<li><strong>${t.colorFinish}:</strong> ${escapeHtml(params.finishColor)}</li>` : null,
    ].filter(Boolean) as string[];
  }

  if (params.productType) {
    detailLines.unshift(`<li><strong>${t.productType}:</strong> ${escapeHtml(params.productType)}</li>`);
  }

  if (params.dimensionsText) {
    detailLines.push(`<li><strong>${t.dimensions}:</strong> ${escapeHtml(params.dimensionsText)}</li>`);
  }

  if (params.quantity !== undefined) {
    detailLines.push(`<li><strong>${t.quantity}:</strong> ${params.quantity}</li>`);
  }

  if (params.model) {
    detailLines.push(`<li><strong>${t.model}:</strong> ${escapeHtml(params.model)}</li>`);
  }

  if (params.usageEnvironment) {
    detailLines.push(
      `<li><strong>${t.use}:</strong> ${escapeHtml(translateUsageEnvironment(params.usageEnvironment, language) ?? params.usageEnvironment)}</li>`
    );
  }

  const supplierEmails = dedupeEmails(params.supplierEmails).filter(isValidEmail);
  const subject = buildSupplierRequestTitle({ productType: params.productType, subjectMaterial, requestLabel: t.requestForQuotation });
  const htmlContent = `
      <h2>${t.newRequestForQuotation}${params.productType ? `: ${escapeHtml(params.productType)}` : ''}</h2>
      <p>${t.dear} ${escapeHtml(params.supplierName)},</p>
      <p>${introText}</p>
      <ul>${detailLines.join('')}</ul>
      <p>${t.clickToView}</p>
      <p><a href="${inviteLink}" style="${EMAIL_BUTTON_STYLE}">${t.submitQuote}</a></p>
      <p style="color:#666;font-size:12px;">${t.linkValid}</p>
    `;

  const results = await Promise.all(
    supplierEmails.map(async (email) => ({
      email,
      ...(await sendEmail({
        to: { email, name: params.supplierName },
        subject,
        htmlContent,
      })),
    }))
  );

  const sent = results.filter((result) => result.success).length;
  const failedEmails = results.filter((result) => !result.success).map((result) => result.email);
  return {
    success: sent > 0,
    sent,
    total: supplierEmails.length,
    results,
    error: failedEmails.length > 0
      ? `Failed to send to ${failedEmails.length}/${supplierEmails.length} supplier email(s): ${failedEmails.join(', ')}`
      : undefined,
  };
}

type SupplierQuoteConfirmationCopy = {
  quoteReceivedSubject: string;
  quoteUpdatedSubject: string;
  receivedTitle: string;
  updatedTitle: string;
  intro: string;
  requestOverview: string;
  submittedDetails: string;
  viewRequest: string;
  automaticConfirmation: string;
};

const supplierQuoteConfirmationCopy: Record<SupplierLanguage, SupplierQuoteConfirmationCopy> = {
  en: {
    quoteReceivedSubject: 'Quote received',
    quoteUpdatedSubject: 'Quote updated',
    receivedTitle: 'We have received your quote',
    updatedTitle: 'We have received your updated quote',
    intro: 'Thank you. We have received your price for the request below.',
    requestOverview: 'Request overview',
    submittedDetails: 'Your submitted details',
    viewRequest: 'View request',
    automaticConfirmation: 'This confirmation was sent automatically.',
  },
  nl: {
    quoteReceivedSubject: 'Offerte ontvangen',
    quoteUpdatedSubject: 'Offerte bijgewerkt',
    receivedTitle: 'We hebben uw offerte ontvangen',
    updatedTitle: 'We hebben uw bijgewerkte offerte ontvangen',
    intro: 'Bedankt. We hebben uw prijs ontvangen voor onderstaande aanvraag.',
    requestOverview: 'Overzicht aanvraag',
    submittedDetails: 'Uw ingediende gegevens',
    viewRequest: 'Aanvraag bekijken',
    automaticConfirmation: 'Deze bevestiging werd automatisch verzonden.',
  },
  fr: {
    quoteReceivedSubject: 'Offre reçue',
    quoteUpdatedSubject: 'Offre mise à jour',
    receivedTitle: 'Nous avons reçu votre offre',
    updatedTitle: 'Nous avons reçu votre offre mise à jour',
    intro: 'Merci. Nous avons reçu votre prix pour la demande ci-dessous.',
    requestOverview: 'Aperçu de la demande',
    submittedDetails: 'Vos informations soumises',
    viewRequest: 'Voir la demande',
    automaticConfirmation: 'Cette confirmation a été envoyée automatiquement.',
  },
  es: {
    quoteReceivedSubject: 'Cotización recibida',
    quoteUpdatedSubject: 'Cotización actualizada',
    receivedTitle: 'Hemos recibido su cotización',
    updatedTitle: 'Hemos recibido su cotización actualizada',
    intro: 'Gracias. Hemos recibido su precio para la solicitud indicada abajo.',
    requestOverview: 'Resumen de la solicitud',
    submittedDetails: 'Sus datos enviados',
    viewRequest: 'Ver solicitud',
    automaticConfirmation: 'Esta confirmación se envió automáticamente.',
  },
  pt: {
    quoteReceivedSubject: 'Cotação recebida',
    quoteUpdatedSubject: 'Cotação atualizada',
    receivedTitle: 'Recebemos a sua cotação',
    updatedTitle: 'Recebemos a sua cotação atualizada',
    intro: 'Obrigado. Recebemos o seu preço para o pedido abaixo.',
    requestOverview: 'Resumo do pedido',
    submittedDetails: 'Dados submetidos',
    viewRequest: 'Ver pedido',
    automaticConfirmation: 'Esta confirmação foi enviada automaticamente.',
  },
};

function addEscapedDetailLine(lines: string[], label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return;
  }

  lines.push(`<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</li>`);
}

function buildSupplierQuoteConfirmationTitle(params: {
  productType?: string | null;
  material?: string | null;
  shape?: string | null;
}) {
  const detail = [cleanTitlePart(params.material), cleanTitlePart(params.shape)].filter(Boolean).join(' - ');
  return prefixProductType(detail || 'RFQ', params.productType);
}

/**
 * Send supplier confirmation after a quote was submitted or updated.
 * This deliberately includes only request details and supplier-entered values.
 * Internal retail price, margins and transport calculations are not exposed.
 */
export async function sendSupplierQuoteConfirmationEmail(params: {
  supplierEmails: string[];
  supplierName: string;
  rfqId: string;
  token: string;
  rfq: {
    productType?: string | null;
    material: string;
    shape: string;
    finish?: string | null;
    finishTop?: string | null;
    finishEdge?: string | null;
    finishColor?: string | null;
    materialTableTop?: string | null;
    materialTableFoot?: string | null;
    finishTableTop?: string | null;
    finishTableFoot?: string | null;
    length: number;
    width: number;
    height: number;
    thickness: number;
    quantity: number;
    model?: string | null;
    usageEnvironment?: 'Indoor' | 'Outdoor' | null;
    notes?: string | null;
    attachmentNames?: string[];
  };
  quote: {
    supplierInputPrice: number;
    supplierInputCurrency: QuotePriceCurrency;
    volumeM3: number;
    leadTimeDays?: number | null;
    comment?: string | null;
    submittedAt: string;
    isUpdate: boolean;
  };
  language?: SupplierLanguage;
}) {
  const language = normalizeSupplierLanguage(params.language);
  const t = getSupplierTranslations(language);
  const copy = supplierQuoteConfirmationCopy[language];
  const requestLink = buildSupplierRfqLink(params.rfqId, params.token);
  const requestTitle = buildSupplierQuoteConfirmationTitle({
    productType: params.rfq.productType,
    material: params.rfq.material,
    shape: params.rfq.shape,
  });
  const subjectPrefix = params.quote.isUpdate ? copy.quoteUpdatedSubject : copy.quoteReceivedSubject;
  const title = params.quote.isUpdate ? copy.updatedTitle : copy.receivedTitle;
  const subject = `${subjectPrefix}: ${requestTitle}`;

  const requestLines: string[] = [];
  addEscapedDetailLine(requestLines, t.productType, params.rfq.productType);
  addEscapedDetailLine(requestLines, t.material, params.rfq.material);
  addEscapedDetailLine(requestLines, t.shape, params.rfq.shape);
  addEscapedDetailLine(requestLines, t.finish, params.rfq.finish);
  addEscapedDetailLine(requestLines, t.topFinish, params.rfq.finishTop);
  addEscapedDetailLine(requestLines, t.edgeFinish, params.rfq.finishEdge);
  addEscapedDetailLine(requestLines, t.colorFinish, params.rfq.finishColor);
  addEscapedDetailLine(requestLines, t.tableTop, [params.rfq.materialTableTop, params.rfq.finishTableTop].filter(Boolean).join(' - '));
  addEscapedDetailLine(requestLines, t.tableFoot, [params.rfq.materialTableFoot, params.rfq.finishTableFoot].filter(Boolean).join(' - '));
  addEscapedDetailLine(
    requestLines,
    t.dimensions,
    formatRfqDimensionsWithOptions(params.rfq, { includeThickness: true })
  );
  addEscapedDetailLine(requestLines, t.quantity, params.rfq.quantity);
  addEscapedDetailLine(requestLines, t.model, params.rfq.model);
  addEscapedDetailLine(
    requestLines,
    t.use,
    translateUsageEnvironment(params.rfq.usageEnvironment, language) ?? params.rfq.usageEnvironment
  );
  addEscapedDetailLine(requestLines, t.notes, params.rfq.notes);
  if (params.rfq.attachmentNames && params.rfq.attachmentNames.length > 0) {
    addEscapedDetailLine(requestLines, t.attachments, params.rfq.attachmentNames.join(', '));
  }

  const submittedAt = new Intl.DateTimeFormat(SUPPLIER_LANGUAGE_LOCALES[language], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(params.quote.submittedAt));
  const quoteLines: string[] = [];
  addEscapedDetailLine(
    quoteLines,
    t.basePrice,
    formatSupplierInputAmount(params.quote.supplierInputPrice, params.quote.supplierInputCurrency)
  );
  addEscapedDetailLine(quoteLines, t.volumeM3, `${params.quote.volumeM3} m³`);
  if (params.quote.leadTimeDays !== null && params.quote.leadTimeDays !== undefined) {
    addEscapedDetailLine(quoteLines, t.leadTime, `${params.quote.leadTimeDays} ${t.days}`);
  }
  addEscapedDetailLine(quoteLines, t.comment, params.quote.comment);
  addEscapedDetailLine(quoteLines, t.submittedOn, submittedAt);

  const supplierEmails = dedupeEmails(params.supplierEmails).filter(isValidEmail);
  const htmlContent = `
      <h2>${escapeHtml(title)}</h2>
      <p>${t.dear} ${escapeHtml(params.supplierName)},</p>
      <p>${escapeHtml(copy.intro)}</p>
      <h3>${escapeHtml(copy.requestOverview)}</h3>
      <ul>${requestLines.join('')}</ul>
      <h3>${escapeHtml(copy.submittedDetails)}</h3>
      <ul>${quoteLines.join('')}</ul>
      <p><a href="${requestLink}" style="${EMAIL_BUTTON_STYLE}">${escapeHtml(copy.viewRequest)}</a></p>
      <p style="color:#666;font-size:12px;">${escapeHtml(t.linkValid)} ${escapeHtml(copy.automaticConfirmation)}</p>
    `;

  const results = await Promise.all(
    supplierEmails.map(async (email) => ({
      email,
      ...(await sendEmail({
        to: { email, name: params.supplierName },
        subject,
        htmlContent,
      })),
    }))
  );

  const sent = results.filter((result) => result.success).length;
  const failedEmails = results.filter((result) => !result.success).map((result) => result.email);
  return {
    success: sent > 0,
    sent,
    total: supplierEmails.length,
    results,
    error: failedEmails.length > 0
      ? `Failed to send supplier confirmation to ${failedEmails.length}/${supplierEmails.length} email(s): ${failedEmails.join(', ')}`
      : undefined,
  };
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
  productType?: string | null;
  material?: string | null;
  shape?: string | null;
}) {
  const link = `${APP_URL}/dashboard/rfqs/${params.rfqId}`;
  const title = buildPricingRequestTitle({
    productType: params.productType,
    material: params.material,
    shape: params.shape,
  });

  const results = await Promise.all(
    params.pricingEmails.map(async (email) => {
      const emailResult = await sendEmail({
        to: { email },
        subject: title,
        htmlContent: `
          <h2>${title}</h2>
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
  supplierEmails: string[];
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

  const supplierEmails = dedupeEmails(params.supplierEmails).filter(isValidEmail);
  const subject = `New message about RFQ ${params.rfqId}`;
  const htmlContent = `
      <h2>There is a new message about your RFQ</h2>
      <p>Dear ${escapeHtml(params.supplierName)},</p>
      <p>There is a new message in your RFQ thread.</p>
      <p><strong>Message:</strong> ${replyText}</p>
      ${updateNote}
      <p>Open the link to view full history.</p>
      <p><a href="${link}" style="${EMAIL_BUTTON_STYLE}">Open RFQ thread</a></p>
      <p style="color:#666;font-size:12px;">This link is valid for 30 days.</p>
    `;

  const results = await Promise.all(
    supplierEmails.map(async (email) => ({
      email,
      ...(await sendEmail({
        to: { email, name: params.supplierName },
        subject,
        htmlContent,
      })),
    }))
  );

  const sent = results.filter((result) => result.success).length;
  const failedEmails = results.filter((result) => !result.success).map((result) => result.email);
  return {
    success: sent > 0,
    sent,
    total: supplierEmails.length,
    results,
    error: failedEmails.length > 0
      ? `Failed to send to ${failedEmails.length}/${supplierEmails.length} supplier email(s): ${failedEmails.join(', ')}`
      : undefined,
  };
}
