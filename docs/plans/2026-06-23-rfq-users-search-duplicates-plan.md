# RFQ Users, Search, Editing, and Duplicate Detection Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make admins able to create users, improve RFQ wording/titles, allow pricing users to edit requests after sending to pricing, add a searchable RFQ history page, and warn users when a newly created RFQ likely duplicates a past request.

**Architecture:** Keep the existing Next.js 16 + Supabase + server actions architecture. Use Supabase Auth Admin for user creation, keep existing `rfqs` schema fields stable where possible, add server-side search/duplicate helpers, and show duplicate suggestions in the create wizard without blocking valid new RFQs.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase Auth/Postgres/RLS, shadcn/ui, existing server actions in `src/actions/*`.

---

## Current code facts

- RFQs live in `public.rfqs`; suppliers are linked through `rfq_invites` and quotes through `rfq_quotes`.
- Existing dashboard search in `src/app/dashboard/page.tsx` only searches `customer_name` and product type.
- Existing full `updateRfq()` in `src/actions/rfq.ts` only updates when `status = 'draft'`.
- Existing limited `updateRfqDetails()` can edit model/length/width/height/thickness from the detail modal.
- Supplier page currently hides quote editing after first submit because `canSubmitOrUpdateQuote = !invite.used_at` in `src/app/supplier/rfq/[rfqId]/page.tsx`.
- Supplier email subject currently does not receive `productType` in `sendSupplierInviteEmail()`.
- Pricing email subject is generic: `New price request ready for review`.
- UI label `Thickness` appears in create/detail/supplier views, but backend field is `thickness`.

---

## Decisions

1. **Do not rename DB field `thickness`.** Only change visible labels to `Thickness top`. DB migrations for a label change are not worth the risk.
2. **Do not hard-block duplicate RFQs.** Show warnings and suggestions, but allow “Create anyway”. Sometimes a duplicate request is intentional.
3. **Use exact duplicate + similar suggestions.** Exact match requires product type, material/finish, supplier, and dimensions to match. Similar suggestions can show same product/material/finish/supplier with different dimensions.
4. **Only allow full editing in safe statuses.** Full request editing should be allowed in `draft` and `sent_to_pricing`. Once sent to suppliers or quotes received, restrict to notes/comments and controlled resend/edit flows.
5. **Admin user creation v1:** admin enters email + role; server creates Supabase Auth user with temporary password and `user_roles` row; password is shown once. Later improvement: forced password reset/set-password flow.

---

# Phase 1 — Quick correctness fixes

## Task 1: Rename UI label `Thickness` to `Thickness top`

**Objective:** Change visible label text only; keep `thickness` field names untouched.

**Files:**
- Modify: `src/components/rfq-create-wizard.tsx`
- Modify: `src/components/rfq-detail-modal.tsx`
- Modify: `src/app/supplier/rfq/[rfqId]/page.tsx`
- Modify if needed: `src/lib/validation.ts`
- Search all UI strings for `Thickness`.

**Steps:**
1. Search `Thickness` and `thickness` labels.
2. Replace user-facing labels:
   - `Thickness` → `Thickness top`
   - validation messages may remain technical, but preferably use `Thickness top must be ...`.
3. Do not rename TypeScript fields or DB columns.
4. Run:
   ```bash
   npm run lint
   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy TOKEN_HASH_SECRET=dummy BREVO_API_KEY=dummy NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build
   ```

**Acceptance:** Every visible RFQ screen says `Thickness top`; no DB migration.

---

## Task 2: Add product type to pricing email title/subject

**Objective:** Pricing team immediately sees product type in the email/title.

**Files:**
- Modify: `src/lib/mailer.ts`
- Modify: `src/actions/rfq.ts`

**Implementation:**
1. Extend `sendPricingTeamRfqNotification(params)` with:
   ```ts
   productType?: string | null;
   title?: string;
   ```
2. In `sendToPricingTeam()`, build a title like:
   ```txt
   New price request: [Product type] - [Material/part] - [Shape]
   ```
   Example:
   ```txt
   New price request: Table Tops - Ceramic - Rectangular
   ```
3. Use that in email subject and `<h2>`.
4. Keep summary below it.

**Acceptance:** Pricing email subject is no longer generic and includes product type.

---

## Task 3: Add product type to supplier email and supplier page title

**Objective:** Suppliers also see the product type clearly.

**Files:**
- Modify: `src/lib/mailer.ts`
- Modify: `src/actions/rfq.ts`
- Modify: `src/app/supplier/rfq/[rfqId]/page.tsx`

**Implementation:**
1. Add `productType?: string | null` to `sendSupplierInviteEmail()` params.
2. Pass `rfq.product_type` from `sendRfq()`.
3. Change subject from:
   ```txt
   Request for quotation: [material]
   ```
   to:
   ```txt
   Request for quotation: [product type] - [material/part]
   ```
4. On supplier page, change title from:
   ```tsx
   Request for quotation
   ```
   to:
   ```tsx
   Request for quotation: {rfq.product_type || 'Product'}
   ```

