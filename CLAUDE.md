# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `npm run dev` (runs on http://localhost:3000)
- **Build**: `npm run build`
- **Production server**: `npm start`
- **Linting**: `npm run lint`

## Project Architecture

This is an RFQ (Request for Quotation) platform built with Next.js 16, Supabase, and TypeScript. It enables internal sales/admin users to create RFQs and invite suppliers to submit quotes via magic links.

### Core System Design

**Authentication & Authorization**:
- Uses Supabase Auth for internal users (sales/admin roles)
- Suppliers access via magic links (token-based, no registration required)
- Role-based access controlled by `user_roles` table
- Auth abstraction layer in `src/lib/auth/` planned for future Clerk migration

**Database Architecture**:
- PostgreSQL with Row Level Security (RLS) enabled
- Key entities: `suppliers`, `rfqs`, `rfq_invites`, `rfq_quotes`, `audit_logs`
- All operations are audited via `audit_logs` table
- Service role client bypasses RLS for system operations

**Pricing System**:
- Server-side pricing calculations only (not exposed to client)
- Suppliers enter base price + volume in m³ directly; do not derive pricing volume from RFQ thickness
- Suppliers whose pricing profile has transport mode `none` (e.g. Jardinico) get no dimension fields; their quote is stored with volume 0
- Shipping cost = `(container price / container volume m³) × supplier volume m³`
- Basis price = `base price × product margin × multiplier`
- Final price = `basis price + shipping cost`
- Every final (retail) price, for all suppliers and formulas, is rounded to whole euros (below ,50 down, from ,50 up) and gets € 1 extra: `roundRetailPrice` in `src/lib/pricing.ts`; the unrounded price is kept in `pricing_settings_snapshot.unroundedFinalPrice`
- Pricing settings are configurable in `Management → Pricing`; defaults are €7500 container price, 67m³ container volume, 2.1 product margin, 2.4 multiplier
- Supplier-specific Vos chains (source: Excel "Prijsberekening_nieuwe prijzen_2024_Bel CHD.xlsx", tab "B - vos CHD"): `× 1.05 loss recovery → × finish margin (1.9, or 2.1 when the finish code contains FE/T/V) → × 2.95 retail`, no transport
  - **Sanne Vos + Bluestone** (`src/lib/sanne-vos-pricing.ts`, `sanne-vos-auto-quote.ts`): fully automatic from m² rates and finish percentages, no supplier input
  - **Natuursteen Vos**, all materials (`src/lib/natuursteen-vos-pricing.ts`): the supplier enters a purchase price only (no dimensions); that price starts the chain, the finish percentage is not applied; unresolved finish → margin 1.9 + internal note
- **Stain stop** (Table tops checkbox in the RFQ wizard, `rfqs.stain_stop`): both Vos chains add a fixed €60 per piece (`STAIN_STOP_SURCHARGE_EUR`) after the finish margin and before the × 2.95 retail step, i.e. `(… × finish margin + 60 × quantity) × 2.95`. Not applied for Sanne Juk or standard suppliers.
- **Sanne Juk** (`src/lib/sanne-juk-pricing.ts`): price-only supplier (no dimensions, no transport); price × 2.1 × 2.4 (then the general whole-euro rounding + 1); the factors are fixed, not taken from the pricing settings
- **Own fabric** (`src/lib/own-fabric-pricing.ts`, source: Excel tab "B - jardinico CHD (2025)"): when a request has the finish "Own fabric" (material Fabric, cushions via Jardinico), sales pick the Sempre fabric on the request (`rfqs.own_fabric_id`/`own_fabric`, master list `own_fabrics` managed in `Management → Own fabrics`, price per running meter). The supplier quotes its price without fabric plus the running meters needed (`rfq_quotes.fabric_meters`); fabric cost = meters × price per meter is added to the supplier base price **before** the supplier's normal margin/multiplier (Jardinico profile: transport none, 2.0 × 2.5, then whole-euro rounding + 1). Stored in `fabric_cost_eur` and `pricing_settings_snapshot.ownFabric`. Applies on the generic supplier-profile path for any supplier, not on the Vos/Sanne Juk paths.

### Key Components Structure

**Pages & Routing**:
- `/dashboard` - Internal user dashboard with RFQ management
- `/supplier/rfq/[rfqId]` - Public supplier quote submission
- `/admin/logs` - Audit log viewing (admin only)

**Core Business Logic**:
- `src/actions/` - Server actions for RFQ/quote/audit operations
- `src/lib/pricing.ts` - Centralized pricing calculations
- `src/lib/tokens.ts` - Magic link token generation/validation

**Data Layer**:
- Supabase clients in `src/lib/supabase/`
- Type definitions in `src/types/index.ts`
- Database schema in `supabase/migrations/001_initial_schema.sql`

### Important Implementation Notes

- All pricing logic is server-side only and should never be exposed to clients
- Suppliers cannot register accounts; they only access via time-limited magic links
- Email notifications sent via Brevo integration (`src/lib/mailer.ts`)
- File uploads handled via Supabase Storage with signed URLs
- Comprehensive audit logging for all business operations

### TypeScript Configuration

Project uses strict TypeScript with path aliases (`@/*` maps to `src/*`). All components use React 19 with Next.js App Router.

## UI and Theming Rules

- The app uses **shadcn/ui** primitives from `@/components/ui`.
- The theme source of truth is `src/app/globals.css` (OKLCH tokens, `@theme inline`, `.dark` variant).
- Build new interface elements with shadcn components where available (`Button`, `Input`, `Label`, `Textarea`, `Dialog`, `Table`, `Card`, `Select`, `Alert`).
- Prefer semantic theme tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-destructive`, `border-border`) instead of hardcoded color utilities.
- For new forms: use `Label` + `Input`/`Textarea` + `Button`.
- For modals: use `Dialog` primitives from `@/components/ui/dialog`.
- For tabular data: use `Table` primitives from `@/components/ui/table`.
- For card-like containers: use `Card` primitives from `@/components/ui/card`.
- Keep theme-level color/font/radius/shadow/tracking changes centralized in `src/app/globals.css`.
