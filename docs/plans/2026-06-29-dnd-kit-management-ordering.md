# dnd kit Management Ordering Implementation Plan

> **For Hermes:** gebruik dit plan task-by-task. Werk klein, check na elke fase met lint/build, en raak bestaande uncommitted wijzigingen niet aan buiten de files hieronder.

**Goal:** Product types opnieuw volledig bewerkbaar maken (naam + volgorde + detail fields) en numerieke sort-order input vervangen door drag-and-drop reordering met dnd kit waar dat operationeel zinvol is.

**Architecture:** Hou `sort_order` als persisted database/source-of-truth, maar verberg het nummer in de UI. dnd kit wijzigt de array-volgorde client-side; server actions normaliseren daarna `sort_order` in stappen van 10. Product type namen blijven IDs voor masterdata, maar RFQs bewaren vandaag `product_type` als string: hernoemen wijzigt dus standaard alleen toekomstige/selectie-data, niet historiek.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase server actions, shadcn/ui, dnd kit React (`@dnd-kit/react`, `@dnd-kit/helpers`).

---

## Onderzoeksnotities

### Vastgestelde bug / oorzaak

- `src/components/product-type-management.tsx` kan product types **aanmaken** en **verwijderen**, en kan alleen `detail_fields` opslaan.
- `src/actions/product-types.ts` heeft `createProductType`, `updateProductTypeDetailFields`, `deleteProductType`, maar **geen** `updateProductType` voor `name`/`sort_order` en **geen** reorder-action.
- Daardoor kan Karsten de benaming/volgorde inderdaad niet meer aanpassen zodra een product type bestaat.

### Bestaande volgorde-mechaniek

- `product_types.sort_order` bestaat in `supabase/migrations/011_product_types_table.sql`.
- Server laadt product types via `.order('sort_order').order('name')` in `getProductTypes()`.
- `ProductTypeManagement` sorteert opnieuw client-side op `sort_order`, daarna `name`.
- `FinishOptionManagement` heeft wél edit voor `name` + `sort_order`, maar gebruikt nog een numeriek veld.
- `MaterialManagement` gebruikt de aangeleverde `productTypes` en `finishOptions` volgorde voor checkboxen/suggesties; als de master order goed is, stroomt die hier automatisch door.

### dnd kit check

