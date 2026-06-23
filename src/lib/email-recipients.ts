export const MAX_SUPPLIER_ADDITIONAL_EMAILS = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function parseEmailList(input: string): string[] {
  return input
    .split(/[;,\n\t ]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

export function dedupeEmails(emails: string[]): string[] {
  return Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
}

export function validateSupplierAdditionalEmails(
  primaryEmail: string,
  additionalEmails: string[] = []
): { emails: string[]; error?: string } {
  const primary = normalizeEmail(primaryEmail);

  if (!isValidEmail(primary)) {
    return { emails: [], error: 'Primary supplier email is invalid.' };
  }

  const invalidEmail = additionalEmails.map(normalizeEmail).filter(Boolean).find((email) => !isValidEmail(email));
  if (invalidEmail) {
    return { emails: [], error: `Additional supplier email is invalid: ${invalidEmail}` };
  }

  const emails = dedupeEmails(additionalEmails).filter((email) => email !== primary);

  if (emails.length > MAX_SUPPLIER_ADDITIONAL_EMAILS) {
    return {
      emails: [],
      error: `A supplier can have maximum ${MAX_SUPPLIER_ADDITIONAL_EMAILS} additional email addresses.`,
    };
  }

  return { emails };
}

export function getSupplierRecipientEmails(supplier: {
  email: string;
  additional_emails?: string[] | null;
}): string[] {
  return dedupeEmails([supplier.email, ...(supplier.additional_emails ?? [])]).filter(isValidEmail);
}
