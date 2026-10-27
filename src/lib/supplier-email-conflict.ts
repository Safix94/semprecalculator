export const SUPPLIER_EMAIL_CONFLICT_MESSAGE =
  'Another supplier already uses this email address. Apply migration 042_suppliers_shared_email to allow suppliers to share an email.';

interface DatabaseError {
  code?: string;
  message?: string;
}

/**
 * Database-level uniqueness of suppliers.email was dropped in migration 042.
 * On a database that still has the constraint, turn the raw Postgres error
 * into a message sales can act on.
 */
export function describeSupplierWriteError(error: DatabaseError | null | undefined): string {
  if (error?.code === '23505' && (error.message ?? '').includes('suppliers_email_key')) {
    return SUPPLIER_EMAIL_CONFLICT_MESSAGE;
  }

  return error?.message ?? 'Supplier could not be saved.';
}
