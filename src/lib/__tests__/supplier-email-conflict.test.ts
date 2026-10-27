import { describe, expect, it } from 'vitest';
import { SUPPLIER_EMAIL_CONFLICT_MESSAGE, describeSupplierWriteError } from '@/lib/supplier-email-conflict';

describe('describeSupplierWriteError', () => {
  it('turns the unique-email violation into a readable message', () => {
    expect(
      describeSupplierWriteError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "suppliers_email_key"',
      })
    ).toBe(SUPPLIER_EMAIL_CONFLICT_MESSAGE);
  });

  it('passes other database errors through unchanged', () => {
    expect(describeSupplierWriteError({ code: '42703', message: 'column "preferred_language" does not exist' })).toBe(
      'column "preferred_language" does not exist'
    );
  });

  it('does not treat other unique violations as an email conflict', () => {
    expect(
      describeSupplierWriteError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "supplier_pricing_profiles_supplier_id_key"',
      })
    ).toBe('duplicate key value violates unique constraint "supplier_pricing_profiles_supplier_id_key"');
  });
});