**Acceptance:** Supplier email and supplier page card title include product type.

---

# Phase 2 — Admin user creation

## Task 4: Add server action for admin-created users

**Objective:** Admins can create internal users without manual Supabase work.

**Files:**
- Modify: `src/actions/users.ts`
- Modify: `src/types/index.ts` if needed

**Implementation:**
1. Add `createUserWithRole(input)` server action.
2. Require `requireRole('admin')`.
3. Validate:
   ```ts
   email: valid email
   role: 'sales' | 'admin'
   ```
4. Use `createServiceRoleClient().auth.admin.createUser({ ... })`:
   - email
   - password: generated temporary password
   - email_confirm: true
   - user_metadata optional
5. Insert/update `public.user_roles` with selected role.
6. Return:
   ```ts
   { data: { id, email, role, temporaryPassword } }
   ```
7. Log audit action `USER_CREATED`.
8. Revalidate `/admin/management`.

**Security note:** Temporary password is returned once and never stored in app DB.

**Acceptance:** Admin can create a Supabase Auth user and role row in one action.

---

## Task 5: Add create-user UI in Management → Users

**Objective:** Admins get a simple form in the existing users management screen.

**Files:**
- Inspect/modify: `src/components/user-role-management.tsx`
- Modify if needed: `src/app/admin/management/page.tsx`

**UI:**
- Email input
- Role select: Sales/Admin
- Button: `Create user`
- Success box with:
  ```txt
  User created
  Email: ...
  Temporary password: ...
  Copy password
  ```

**Acceptance:** Admin can create `sales` or `admin` users from the app.

---

# Phase 3 — Editing after sent to pricing

## Task 6: Allow full RFQ editing while status is `sent_to_pricing`

**Objective:** Pricing team/users can still adjust request details before supplier send.

**Files:**
- Modify: `src/actions/rfq.ts`
- Modify: `src/components/rfq-detail-modal.tsx`
- Possibly create: `src/components/rfq-edit-form.tsx`

**Backend change:**
Change `updateRfq()` from:
```ts
.eq('status', 'draft')
```
to:
```ts
.in('status', ['draft', 'sent_to_pricing'])
```

**UI change:**
1. Add/edit a full `Edit request` button in RFQ detail modal for `draft` and `sent_to_pricing`.
2. The edit form should include the same meaningful fields as create:
   - customer name
   - product type
   - material(s)
   - finish(es)
   - suppliers
   - dimensions
   - model
   - usage
   - notes
3. Keep supplier sending blocked until required suppliers are valid.

**Acceptance:** Request sent to pricing can still be updated before sending to supplier.

---

## Task 7: Let suppliers update their quote after first submit

**Objective:** Supplier should be able to correct their submitted price/volume/lead time/comment.

**Files:**
- Modify: `src/app/supplier/rfq/[rfqId]/page.tsx`
- Verify: `src/actions/quote.ts`
- Verify: `src/components/supplier-quote-form.tsx`

**Current issue:**
```ts
const canSubmitOrUpdateQuote = !invite.used_at;
```
This blocks updates once the invite was used.

**Implementation:**
1. Change permission logic to allow quote form when:
   - token is valid
   - invite is not revoked
   - invite is not expired
2. Keep `existingQuote` as initial values.
3. Button text should say `Update quote` when quote exists.
4. In `submitSupplierQuote`, ensure existing quote is updated, not duplicated. Current code likely already upserts/updates; verify.
5. Log audit action for quote update.

**Acceptance:** Supplier can reopen link and update quote while invite is valid.

---

# Phase 4 — Searchable RFQ history page

## Task 8: Add RFQ search server action

**Objective:** Provide one server-side search API for current dashboard and new history page.

**Files:**
- Create: `src/actions/rfq-search.ts`
- Modify: `src/types/index.ts` for search result type

**Filters:**
- free text: customer, material, finish, notes, supplier name, product type
- supplier id/name
- product type
- material
- finish / finish top / edge / color / table top / table foot
- dimensions: length, width, height, thickness top, shape
- date range: created from/to
- status

**Query approach v1:**
Use Supabase service/server action with joins:
- `rfqs`
- `rfq_invites` → `suppliers`
- optionally `rfq_quotes`

Return flattened rows:
```ts
{
  rfq: Rfq;
  supplierNames: string[];
  quoteCount: number;
  bestFinalPrice?: number;
}
```

**Acceptance:** Server action returns paginated RFQ search results with supplier names.

---

## Task 9: Add `/dashboard/history` page

**Objective:** Users can search all past RFQs to avoid duplicate work.

**Files:**
- Create: `src/app/dashboard/history/page.tsx`
- Create: `src/components/rfq-history-search.tsx`
- Modify navigation/sidebar/header if present

**UI:**
- Search input: `Search requests...`
- Filters row:
  - Supplier
  - Product type
  - Material
  - Finish
  - Shape
  - Date from/to
- Advanced collapsible filters:
  - length/width/height/thickness top exact or range
  - status