- Huidige docs op `https://dndkit.com/` adviseren voor React: `@dnd-kit/react` en voor sortable state ook `@dnd-kit/helpers` (`move`).
- NPM-versies gecheckt op 2026-06-29:
  - `@dnd-kit/react`: `0.5.0`
  - `@dnd-kit/helpers`: `0.5.0`
  - legacy packages bestaan ook (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`), maar niet mengen met nieuwe docs tenzij bewust voor legacy gekozen wordt.

### Baseline verificatie

- `npm run lint` slaagt met 1 bestaande warning: `src/components/quote-comparison.tsx` unused `formatNumber`.
- `npm run build` slaagt.
- `git status` had vóór dit plan al bestaande uncommitted wijzigingen in o.a. `quote.ts`, `supplier-pricing.ts`, `suppliers.ts`, `quote-comparison.tsx`, `supplier-management.tsx`, `pricing.ts`, `types/index.ts`. Niet zomaar overschrijven.

---

## Scopebeslissing

### Wel doen in v1

1. Product types:
   - Naam kunnen bewerken.
   - Volgorde via drag-and-drop beheren.
   - Numerieke `sort_order` uit de management-UI halen.
   - Detail fields behouden in rechter editor.
2. Finishes:
   - Bestaande edit behouden.
   - Numerieke `sort_order` vervangen door drag-and-drop.
   - Volgorde laten doorwerken naar material finish suggestions.
3. Shared sortable UI/action patroon zodat toekomstige masterdata-lijsten niet opnieuw custom rommel krijgen.

### Niet doen in v1

- Geen drag-and-drop voor suppliers/materials zelf: daar is alfabetisch/search-based beheer logischer, tenzij er een echte business-order is.
- Geen per-material volgorde van product types of suppliers bewaren: de junction tables (`material_product_types`, `material_suppliers`) hebben vandaag geen `sort_order`. Voeg dat pas toe als Karsten effectief een volgorde binnen één materiaal/supplier nodig heeft.
- Geen automatische mass-rename van historische RFQs. RFQs bewaren `product_type` als string; historiek aanpassen is een aparte beslissing.

---

## Implementation tasks

### Task 1: Add dnd kit dependencies

**Objective:** Installeer de React dnd kit packages volgens de huidige docs.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Steps:**

1. Run:
   ```bash
   npm install @dnd-kit/react @dnd-kit/helpers
   ```
2. Check:
   ```bash
   npm run lint
   npm run build
   ```
3. Expected:
   - lint: pass, mogelijk dezelfde bestaande `formatNumber` warning.
   - build: pass.

---

### Task 2: Add shared sort-order helper

**Objective:** Eén simpele helper gebruiken om reordered IDs naar persistente `sort_order` waarden te vertalen.

**Files:**
- Create: `src/lib/sort-order.ts`

**Implementation:**

```ts
export const SORT_ORDER_STEP = 10;

export function buildSortOrderUpdates(ids: string[], step = SORT_ORDER_STEP) {
  const normalizedIds = ids.map((id) => id.trim()).filter(Boolean);
  const uniqueIds = new Set(normalizedIds);

  if (uniqueIds.size !== normalizedIds.length) {
    throw new Error('Duplicate IDs are not allowed when reordering.');
  }

  return normalizedIds.map((id, index) => ({
    id,
    sort_order: (index + 1) * step,
  }));
}
```

**Verification:**

```bash
npm run lint
npm run build
```

---

### Task 3: Add product type update + reorder server actions

**Objective:** Product types kunnen updaten zonder detail fields te raken, en drag order in bulk opslaan.

**Files:**
- Modify: `src/actions/product-types.ts`

**Changes:**

1. Add input types:
   ```ts
   interface UpdateProductTypeInput {
     name?: string;
   }

   interface ReorderProductTypesInput {
     orderedIds: string[];
   }
   ```
2. Add helper:
   ```ts
   function normalizeProductTypeName(name: string): string {
     return name.trim().replace(/\s+/g, ' ');
   }
   ```
3. Add `updateProductType(productTypeId, input)`:
   - `requireRole('sales')`.
   - Load existing row.
   - Validate non-empty name when supplied.
   - Check duplicate name case-insensitively against other product types.
   - Update only `{ name }`.
   - Merge/normalize `detail_fields` before returning.
   - Audit action: `PRODUCT_TYPE_UPDATED` with old/new name.
   - Revalidate `/admin/management`, `/dashboard`, `/dashboard/history`.
4. Add `reorderProductTypes(input)`:
   - `requireRole('sales')`.
   - Use `buildSortOrderUpdates(input.orderedIds)`.
   - Validate all IDs exist in `product_types`.
   - Update rows. For small lists, sequential updates are fine; avoid RPC/migration unless performance becomes an issue.
   - Return refreshed sorted product types via `getProductTypes()` or direct query + `mergeProductTypeDetailFields`.
   - Audit action: `PRODUCT_TYPES_REORDERED` with ordered IDs.

**Important RLS note:** repo migration `015_sales_manage_master_data.sql` allows sales/admin to manage `product_types`. If saving fails live with RLS/policy errors, inspect live Supabase policy state before broadening code permissions.

**Verification:**

```bash
npm run lint
npm run build
```

---

### Task 4: Refactor ProductTypeManagement edit model

**Objective:** Product type details panel wordt een echte editor: naam + detail fields + delete.

**Files:**
- Modify: `src/components/product-type-management.tsx`

**Changes:**

1. Import new action:
   ```ts
   import {
     createProductType,
     deleteProductType,
     reorderProductTypes,
     updateProductType,
     updateProductTypeDetailFields,
   } from '@/actions/product-types';
   ```
2. Replace `ProductTypeFormState`:
   - Create form: only `name`.
   - Edit form for selected product: `editName` state.
3. Creation behavior:
   - Remove visible `Sort order` input.
   - Server should assign new product type to end if no sort order supplied. Pragmatic option: client sends max current `sort_order + 10`; better option: server handles append-to-end.
4. Selected detail panel:
   - Show editable input for selected product type name.
   - Add button `Save name` or combine into `Save product type`.
   - Keep current `Save detail fields` button, but label clearer.
5. After `updateProductType`:
   - Update local `productTypes` state.
   - Keep `detailSettingsById` keyed by same ID.
   - Update selected row display immediately.
6. Copy change:
   - Replace `Sort order: X` UI text with something user-facing like `Sleep om te herschikken`.

**Verification:**

- Create product type.
- Select product type.
- Change name.
- Toggle a detail field.
- Save both and verify no data is lost in the local UI.
- Run:
  ```bash
  npm run lint
  npm run build
  ```

---

### Task 5: Add dnd sortable list for product types

**Objective:** Product type order wijzigen door items te slepen, niet via nummers.

**Files:**
- Modify: `src/components/product-type-management.tsx`
- Optional create: `src/components/sortable-list-item.tsx` if duplication with finishes becomes obvious.

**Implementation pattern:**

- Wrap visible list in `DragDropProvider` from `@dnd-kit/react`.
- Use `useSortable` per row.
- Use a drag handle icon (`GripVertical` from `lucide-react`) so clicking the row still selects the product type.
- Use helper `move` from `@dnd-kit/helpers` on drag end to reorder local state.
- Call `reorderProductTypes({ orderedIds })` after a successful drop.
- Optimistic update is OK, but keep `previousProductTypes` and revert on error.
- While reordering, disable delete/save buttons or at least ignore duplicate reorder submissions.

**UX details:**

- Keep pagination out of the first DnD implementation if possible. Product types are not huge; a paginated sortable list is awkward because dragging across pages is impossible.
- If the list must remain paginated, only allow reorder inside current page and clearly state that. Recommended: remove pagination for product types and use a max-height scroll area.
- Add keyboard/accessibility support via dnd kit defaults; do not build pointer-only drag.

**Verification:**

- Drag first item to third position.
- Refresh page; order persists.
- Open RFQ/product type dropdown and material checkbox list; new order is visible.
- Run:
  ```bash
  npm run lint
  npm run build
  ```

---

### Task 6: Add finish option reorder server action

**Objective:** Finishes volgen hetzelfde persisted-order patroon.

**Files:**
- Modify: `src/actions/finish-options.ts`

**Changes:**

1. Add `reorderFinishOptions({ orderedIds })`.
2. It must support both storage fallback and DB table:
   - If `finish_options` table exists: update rows by ID with normalized `sort_order`.
   - If table missing/schema cache error: read storage JSON, update `sort_order`, write storage JSON.
3. Return sorted active options.
4. Audit action: `FINISH_OPTIONS_REORDERED`.

**Verification:**

```bash
npm run lint
npm run build
```

---

### Task 7: Replace finish sort-order field with dnd reorder

**Objective:** Finishes blijven bewerkbaar, maar volgorde gaat via drag-and-drop.

**Files:**
- Modify: `src/components/finish-option-management.tsx`

**Changes:**

1. Remove visible `Sort order` input from the create/edit form.
2. Keep name edit via existing `editingId` flow.
3. Add sortable table/list with drag handle.
4. On drop, call `reorderFinishOptions`.
5. Hide raw `sort_order` column. Show small helper text: `Sleep om de volgorde van suggesties te bepalen.`

**Verification:**

- Drag finish order.
- Refresh page; order persists.
- Edit a finish name; order remains.
- Open material dialog; master finish suggestion order follows the finish order.
- Run:
  ```bash
  npm run lint
  npm run build
  ```

---

### Task 8: Final QA checklist

**Objective:** Bewijzen dat de management flow werkt en niet alleen compileert.

**Commands:**

```bash
npm run lint
npm run build
npm run dev
```

**Manual browser QA:**

1. `/admin/management` → Product types.
2. Create a test product type.
3. Rename it.
4. Drag it to a different position.
5. Refresh and verify order/name persisted.
6. Toggle detail fields and verify they still save.
7. Delete the test type if unused.
8. Product type appears in RFQ wizard in the new order.
9. Materials dialog product type checklist follows the new order.
10. Finishes tab: drag finish order, refresh, verify material finish suggestions follow order.

**Live Supabase checks if saves fail:**

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('product_types', 'finish_options')
order by tablename, policyname;
```

Expected for product types: sales/admin can manage, matching repo migration `015_sales_manage_master_data.sql`.

---

## Recommended implementation order

1. Product type edit action + UI first. This fixes the immediate blocker without waiting on drag-and-drop.
2. Product type dnd reorder second. This removes manual sort numbers where Karsten actually feels pain.
3. Finish option dnd reorder third. Same UX issue, lower risk.
4. Only after using it: decide if materials/suppliers need their own order. My recommendation: not now.

## Risks / decisions to keep explicit

- **Historical RFQ names:** renaming a product type will not automatically update old RFQs because RFQs store a string. Keep that behavior unless Karsten explicitly wants a migration/rename wizard.
- **Pagination + DnD:** drag ordering and pagination fight each other. Prefer a scrollable list over pages for product types/finishes.
- **RLS drift:** if product type updates fail live, check live Supabase policies before changing server actions.
- **dnd kit package choice:** use the new `@dnd-kit/react` docs path consistently. Do not mix with legacy `@dnd-kit/core/@dnd-kit/sortable` in the same implementation unless there is a clear reason.
