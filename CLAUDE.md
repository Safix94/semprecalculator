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
- Base price + calculated shipping cost with configurable margins
- Shipping calculated per container volume (€7500/67m³)
- Product margin: 2.1x, shipping margin: 2.4x

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
