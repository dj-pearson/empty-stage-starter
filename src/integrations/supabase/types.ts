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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          additional_params: Json | null
          api_key_env_var: string
          auth_type: string
          created_at: string
          endpoint_url: string
          id: string
          is_active: boolean
          max_tokens: number | null
          model_name: string
          name: string
          provider: string
          temperature: number | null
          updated_at: string
        }
        Insert: {
          additional_params?: Json | null
          api_key_env_var: string
          auth_type?: string
          created_at?: string
          endpoint_url: string
          id?: string
          is_active?: boolean
          max_tokens?: number | null
          model_name: string
          name: string
          provider: string
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          additional_params?: Json | null
          api_key_env_var?: string
          auth_type?: string
          created_at?: string
          endpoint_url?: string
          id?: string
          is_active?: boolean
          max_tokens?: number | null
          model_name?: string
          name?: string
          provider?: string
          temperature?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      foods: {
        Row: {
          aisle: string | null
          allergens: string[] | null
          category: string
          created_at: string | null
          id: string
          is_safe: boolean
          is_try_bite: boolean
          name: string
          quantity: number | null
          unit: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aisle?: string | null
          allergens?: string[] | null
          category: string
          created_at?: string | null
          id?: string
          is_safe?: boolean
          is_try_bite?: boolean
          name: string
          quantity?: number | null
          unit?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aisle?: string | null
          allergens?: string[] | null
          category?: string
          created_at?: string | null
          id?: string
          is_safe?: boolean
          is_try_bite?: boolean
          name?: string
          quantity?: number | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      grocery_items: {
        Row: {
          category: string
          checked: boolean
          created_at: string | null
          id: string
          name: string
          quantity: number
          source_plan_entry_id: string | null
          unit: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          checked?: boolean
          created_at?: string | null
          id?: string
          name: string
          quantity?: number
          source_plan_entry_id?: string | null
          unit?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          checked?: boolean
          created_at?: string | null
          id?: string
          name?: string
          quantity?: number
          source_plan_entry_id?: string | null
          unit?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_source_plan_entry_id_fkey"
            columns: ["source_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "plan_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      kids: {
        Row: {
          age: number | null
          allergens: string[] | null
          created_at: string | null
          date_of_birth: string | null
          favorite_foods: string[] | null
          id: string
          name: string
          notes: string | null
          profile_picture_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age?: number | null
          allergens?: string[] | null
          created_at?: string | null
          date_of_birth?: string | null
          favorite_foods?: string[] | null
          id?: string
          name: string
          notes?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age?: number | null
          allergens?: string[] | null
          created_at?: string | null
          date_of_birth?: string | null
          favorite_foods?: string[] | null
          id?: string
          name?: string
          notes?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition: {
        Row: {
          allergens: string[] | null
          calories: number | null
          carbs_g: number | null
          category: string
          created_at: string | null
          created_by: string | null
          fat_g: number | null
          id: string
          ingredients: string | null
          name: string
          protein_g: number | null
          serving_size: string | null
          updated_at: string | null
        }
        Insert: {
          allergens?: string[] | null
          calories?: number | null
          carbs_g?: number | null
          category: string
          created_at?: string | null
          created_by?: string | null
          fat_g?: number | null
          id?: string
          ingredients?: string | null
          name: string
          protein_g?: number | null
          serving_size?: string | null
          updated_at?: string | null
        }
        Update: {
          allergens?: string[] | null
          calories?: number | null
          carbs_g?: number | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          fat_g?: number | null
          id?: string
          ingredients?: string | null
          name?: string
          protein_g?: number | null
          serving_size?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      plan_entries: {
        Row: {
          created_at: string | null
          date: string
          food_id: string
          id: string
          kid_id: string
          meal_slot: string
          notes: string | null
          result: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          food_id: string
          id?: string
          kid_id: string
          meal_slot: string
          notes?: string | null
          result?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          food_id?: string
          id?: string
          kid_id?: string
          meal_slot?: string
          notes?: string | null
          result?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entries_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_entries_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          food_ids: string[]
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          food_ids?: string[]
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          food_ids?: string[]
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deduct_food_quantity: {
        Args: { _amount?: number; _food_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_food_safe_for_kid: {
        Args: { _food_allergens: string[]; _kid_allergens: string[] }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
