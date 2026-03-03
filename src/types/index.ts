export type UserRole = 'sales' | 'admin';

export type RfqStatus =
  | 'draft'
  | 'sent_to_pricing'
  | 'sent_to_pricing_crm'
  | 'sent_to_supplier'
  | 'supplier_replied'
  | 'waiting_for_technical_drawing'
  | 'quotes_received'
  | 'closed';

export type AuditAction =
  | 'RFQ_CREATED'
  | 'RFQ_UPDATED'
  | 'RFQ_SENT'
  | 'RFQ_SENT_TO_PRICING'
  | 'RFQ_SENT_TO_PRICING_CRM'
  | 'INVITE_CREATED'
  | 'INVITE_OPENED'
  | 'INVITE_REVOKED'
  | 'INVITE_EXPIRED'
  | 'QUOTE_SUBMITTED'
  | 'QUOTE_UPDATED'
  | 'SUPPLIER_COMMENT_ADDED'
  | 'INTERNAL_COMMENT_ADDED'
  | 'SUPPLIER_LINK_SENT'
  | 'EMAIL_SENT';

export type ActorType = 'sales' | 'admin' | 'supplier_link' | 'system';
export type UsageEnvironment = 'Indoor' | 'Outdoor';

export interface Supplier {
  id: string;
  name: string;
  email: string;
  materials: string[];
  is_active: boolean;
  created_at: string;
}

export interface Material {
  id: string;
  name: string;
  finish_options: string[];
  finish_options_top?: string[];
  finish_options_edge?: string[];
  finish_options_color?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialSupplier {
  id: string;
  material_id: string;
  supplier_id: string;
  created_at: string;
}

export interface ProductType {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Rfq {
  id: string;
  created_by: string;
  customer_name: string | null;
  product_type: string | null;
  material: string;
  material_id: string | null;
  material_id_table_top: string | null;
  material_id_table_foot: string | null;
  material_table_top: string | null;
  material_table_foot: string | null;
  finish: string | null;
  finish_top: string | null;
  finish_edge: string | null;
  finish_color: string | null;
  finish_table_top: string | null;
  finish_table_foot: string | null;
  length: number;
  width: number;
  height: number;
  thickness: number;
  quantity: number;
  shape: string;
  usage_environment: UsageEnvironment | null;
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
  invite_part?: 'default' | 'table_top' | 'table_foot' | 'table_both';
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
  area_m2?: number | null;
  volume_m3: number;
  shipping_cost_calculated: number;
  final_price_calculated: number;
  currency: string;
  lead_time_days: number | null;
  comment: string | null;
  submitted_at: string;
}

export interface RfqComment {
  id: string;
  rfq_id: string;
  supplier_id: string;
  author_type: 'supplier' | 'internal';
  author_id: string;
  author_email: string | null;
  body: string;
  created_at: string;
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
export interface MaterialWithSuppliers extends Material {
  suppliers?: Supplier[];
}

export interface SupplierWithMaterials extends Supplier {
  available_materials?: Material[];
}

export interface RfqWithRelations extends Rfq {
  attachments?: RfqAttachment[];
  invites?: (RfqInvite & { supplier?: Supplier })[];
  quotes?: (RfqQuote & { supplier?: Supplier })[];
  comments?: RfqComment[];
  material_details?: Material;
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

export interface UserWithRole {
  id: string;
  email: string | null;
  role: UserRole | null;
}
