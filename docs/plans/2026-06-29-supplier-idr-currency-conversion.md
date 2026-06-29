# Supplier IDR Quote Currency Implementation Plan

> **For Hermes:** Use this plan task-by-task. Keep `base_price` and all pricing formulas in EUR internally; only supplier input can be IDR.

**Goal:** Add a supplier-level checkbox so selected suppliers can enter their quote base price in Indonesian rupiah (IDR), while the app automatically converts that amount to EUR before existing pricing formulas run.

**Architecture:** Store a supplier quote input currency setting (`EUR` or `IDR`) on the supplier. Keep the existing quote calculation pipeline EUR-based to avoid breaking transport/margin/retail logic. Store a quote-level snapshot of the supplier-entered amount, currency, and exchange rate so historic quotes remain auditable even if the rate changes later.

**Tech Stack:** Next.js 16 App Router, React, Supabase, TypeScript, existing supplier/RFQ quote actions.

**Current exchange rate for V1:** ECB daily rate checked on 2026-06-29: `1 EUR = 20,361.16 IDR`, so `1,000,000 IDR = €49.11`. V1 uses this fixed snapshot, not a live FX API.

---

## Key Decisions

1. **Supplier UI stays a checkbox.**
   - Label: `Supplier geeft basisprijs in Indonesische rupiah (IDR)`.
   - Internally store as `quote_price_currency = 'IDR'`; unchecked means `'EUR'`.

2. **Do not change the existing pricing formulas.**
   - Existing formulas expect EUR base prices.
   - Convert supplier input to EUR before calling `calculateSupplierPricing(...)`.

3. **Keep `rfq_quotes.base_price` as normalized EUR.**
   - This protects existing quote comparison, history, emails, and pricing logic.
   - Add separate columns for the raw supplier input and FX snapshot.

4. **No live exchange-rate dependency in V1.**
   - Use a fixed constant from today: `IDR_PER_EUR = 20361.16`.
   - Later we can add an admin-editable rate or daily API refresh, but that is not needed now.

5. **Store conversion evidence on each quote.**
   - If a supplier enters `1,000,000 IDR`, store:
     - raw input: `1000000`
     - raw currency: `IDR`
     - rate: `20361.16`
     - normalized base price: `49.11 EUR`

---

## Files Expected to Change

- Create migration:
  - `supabase/migrations/0XX_supplier_quote_currency_idr.sql`
- Modify types:
  - `src/types/index.ts`
- Create currency helper:
  - `src/lib/currency.ts`
- Modify supplier management:
  - `src/actions/suppliers.ts`
  - `src/components/supplier-management.tsx`
- Modify supplier quote flow:
  - `src/actions/quote.ts`
  - `src/components/supplier-quote-form.tsx`
  - `src/app/supplier/rfq/[rfqId]/page.tsx`
  - `src/lib/supplier-language.ts`
  - `src/lib/validation.ts` only if field labels/errors need currency-specific copy
- Modify internal display:
  - `src/components/quote-comparison.tsx`
  - `src/components/supplier-quote-readonly.tsx`
  - optional: `src/components/rfq-history-search.tsx` if base price/raw currency appears there later

---

## Task 1: Add database fields

**Objective:** Persist supplier currency preference and quote-level FX snapshots.

**Create:** `supabase/migrations/0XX_supplier_quote_currency_idr.sql`

```sql
alter table public.suppliers
  add column if not exists quote_price_currency text not null default 'EUR';

alter table public.suppliers
  drop constraint if exists suppliers_quote_price_currency_check;

alter table public.suppliers
  add constraint suppliers_quote_price_currency_check
  check (quote_price_currency in ('EUR', 'IDR'));

alter table public.rfq_quotes
  add column if not exists supplier_input_price numeric(14,2),
  add column if not exists supplier_input_currency text not null default 'EUR',
  add column if not exists supplier_input_exchange_rate_idr_per_eur numeric(14,6),
  add column if not exists supplier_input_converted_at timestamptz;

alter table public.rfq_quotes
  drop constraint if exists rfq_quotes_supplier_input_currency_check;

alter table public.rfq_quotes
  add constraint rfq_quotes_supplier_input_currency_check
  check (supplier_input_currency in ('EUR', 'IDR'));

update public.rfq_quotes
set supplier_input_price = base_price,
    supplier_input_currency = coalesce(nullif(currency, ''), 'EUR'),
    supplier_input_converted_at = submitted_at
where supplier_input_price is null;
```

**Verification:**

```bash
npm run lint
npm run build
```

Also verify migration applies locally/live before deploying code that writes `quote_price_currency`.

---

## Task 2: Add shared currency helper

**Objective:** Centralize IDR → EUR conversion and formatting.

**Create:** `src/lib/currency.ts`

