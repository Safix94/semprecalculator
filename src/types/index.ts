export type UserRole = 'sales' | 'admin';

export type RfqStatus = 'draft' | 'sent' | 'closed';

export type AuditAction =
  | 'RFQ_CREATED'
  | 'RFQ_UPDATED'
  | 'RFQ_SENT'
  | 'INVITE_CREATED'
  | 'INVITE_OPENED'
  | 'INVITE_REVOKED'
  | 'INVITE_EXPIRED'
  | 'QUOTE_SUBMITTED'
  | 'EMAIL_SENT';

export type ActorType = 'sales' | 'admin' | 'supplier_link' | 'system';

export interface Supplier {
  id: string;
  name: string;
  email: string;
  materials: string[];
  is_active: boolean;
  created_at: string;
}

export interface Rfq {
  id: string;
  created_by: string;
  customer_name: string | null;
  material: string;
  length: number;
  width: number;
  height: number;
  thickness: number;
  shape: string;
  notes: string | null;
  status: RfqStatus;
  created_at: string;
  sent_at: string | null;
}

export interface RfqAttachment {
  id: string;
  rfq_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  created_at: string;
}

export interface RfqInvite {
  id: string;
  rfq_id: string;
  supplier_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  last_access_at: string | null;
  created_at: string;
}

export interface RfqQuote {
  id: string;
  rfq_id: string;
  supplier_id: string;
  base_price: number;
  volume_m3: number;
  shipping_cost_calculated: number;
  final_price_calculated: number;
  currency: string;
  lead_time_days: number | null;
  comment: string | null;
  submitted_at: string;
}

export interface AuditLog {
  id: string;
  actor_type: ActorType;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  ip: string | null;
  user_agent: string | null;
}

// Extended types for UI
export interface RfqWithRelations extends Rfq {
  attachments?: RfqAttachment[];
  invites?: (RfqInvite & { supplier?: Supplier })[];
  quotes?: (RfqQuote & { supplier?: Supplier })[];
}

export interface InviteWithSupplier extends RfqInvite {
  supplier: Supplier;
  quote?: RfqQuote | null;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
