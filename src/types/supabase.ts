// Generated Supabase database types.
// Regenerate after schema changes with: npm run db:types
// (requires the Supabase CLI to be authenticated), or via the Supabase MCP
// generate_typescript_types tool.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          actor_type: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip: string | null
          metadata: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_type: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      finish_options: {
        Row: {
          abbreviation: string | null
          created_at: string
          formula_percentage: number | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string
          formula_percentage?: number | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          created_at?: string
          formula_percentage?: number | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      material_product_types: {
        Row: {
          created_at: string
          id: string
          material_id: string
          product_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          product_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          product_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_product_types_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_product_types_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      material_suppliers: {
        Row: {
          created_at: string
          id: string
          material_id: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_suppliers_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          finish_options: string[]
          finish_options_color: string[]
          finish_options_edge: string[]
          finish_options_top: string[]
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finish_options?: string[]
          finish_options_color?: string[]
          finish_options_edge?: string[]
          finish_options_top?: string[]
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finish_options?: string[]
          finish_options_color?: string[]
          finish_options_edge?: string[]
          finish_options_top?: string[]
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_settings: {
        Row: {
          container_price_eur: number
          container_volume_m3: number
          created_at: string
          id: number
          idr_per_eur_rate: number
          product_margin_factor: number
          shipping_margin_factor: number
          updated_at: string
          updated_by: string | null
          usd_per_eur_rate: number
        }
        Insert: {
          container_price_eur?: number
          container_volume_m3?: number
          created_at?: string
          id?: number
          idr_per_eur_rate?: number
          product_margin_factor?: number
          shipping_margin_factor?: number
          updated_at?: string
          updated_by?: string | null
          usd_per_eur_rate?: number
        }
        Update: {
          container_price_eur?: number
          container_volume_m3?: number
          created_at?: string
          id?: number
          idr_per_eur_rate?: number
          product_margin_factor?: number
          shipping_margin_factor?: number
          updated_at?: string
          updated_by?: string | null
          usd_per_eur_rate?: number
        }
        Relationships: []
      }
      product_types: {
        Row: {
          created_at: string
          detail_fields: Json | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          detail_fields?: Json | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          detail_fields?: Json | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      rfq_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          rfq_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          rfq_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          rfq_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_attachments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_comments: {
        Row: {
          author_email: string | null
          author_id: string
          author_type: string
          body: string
          created_at: string
          id: string
          rfq_id: string
          supplier_id: string
        }
        Insert: {
          author_email?: string | null
          author_id: string
          author_type: string
          body: string
          created_at?: string
          id?: string
          rfq_id: string
          supplier_id: string
        }
        Update: {
          author_email?: string | null
          author_id?: string
          author_type?: string
          body?: string
          created_at?: string
          id?: string
          rfq_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_comments_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_comments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_invites: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invite_part: string
          last_access_at: string | null
          revoked_at: string | null
          rfq_id: string
          supplier_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          invite_part?: string
          last_access_at?: string | null
          revoked_at?: string | null
          rfq_id: string
          supplier_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invite_part?: string
          last_access_at?: string | null
          revoked_at?: string | null
          rfq_id?: string
          supplier_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_invites_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invites_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_quotes: {
        Row: {
          area_m2: number | null
          base_price: number
          comment: string | null
          cost_including_transport: number | null
          currency: string
          final_price_calculated: number
          id: string
          lead_time_days: number | null
          pricing_formula_version: string | null
          pricing_method: string | null
          pricing_settings_snapshot: Json | null
          product_price_after_margin: number | null
          retail_multiplier_factor: number | null
          rfq_id: string
          shipping_cost_calculated: number
          submitted_at: string
          supplier_id: string
          supplier_input_converted_at: string | null
          supplier_input_currency: string
          supplier_input_exchange_rate_idr_per_eur: number | null
          supplier_input_exchange_rate_per_eur: number | null
          supplier_input_price: number | null
          transport_adjusted_base_price: number | null
          transport_cost_calculated: number | null
          truck_multiplier_factor: number | null
          volume_m3: number
        }
        Insert: {
          area_m2?: number | null
          base_price: number
          comment?: string | null
          cost_including_transport?: number | null
          currency?: string
          final_price_calculated: number
          id?: string
          lead_time_days?: number | null
          pricing_formula_version?: string | null
          pricing_method?: string | null
          pricing_settings_snapshot?: Json | null
          product_price_after_margin?: number | null
          retail_multiplier_factor?: number | null
          rfq_id: string
          shipping_cost_calculated: number
          submitted_at?: string
          supplier_id: string
          supplier_input_converted_at?: string | null
          supplier_input_currency?: string
          supplier_input_exchange_rate_idr_per_eur?: number | null
          supplier_input_exchange_rate_per_eur?: number | null
          supplier_input_price?: number | null
          transport_adjusted_base_price?: number | null
          transport_cost_calculated?: number | null
          truck_multiplier_factor?: number | null
          volume_m3: number
        }
        Update: {
          area_m2?: number | null
          base_price?: number
          comment?: string | null
          cost_including_transport?: number | null
          currency?: string
          final_price_calculated?: number
          id?: string
          lead_time_days?: number | null
          pricing_formula_version?: string | null
          pricing_method?: string | null
          pricing_settings_snapshot?: Json | null
          product_price_after_margin?: number | null
          retail_multiplier_factor?: number | null
          rfq_id?: string
          shipping_cost_calculated?: number
          submitted_at?: string
          supplier_id?: string
          supplier_input_converted_at?: string | null
          supplier_input_currency?: string
          supplier_input_exchange_rate_idr_per_eur?: number | null
          supplier_input_exchange_rate_per_eur?: number | null
          supplier_input_price?: number | null
          transport_adjusted_base_price?: number | null
          transport_cost_calculated?: number | null
          truck_multiplier_factor?: number | null
          volume_m3?: number
        }
        Relationships: [
          {
            foreignKeyName: "rfq_quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          created_at: string
          created_by: string
          customer_name: string | null
          finish: string | null
          finish_color: string | null
          finish_edge: string | null
          finish_table_foot: string | null
          finish_table_top: string | null
          finish_top: string | null
          height: number
          id: string
          length: number
          material: string
          material_id: string | null
          material_id_table_foot: string | null
          material_id_table_top: string | null
          material_table_foot: string | null
          material_table_top: string | null
          model: string | null
          notes: string | null
          product_type: string | null
          quantity: number
          sent_at: string | null
          shape: string
          status: string
          thickness: number
          usage_environment: string | null
          width: number
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_name?: string | null
          finish?: string | null
          finish_color?: string | null
          finish_edge?: string | null
          finish_table_foot?: string | null
          finish_table_top?: string | null
          finish_top?: string | null
          height: number
          id?: string
          length: number
          material: string
          material_id?: string | null
          material_id_table_foot?: string | null
          material_id_table_top?: string | null
          material_table_foot?: string | null
          material_table_top?: string | null
          model?: string | null
          notes?: string | null
          product_type?: string | null
          quantity?: number
          sent_at?: string | null
          shape: string
          status?: string
          thickness: number
          usage_environment?: string | null
          width: number
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_name?: string | null
          finish?: string | null
          finish_color?: string | null
          finish_edge?: string | null
          finish_table_foot?: string | null
          finish_table_top?: string | null
          finish_top?: string | null
          height?: number
          id?: string
          length?: number
          material?: string
          material_id?: string | null
          material_id_table_foot?: string | null
          material_id_table_top?: string | null
          material_table_foot?: string | null
          material_table_top?: string | null
          model?: string | null
          notes?: string | null
          product_type?: string | null
          quantity?: number
          sent_at?: string | null
          shape?: string
          status?: string
          thickness?: number
          usage_environment?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_material_id_table_foot_fkey"
            columns: ["material_id_table_foot"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_material_id_table_top_fkey"
            columns: ["material_id_table_top"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_link_rate_limits: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_hash: string | null
          scope_key: string
          scope_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          scope_key: string
          scope_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          scope_key?: string
          scope_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      supplier_pricing_profiles: {
        Row: {
          container_price_eur: number | null
          container_volume_m3: number | null
          created_at: string
          formula_version: string
          id: string
          product_margin_factor: number
          retail_multiplier_factor: number
          supplier_id: string
          transport_mode: string
          truck_multiplier_factor: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          container_price_eur?: number | null
          container_volume_m3?: number | null
          created_at?: string
          formula_version?: string
          id?: string
          product_margin_factor?: number
          retail_multiplier_factor?: number
          supplier_id: string
          transport_mode?: string
          truck_multiplier_factor?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          container_price_eur?: number | null
          container_volume_m3?: number | null
          created_at?: string
          formula_version?: string
          id?: string
          product_margin_factor?: number
          retail_multiplier_factor?: number
          supplier_id?: string
          transport_mode?: string
          truck_multiplier_factor?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_pricing_profiles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: true
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_special_pricing_bluestone_rates: {
        Row: {
          base_price_per_m2_eur: number | null
          created_at: string
          discount_percentage: number
          id: string
          is_supported: boolean
          material_id: string
          net_price_per_m2_eur: number | null
          shape_kind: string
          supplier_id: string
          surface_type: string
          thickness_cm: number
          unsupported_reason: string | null
          updated_at: string
        }
        Insert: {
          base_price_per_m2_eur?: number | null
          created_at?: string
          discount_percentage?: number
          id?: string
          is_supported?: boolean
          material_id: string
          net_price_per_m2_eur?: number | null
          shape_kind: string
          supplier_id: string
          surface_type?: string
          thickness_cm: number
          unsupported_reason?: string | null
          updated_at?: string
        }
        Update: {
          base_price_per_m2_eur?: number | null
          created_at?: string
          discount_percentage?: number
          id?: string
          is_supported?: boolean
          material_id?: string
          net_price_per_m2_eur?: number | null
          shape_kind?: string
          supplier_id?: string
          surface_type?: string
          thickness_cm?: number
          unsupported_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_special_pricing_bluestone_rates_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_special_pricing_bluestone_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          additional_emails: string[]
          created_at: string
          email: string
          id: string
          is_active: boolean
          materials: string[]
          name: string
          preferred_language: string
          quote_price_currency: string
        }
        Insert: {
          additional_emails?: string[]
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          materials?: string[]
          name: string
          preferred_language?: string
          quote_price_currency?: string
        }
        Update: {
          additional_emails?: string[]
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          materials?: string[]
          name?: string
          preferred_language?: string
          quote_price_currency?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_suppliers_for_material: {
        Args: { material_uuid: string }
        Returns: {
          email: string
          id: string
          is_active: boolean
          name: string
        }[]
      }
      get_user_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