- Results table:
  - Date
  - Product type
  - Supplier(s)
  - Material/finish
  - Dimensions
  - Customer
  - Status
  - Action: open RFQ

**Acceptance:** A user can find old RFQs by supplier/product/material/finish/dimensions/date quickly.

---

# Phase 5 — Duplicate detection during create

## Task 10: Create canonical RFQ match helper

**Objective:** Normalize RFQ data so duplicate logic is consistent.

**Files:**
- Create: `src/lib/rfq-match.ts`

**Helper functions:**
```ts
normalizeText(value: string | null | undefined): string
normalizeNumber(value: number | string | null | undefined): number | null
buildRfqMatchInput(input): RfqMatchInput
scoreRfqMatch(candidate, input): 'exact' | 'similar' | null
```

**Exact match fields:**
- product type
- material(s)
- finish(es)
- selected supplier(s)
- shape
- dimensions:
  - length
  - width, unless round
  - height
  - thickness top
- optionally quantity as displayed signal, not hard blocker unless business confirms

**Acceptance:** Duplicate matching rules live in one place, not scattered across components.

---

## Task 11: Add `findSimilarRfqs` server action

**Objective:** Query past requests while user creates a new RFQ.

**Files:**
- Modify/create: `src/actions/rfq-search.ts`

**Implementation:**
1. Input should accept the same partial data as the create wizard.
2. Require authenticated internal user.
3. Only search when enough fields exist:
   - product type
   - material/finish
   - at least one supplier
4. Return max 5 exact matches and max 5 similar matches.
5. Include reason labels:
   ```txt
   Exact same supplier/product/material/finish/dimensions
   Same supplier/product/material/finish, different dimensions
   Same product/material/finish/dimensions, different supplier
   ```

**Acceptance:** Server returns useful duplicate suggestions without blocking creation.

---

## Task 12: Show duplicate warning in create wizard

**Objective:** Warn before users waste time creating a duplicate RFQ.

**Files:**
- Modify: `src/components/rfq-create-wizard.tsx`
- Possibly create: `src/components/rfq-duplicate-warning.tsx`

**UX:**
- After product/material/finish/supplier/dimensions are entered, call `findSimilarRfqs` with debounce.
- Show a warning card:
  ```txt
  Mogelijke dubbele aanvraag gevonden
  Deze combinatie werd al eerder aangevraagd bij [supplier] op [date].
  ```
- Show top matches with:
  - product type
  - supplier
  - material/finish
  - dimensions
  - date
  - status
  - button `Open existing request`
- Continue button changes to:
  ```txt
  Create anyway
  ```
  if exact matches exist.

**Acceptance:** User sees duplicate warning before submitting, but can still proceed.

---

## Task 13: Backend duplicate check during final create

**Objective:** Avoid race conditions and make duplicate warning reliable.

**Files:**
- Modify: `src/actions/rfq.ts`
- Modify/create: `src/actions/rfq-search.ts`

**Implementation:**
1. `createRfq()` should call the same duplicate helper before insert.
2. If exact duplicates exist and `allowDuplicate !== true`, return structured warning:
   ```ts
   { duplicateWarning: { matches: [...] } }
   ```
3. Wizard stores `allowDuplicate = true` only after user clicked `Create anyway`.

**Acceptance:** Duplicate detection works even if the client-side warning missed it.

---

# Phase 6 — Polish and verification

## Task 14: Add tests or targeted verification scripts

**Objective:** Prevent regressions in duplicate scoring and RFQ title builders.

**Files:**
- Create/modify tests depending on current test setup. If no test framework is configured, add small pure function tests with `vitest` only if already present; otherwise verify via lint/build and manual scripts.

**Minimum verification:**
- Duplicate helper exact match returns exact.
- Different dimensions returns similar.
- Different supplier returns similar or null depending rule.
- Title builder includes product type for pricing and supplier.

---

## Task 15: Final QA and deploy

**Commands:**
```bash
git diff --check
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy TOKEN_HASH_SECRET=dummy BREVO_API_KEY=dummy NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build
git status --short
```

**Manual QA:**
1. Admin creates a new user.
2. New user can log in.
3. `Thickness top` appears everywhere relevant.
4. Pricing email subject includes product type.
5. Supplier email/page title includes product type.
6. RFQ in `sent_to_pricing` can be edited.
7. Supplier can update quote after first submit.
8. History page filters by supplier/product/material/finish/dimensions/date.
9. Create wizard warns on exact duplicate.
10. User can still create anyway.

**Deploy:**
- Commit in small commits by phase.
- Push to `origin master`.
- Verify Vercel status via GitHub commit status.

---

# Recommended implementation order

1. Quick fixes: labels + product type titles.
2. Supplier quote update permission.
3. Admin create user.
4. Edit RFQ after sent to pricing.
5. Search history page.
6. Duplicate detection.

Reason: the first four remove current workflow friction fast. Search/duplicate detection is larger and should be built carefully, not hacked into the current dashboard table.