```ts
export type QuotePriceCurrency = 'EUR' | 'IDR';

export const IDR_PER_EUR_RATE = 20361.16;
export const IDR_RATE_SOURCE = 'ECB daily reference rate, 2026-06-29';

export function normalizeQuotePriceCurrency(value: unknown): QuotePriceCurrency {
  return value === 'IDR' ? 'IDR' : 'EUR';
}

export function convertSupplierBasePriceToEur(
  amount: number,
  currency: QuotePriceCurrency
): {
  basePriceEur: number;
  supplierInputPrice: number;
  supplierInputCurrency: QuotePriceCurrency;
  supplierInputExchangeRateIdrPerEur: number | null;
  supplierInputConvertedAt: string | null;
} {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Supplier base price must be positive.');
  }

  if (currency === 'IDR') {
    return {
      basePriceEur: Math.round((amount / IDR_PER_EUR_RATE) * 100) / 100,
      supplierInputPrice: amount,
      supplierInputCurrency: 'IDR',
      supplierInputExchangeRateIdrPerEur: IDR_PER_EUR_RATE,
      supplierInputConvertedAt: new Date().toISOString(),
    };
  }

  return {
    basePriceEur: Math.round(amount * 100) / 100,
    supplierInputPrice: amount,
    supplierInputCurrency: 'EUR',
    supplierInputExchangeRateIdrPerEur: null,
    supplierInputConvertedAt: null,
  };
}
```

**Notes:**
- Keep this pure/simple for V1.
- If later rates become editable/API-driven, only this helper and supplier settings need to evolve.

---

## Task 3: Extend TypeScript types

**Objective:** Make supplier and quote currency fields available throughout the app.

**Modify:** `src/types/index.ts`

Add:

```ts
export type QuotePriceCurrency = 'EUR' | 'IDR';
```

Extend `Supplier`:

```ts
quote_price_currency: QuotePriceCurrency;
```

Extend `RfqQuote`:

```ts
supplier_input_price?: number | null;
supplier_input_currency?: QuotePriceCurrency | null;
supplier_input_exchange_rate_idr_per_eur?: number | null;
supplier_input_converted_at?: string | null;
```

**Compatibility rule:** when rows do not yet contain the field, normalize to EUR in mapping code.

---

## Task 4: Add supplier checkbox in management

**Objective:** Let management mark a supplier as IDR-priced.

**Modify:** `src/actions/suppliers.ts`

- Extend `CreateSupplierInput` and `UpdateSupplierInput`:

```ts
quote_price_currency?: QuotePriceCurrency;
```

- Normalize with `normalizeQuotePriceCurrency(...)`.
- Include `quote_price_currency` in insert/update payload.
- Include it in `getSuppliers()` mapping with fallback `'EUR'`.
- Add audit metadata when changed:

```ts
metadata: {
  quotePriceCurrency: normalizedCurrency,
}
```

**Modify:** `src/components/supplier-management.tsx`

- Extend `SupplierFormData`:

```ts
quote_price_currency: QuotePriceCurrency;
```

- Add checkbox in the supplier dialog, preferably near the pricing profile section:

```tsx
<div className="flex items-start gap-2 rounded-md border p-3">
  <Checkbox
    id="supplier-idr-pricing"
    checked={formData.quote_price_currency === 'IDR'}
    onCheckedChange={(checked) =>
      updateFormData('quote_price_currency', checked === true ? 'IDR' : 'EUR')
    }
  />
  <div className="space-y-1">
    <Label htmlFor="supplier-idr-pricing">
      Supplier geeft basisprijs in Indonesische rupiah (IDR)
    </Label>
    <p className="text-xs text-muted-foreground">
      Op de supplier quote pagina wordt het ingevulde bedrag automatisch omgerekend naar EUR.
    </p>
  </div>
</div>
```

- Show a small badge in the supplier table pricing column:
  - `Basisprijs: EUR`
  - or `Basisprijs: IDR → EUR`

**Verification:** create/edit supplier payload contains `quote_price_currency`.

---

## Task 5: Make supplier quote page currency-aware

**Objective:** Show the correct input label and helper text to the supplier.

**Modify:** `src/app/supplier/rfq/[rfqId]/page.tsx`

- Pass `supplier.quote_price_currency` into `SupplierQuoteForm`.
- For existing quotes:
  - If `supplier_input_price` exists, use that as `initialValues.basePrice`.
  - Else fallback to `existingQuote.base_price`.

```ts
const supplierQuoteCurrency = normalizeQuotePriceCurrency(supplier?.quote_price_currency);
const quoteInitialValues = existingQuote
  ? {
      basePrice: Number(existingQuote.supplier_input_price ?? existingQuote.base_price),
      volumeM3: Number(existingQuote.volume_m3),
      leadTimeDays: existingQuote.lead_time_days,
      comment: existingQuote.comment,
    }
  : null;
```

**Modify:** `src/components/supplier-quote-form.tsx`

- Add prop:

```ts
quotePriceCurrency: QuotePriceCurrency;
```

- Change base price label dynamically:
  - EUR supplier: `Base price (€)`
  - IDR supplier: `Base price (IDR / Rp)`

- For IDR:
  - `step="1"`
  - placeholder e.g. `1000000`
  - helper text:

