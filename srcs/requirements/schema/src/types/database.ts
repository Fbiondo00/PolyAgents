export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          data: Json | null
          id: number
          timestamp: number
          type: string
          vault_id: string
        }
        Insert: {
          data?: Json | null
          id?: never
          timestamp?: number
          type: string
          vault_id: string
        }
        Update: {
          data?: Json | null
          id?: never
          timestamp?: number
          type?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      cached_books: {
        Row: {
          books: Json
          updated_at: number
          vault_id: string
        }
        Insert: {
          books?: Json
          updated_at?: number
          vault_id: string
        }
        Update: {
          books?: Json
          updated_at?: number
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cached_books_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: true
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_runs: {
        Row: {
          active_market_id: string | null
          current_state: string
          id: string
          last_error: string | null
          last_heartbeat_at: number
          started_at: number
          status: string
          stopped_at: number | null
          vault_id: string
        }
        Insert: {
          active_market_id?: string | null
          current_state?: string
          id: string
          last_error?: string | null
          last_heartbeat_at?: number
          started_at?: number
          status?: string
          stopped_at?: number | null
          vault_id: string
        }
        Update: {
          active_market_id?: string | null
          current_state?: string
          id?: string
          last_error?: string | null
          last_heartbeat_at?: number
          started_at?: number
          status?: string
          stopped_at?: number | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_runs_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      market_states: {
        Row: {
          arc_claimed: boolean
          arc_market_id: number | null
          arc_resolved: boolean
          buy_cancel_done: boolean
          is_expired: boolean
          market: Json | null
          pending_old_market_id: string | null
          sell_cancel_done: boolean
          sides: Json | null
          total_new_entries: number
          vault_id: string
        }
        Insert: {
          arc_claimed?: boolean
          arc_market_id?: number | null
          arc_resolved?: boolean
          buy_cancel_done?: boolean
          is_expired?: boolean
          market?: Json | null
          pending_old_market_id?: string | null
          sell_cancel_done?: boolean
          sides?: Json | null
          total_new_entries?: number
          vault_id: string
        }
        Update: {
          arc_claimed?: boolean
          arc_market_id?: number | null
          arc_resolved?: boolean
          buy_cancel_done?: boolean
          is_expired?: boolean
          market?: Json | null
          pending_old_market_id?: string | null
          sell_cancel_done?: boolean
          sides?: Json | null
          total_new_entries?: number
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_states_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: true
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      pnl_snapshots: {
        Row: {
          computed_at: number
          id: number
          run_id: string
          side_breakdown: Json
          total_completed_cycles: number
          total_inventory_cost: number
          total_open_notional: number
          total_pnl: number
          total_realized_pnl: number
          total_unrealized_pnl: number
          vault_id: string
        }
        Insert: {
          computed_at?: number
          id?: never
          run_id: string
          side_breakdown?: Json
          total_completed_cycles?: number
          total_inventory_cost?: number
          total_open_notional?: number
          total_pnl?: number
          total_realized_pnl?: number
          total_unrealized_pnl?: number
          vault_id: string
        }
        Update: {
          computed_at?: number
          id?: never
          run_id?: string
          side_breakdown?: Json
          total_completed_cycles?: number
          total_inventory_cost?: number
          total_open_notional?: number
          total_pnl?: number
          total_realized_pnl?: number
          total_unrealized_pnl?: number
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pnl_snapshots_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_configs: {
        Row: {
          allow_both_sides: boolean
          auto_reentry_enabled: boolean
          cancel_open_buys_on_expiry: boolean
          enabled: boolean
          entry_price: number
          exit_price: number
          keep_sell_orders_after_expiry_seconds: number
          max_capital_usdc: number | null
          max_trades_per_market: number
          max_trades_policy: string
          min_spread_required: number | null
          no_new_entries_last_seconds: number
          order_size: number
          reconcile_interval_cycles: number
          strict_passive_only: boolean
          vault_id: string
        }
        Insert: {
          allow_both_sides?: boolean
          auto_reentry_enabled?: boolean
          cancel_open_buys_on_expiry?: boolean
          enabled?: boolean
          entry_price?: number
          exit_price?: number
          keep_sell_orders_after_expiry_seconds?: number
          max_capital_usdc?: number | null
          max_trades_per_market?: number
          max_trades_policy?: string
          min_spread_required?: number | null
          no_new_entries_last_seconds?: number
          order_size?: number
          reconcile_interval_cycles?: number
          strict_passive_only?: boolean
          vault_id: string
        }
        Update: {
          allow_both_sides?: boolean
          auto_reentry_enabled?: boolean
          cancel_open_buys_on_expiry?: boolean
          enabled?: boolean
          entry_price?: number
          exit_price?: number
          keep_sell_orders_after_expiry_seconds?: number
          max_capital_usdc?: number | null
          max_trades_per_market?: number
          max_trades_policy?: string
          min_spread_required?: number | null
          no_new_entries_last_seconds?: number
          order_size?: number
          reconcile_interval_cycles?: number
          strict_passive_only?: boolean
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_configs_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: true
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vaults: {
        Row: {
          active_market: Json | null
          created: number
          funding: Json
          id: string
          inventory: Json
          mode: string
          name: string
          sparkline: Json | null
          stats: Json
          strategy: Json
          token_balance: number
          wallet_address: string | null
        }
        Insert: {
          active_market?: Json | null
          created?: number
          funding?: Json
          id: string
          inventory?: Json
          mode?: string
          name: string
          sparkline?: Json | null
          stats?: Json
          strategy?: Json
          token_balance?: number
          wallet_address?: string | null
        }
        Update: {
          active_market?: Json | null
          created?: number
          funding?: Json
          id?: string
          inventory?: Json
          mode?: string
          name?: string
          sparkline?: Json | null
          stats?: Json
          strategy?: Json
          token_balance?: number
          wallet_address?: string | null
        }
        Relationships: []
      }
      virtual_orders: {
        Row: {
          client_ref: string
          engine_run_id: string
          expires_at: number | null
          filled_qty: number
          id: string
          intent: string
          market_id: string
          placed_at: number
          price: number
          rejection_reason: string | null
          remaining_qty: number
          side: string
          simulated: boolean
          status: string
          submitted_qty: number
          token_id: string
          vault_id: string
        }
        Insert: {
          client_ref: string
          engine_run_id: string
          expires_at?: number | null
          filled_qty?: number
          id: string
          intent: string
          market_id: string
          placed_at?: number
          price: number
          rejection_reason?: string | null
          remaining_qty: number
          side: string
          simulated?: boolean
          status?: string
          submitted_qty: number
          token_id: string
          vault_id: string
        }
        Update: {
          client_ref?: string
          engine_run_id?: string
          expires_at?: number | null
          filled_qty?: number
          id?: string
          intent?: string
          market_id?: string
          placed_at?: number
          price?: number
          rejection_reason?: string | null
          remaining_qty?: number
          side?: string
          simulated?: boolean
          status?: string
          submitted_qty?: number
          token_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_orders_engine_run_id_fkey"
            columns: ["engine_run_id"]
            isOneToOne: false
            referencedRelation: "engine_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_orders_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