```tsx
{quotePriceCurrency === 'IDR' && (
  <p className="text-xs text-muted-foreground">
    Wordt automatisch omgerekend naar EUR aan 1 EUR = 20.361,16 IDR.
  </p>
)}
```

**Important:** do not send currency from the client as trusted business logic. The server determines currency from the supplier record.

---

## Task 6: Convert before pricing calculation

**Objective:** Supplier-entered IDR becomes EUR before `calculateSupplierPricing(...)`.

**Modify:** `src/actions/quote.ts`

Current flow:

```ts
const { basePrice, volumeM3, leadTimeDays, comment } = parsed.data;
const pricingProfile = await getEffectiveSupplierPricingProfile(invite.supplier_id);
pricingResult = calculateSupplierPricing(basePrice, volumeM3, pricingProfile);
```

New flow:

1. Fetch supplier currency in the invite query or separate supplier query.
2. Normalize currency.
3. Convert parsed `basePrice` to EUR.
4. Use `basePriceEur` in `calculateSupplierPricing`.
5. Store raw input snapshot on insert/update.

Pseudo-code:

```ts
const supplierCurrency = normalizeQuotePriceCurrency(invite.supplier?.quote_price_currency);
const converted = convertSupplierBasePriceToEur(basePrice, supplierCurrency);

pricingResult = calculateSupplierPricing(converted.basePriceEur, volumeM3, pricingProfile);
```

Quote update/insert payload:

```ts
base_price: converted.basePriceEur,
currency: 'EUR',
supplier_input_price: converted.supplierInputPrice,
supplier_input_currency: converted.supplierInputCurrency,
supplier_input_exchange_rate_idr_per_eur: converted.supplierInputExchangeRateIdrPerEur,
supplier_input_converted_at: converted.supplierInputConvertedAt,
```

Audit metadata should include both:

```ts
supplierInputPrice: converted.supplierInputPrice,
supplierInputCurrency: converted.supplierInputCurrency,
basePriceEur: converted.basePriceEur,
exchangeRateIdrPerEur: converted.supplierInputExchangeRateIdrPerEur,
```

---

## Task 7: Update internal quote displays

**Objective:** Sales sees both the raw supplier input and the EUR conversion.

**Modify:** `src/components/quote-comparison.tsx`

Replace supplier base price display with a helper:

```ts
function formatSupplierBasePrice(quote: RfqQuote | undefined) {
  if (!quote) return '-';

  if (quote.supplier_input_currency === 'IDR' && quote.supplier_input_price) {
    return `Rp ${Number(quote.supplier_input_price).toLocaleString('id-ID')} → €${Number(quote.base_price).toFixed(2)}`;
  }

  return `€${Number(quote.base_price).toFixed(2)}`;
}
```

Use it in the `Supplier base price` column.

**Modify:** `src/components/supplier-quote-readonly.tsx`

- For supplier view after submit/update, show:
  - IDR raw amount if supplier submitted IDR.
  - EUR converted amount as helper text.

Example:

```text
Base price: Rp 1.000.000
Converted: €49.11
```

---

## Task 8: Supplier translations/copy

**Objective:** Keep the supplier-facing page clear in all existing languages.

**Modify:** `src/lib/supplier-language.ts`

Add labels:

```ts
basePriceEur: 'Base price (€)'
basePriceIdr: 'Base price (IDR / Rp)'
basePriceIdrHelp: 'This amount is converted to EUR automatically.'
```

Minimum V1: English copy is acceptable if existing translations are incomplete, but better to add NL/FR/ES/PT equivalents to avoid blank labels.

---

## Task 9: Verification checklist

Run:

```bash
npm run lint
npm run build
```

Manual checks:

1. Create/edit supplier with checkbox off.
   - Supplier quote page label says EUR.
   - Quote calculation unchanged.

2. Create/edit supplier with checkbox on.
   - Supplier quote page label says IDR / Rp.
   - Submit `1000000` as base price.
   - Stored quote has:
     - `supplier_input_price = 1000000`
     - `supplier_input_currency = 'IDR'`
     - `supplier_input_exchange_rate_idr_per_eur = 20361.16`
     - `base_price ≈ 49.11`
     - final pricing calculated from `49.11`, not `1000000`.

3. Quote comparison shows:

```text
Rp 1.000.000 → €49.11
```

4. Existing EUR quotes still display normally.

5. Updating an existing IDR quote reuses the raw IDR input in the form.

---

## Rollout Order

1. Add migration.
2. Apply migration to Supabase live database.
3. Add TypeScript types/helper.
4. Add supplier management checkbox.
5. Add supplier quote conversion.
6. Update quote displays.
7. Run lint/build.
8. Commit and push.

---

## Out of Scope for V1

- Live FX API integration.
- Historical quote recalculation.
- Multiple currencies beyond EUR/IDR.
- Admin screen to edit exchange rates.
- Automatic daily FX cron.

Those can be V2 if this workflow proves useful.
