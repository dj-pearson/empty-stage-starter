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
      ai_coach_conversations: {
        Row: {
          conversation_title: string | null
          created_at: string | null
          id: string
          is_archived: boolean | null
          kid_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          conversation_title?: string | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          kid_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          conversation_title?: string | null
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          kid_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_coach_conversations_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
          },
          {
            foreignKeyName: "ai_coach_conversations_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_coach_messages: {
        Row: {
          content: string
          context_snapshot: Json | null
          conversation_id: string | null
          created_at: string | null
          id: string
          model_used: string | null
          response_time_ms: number | null
          role: string
          tokens_used: number | null
        }
        Insert: {
          content: string
          context_snapshot?: Json | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          model_used?: string | null
          response_time_ms?: number | null
          role: string
          tokens_used?: number | null
        }
        Update: {
          content?: string
          context_snapshot?: Json | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          model_used?: string | null
          response_time_ms?: number | null
          role?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_coach_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_coach_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
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
      blog_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          post_count: number | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          post_count?: number | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          post_count?: number | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      blog_comments: {
        Row: {
          author_email: string
          author_name: string
          content: string
          created_at: string | null
          id: string
          post_id: string | null
          status: string | null
        }
        Insert: {
          author_email: string
          author_name: string
          content: string
          created_at?: string | null
          id?: string
          post_id?: string | null
          status?: string | null
        }
        Update: {
          author_email?: string
          author_name?: string
          content?: string
          created_at?: string | null
          id?: string
          post_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "blog_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_generated: boolean | null
          ai_prompt: string | null
          author_id: string | null
          category_id: string | null
          content: string
          created_at: string | null
          excerpt: string | null
          featured_image_url: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          published_at: string | null
          reading_time_minutes: number | null
          scheduled_for: string | null
          slug: string
          status: string | null
          title: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_prompt?: string | null
          author_id?: string | null
          category_id?: string | null
          content: string
          created_at?: string | null
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          scheduled_for?: string | null
          slug: string
          status?: string | null
          title: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_prompt?: string | null
          author_id?: string | null
          category_id?: string | null
          content?: string
          created_at?: string | null
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          scheduled_for?: string | null
          slug?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      campaign_analytics: {
        Row: {
          campaign_id: string
          clicks: number | null
          conversions: number | null
          cost: number | null
          created_at: string | null
          date: string
          id: string
          impressions: number | null
          leads_generated: number | null
        }
        Insert: {
          campaign_id: string
          clicks?: number | null
          conversions?: number | null
          cost?: number | null
          created_at?: string | null
          date: string
          id?: string
          impressions?: number | null
          leads_generated?: number | null
        }
        Update: {
          campaign_id?: string
          clicks?: number | null
          conversions?: number | null
          cost?: number | null
          created_at?: string | null
          date?: string
          id?: string
          impressions?: number | null
          leads_generated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_analytics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          conversion_goal: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          name: string
          source: Database["public"]["Enums"]["lead_source"]
          start_date: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          conversion_goal?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          source: Database["public"]["Enums"]["lead_source"]
          start_date?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          conversion_goal?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          source?: Database["public"]["Enums"]["lead_source"]
          start_date?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          click_rate: number | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          list_id: string | null
          name: string
          open_rate: number | null
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          subject: string
          template_id: string | null
          total_clicks: number | null
          total_opens: number | null
          total_recipients: number | null
          total_sent: number | null
          updated_at: string | null
        }
        Insert: {
          click_rate?: number | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          list_id?: string | null
          name: string
          open_rate?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
          total_clicks?: number | null
          total_opens?: number | null
          total_recipients?: number | null
          total_sent?: number | null
          updated_at?: string | null
        }
        Update: {
          click_rate?: number | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          list_id?: string | null
          name?: string
          open_rate?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
          total_clicks?: number | null
          total_opens?: number | null
          total_recipients?: number | null
          total_sent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      email_lists: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          subscriber_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subscriber_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subscriber_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_subscribers: {
        Row: {
          confirmed: boolean | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          list_id: string | null
          metadata: Json | null
          source: string | null
          status: string | null
          subscribed_at: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          confirmed?: boolean | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          list_id?: string | null
          metadata?: Json | null
          source?: string | null
          status?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          confirmed?: boolean | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          list_id?: string | null
          metadata?: Json | null
          source?: string | null
          status?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_subscribers_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: string | null
          content_template: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          subject_template: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          category?: string | null
          content_template: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          subject_template: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          category?: string | null
          content_template?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          subject_template?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      food_attempts: {
        Row: {
          amount_consumed: string | null
          attempted_at: string | null
          bites_taken: number | null
          celebration_unlocked: string | null
          created_at: string | null
          food_id: string | null
          id: string
          is_milestone: boolean | null
          kid_id: string | null
          meal_slot: string | null
          mood_after: string | null
          mood_before: string | null
          outcome: string
          parent_notes: string | null
          photo_urls: string[] | null
          preparation_method: string | null
          presentation_notes: string | null
          reaction_notes: string | null
          stage: string | null
          strategies_used: string[] | null
        }
        Insert: {
          amount_consumed?: string | null
          attempted_at?: string | null
          bites_taken?: number | null
          celebration_unlocked?: string | null
          created_at?: string | null
          food_id?: string | null
          id?: string
          is_milestone?: boolean | null
          kid_id?: string | null
          meal_slot?: string | null
          mood_after?: string | null
          mood_before?: string | null
          outcome: string
          parent_notes?: string | null
          photo_urls?: string[] | null
          preparation_method?: string | null
          presentation_notes?: string | null
          reaction_notes?: string | null
          stage?: string | null
          strategies_used?: string[] | null
        }
        Update: {
          amount_consumed?: string | null
          attempted_at?: string | null
          bites_taken?: number | null
          celebration_unlocked?: string | null
          created_at?: string | null
          food_id?: string | null
          id?: string
          is_milestone?: boolean | null
          kid_id?: string | null
          meal_slot?: string | null
          mood_after?: string | null
          mood_before?: string | null
          outcome?: string
          parent_notes?: string | null
          photo_urls?: string[] | null
          preparation_method?: string | null
          presentation_notes?: string | null
          reaction_notes?: string | null
          stage?: string | null
          strategies_used?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "food_attempts_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_attempts_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["food_id"]
          },
          {
            foreignKeyName: "food_attempts_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
          },
          {
            foreignKeyName: "food_attempts_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      food_chain_suggestions: {
        Row: {
          chain_reason: string[] | null
          created_at: string | null
          id: string
          recommended_order: number | null
          similarity_score: number | null
          source_food_id: string | null
          target_food_id: string | null
        }
        Insert: {
          chain_reason?: string[] | null
          created_at?: string | null
          id?: string
          recommended_order?: number | null
          similarity_score?: number | null
          source_food_id?: string | null
          target_food_id?: string | null
        }
        Update: {
          chain_reason?: string[] | null
          created_at?: string | null
          id?: string
          recommended_order?: number | null
          similarity_score?: number | null
          source_food_id?: string | null
          target_food_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_chain_suggestions_source_food_id_fkey"
            columns: ["source_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_chain_suggestions_source_food_id_fkey"
            columns: ["source_food_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["food_id"]
          },
          {
            foreignKeyName: "food_chain_suggestions_target_food_id_fkey"
            columns: ["target_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_chain_suggestions_target_food_id_fkey"
            columns: ["target_food_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["food_id"]
          },
        ]
      }
      food_properties: {
        Row: {
          color_primary: string | null
          color_secondary: string | null
          common_brands: string[] | null
          created_at: string | null
          flavor_intensity: number | null
          flavor_profile: string[] | null
          food_category: string | null
          food_id: string | null
          id: string
          messy_factor: number | null
          protein_source: boolean | null
          requires_chewing: boolean | null
          similar_foods: string[] | null
          smell_intensity: number | null
          spice_level: number | null
          texture_primary: string | null
          texture_score: number | null
          texture_secondary: string | null
          typical_temperature: string | null
          updated_at: string | null
          vegetable_source: boolean | null
          visual_complexity: string | null
        }
        Insert: {
          color_primary?: string | null
          color_secondary?: string | null
          common_brands?: string[] | null
          created_at?: string | null
          flavor_intensity?: number | null
          flavor_profile?: string[] | null
          food_category?: string | null
          food_id?: string | null
          id?: string
          messy_factor?: number | null
          protein_source?: boolean | null
          requires_chewing?: boolean | null
          similar_foods?: string[] | null
          smell_intensity?: number | null
          spice_level?: number | null
          texture_primary?: string | null
          texture_score?: number | null
          texture_secondary?: string | null
          typical_temperature?: string | null
          updated_at?: string | null
          vegetable_source?: boolean | null
          visual_complexity?: string | null
        }
        Update: {
          color_primary?: string | null
          color_secondary?: string | null
          common_brands?: string[] | null
          created_at?: string | null
          flavor_intensity?: number | null
          flavor_profile?: string[] | null
          food_category?: string | null
          food_id?: string | null
          id?: string
          messy_factor?: number | null
          protein_source?: boolean | null
          requires_chewing?: boolean | null
          similar_foods?: string[] | null
          smell_intensity?: number | null
          spice_level?: number | null
          texture_primary?: string | null
          texture_score?: number | null
          texture_secondary?: string | null
          typical_temperature?: string | null
          updated_at?: string | null
          vegetable_source?: boolean | null
          visual_complexity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_properties_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_properties_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["food_id"]
          },
        ]
      }
      foods: {
        Row: {
          aisle: string | null
          allergens: string[] | null
          category: string
          created_at: string | null
          household_id: string | null
          id: string
          is_safe: boolean
          is_try_bite: boolean
          name: string
          package_quantity: string | null
          quantity: number | null
          servings_per_container: number | null
          unit: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aisle?: string | null
          allergens?: string[] | null
          category: string
          created_at?: string | null
          household_id?: string | null
          id?: string
          is_safe?: boolean
          is_try_bite?: boolean
          name: string
          package_quantity?: string | null
          quantity?: number | null
          servings_per_container?: number | null
          unit?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aisle?: string | null
          allergens?: string[] | null
          category?: string
          created_at?: string | null
          household_id?: string | null
          id?: string
          is_safe?: boolean
          is_try_bite?: boolean
          name?: string
          package_quantity?: string | null
          quantity?: number | null
          servings_per_container?: number | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "foods_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_items: {
        Row: {
          category: string
          checked: boolean
          created_at: string | null
          household_id: string | null
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
          household_id?: string | null
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
          household_id?: string | null
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
            foreignKeyName: "grocery_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_items_source_plan_entry_id_fkey"
            columns: ["source_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "plan_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          household_id: string
          id: string
          invited_by: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string
          household_id: string
          id?: string
          invited_by: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          household_id?: string
          id?: string
          invited_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invitations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          id: string
          invited_by: string | null
          joined_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      kid_achievements: {
        Row: {
          achievement_description: string | null
          achievement_name: string
          achievement_type: string
          color: string | null
          earned_at: string | null
          icon_name: string | null
          id: string
          kid_id: string | null
          points_value: number | null
          triggered_by_creation_id: string | null
          triggered_by_food_id: string | null
        }
        Insert: {
          achievement_description?: string | null
          achievement_name: string
          achievement_type: string
          color?: string | null
          earned_at?: string | null
          icon_name?: string | null
          id?: string
          kid_id?: string | null
          points_value?: number | null
          triggered_by_creation_id?: string | null
          triggered_by_food_id?: string | null
        }
        Update: {
          achievement_description?: string | null
          achievement_name?: string
          achievement_type?: string
          color?: string | null
          earned_at?: string | null
          icon_name?: string | null
          id?: string
          kid_id?: string | null
          points_value?: number | null
          triggered_by_creation_id?: string | null
          triggered_by_food_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_achievements_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
          },
          {
            foreignKeyName: "kid_achievements_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_achievements_triggered_by_creation_id_fkey"
            columns: ["triggered_by_creation_id"]
            isOneToOne: false
            referencedRelation: "kid_meal_creations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_achievements_triggered_by_food_id_fkey"
            columns: ["triggered_by_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_achievements_triggered_by_food_id_fkey"
            columns: ["triggered_by_food_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["food_id"]
          },
        ]
      }
      kid_meal_creations: {
        Row: {
          badges_earned: string[] | null
          created_at: string | null
          creation_name: string
          creation_type: string | null
          foods: Json
          id: string
          is_shared_with_family: boolean | null
          kid_approved: boolean | null
          kid_id: string | null
          last_requested_at: string | null
          plate_template: string | null
          screenshot_data: string | null
          shared_at: string | null
          stars_earned: number | null
          thumbnail_url: string | null
          times_requested: number | null
        }
        Insert: {
          badges_earned?: string[] | null
          created_at?: string | null
          creation_name: string
          creation_type?: string | null
          foods: Json
          id?: string
          is_shared_with_family?: boolean | null
          kid_approved?: boolean | null
          kid_id?: string | null
          last_requested_at?: string | null
          plate_template?: string | null
          screenshot_data?: string | null
          shared_at?: string | null
          stars_earned?: number | null
          thumbnail_url?: string | null
          times_requested?: number | null
        }
        Update: {
          badges_earned?: string[] | null
          created_at?: string | null
          creation_name?: string
          creation_type?: string | null
          foods?: Json
          id?: string
          is_shared_with_family?: boolean | null
          kid_approved?: boolean | null
          kid_id?: string | null
          last_requested_at?: string | null
          plate_template?: string | null
          screenshot_data?: string | null
          shared_at?: string | null
          stars_earned?: number | null
          thumbnail_url?: string | null
          times_requested?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_meal_creations_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
          },
          {
            foreignKeyName: "kid_meal_creations_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
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
          household_id: string | null
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
          household_id?: string | null
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
          household_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interactions: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          interaction_type: string
          lead_id: string
          metadata: Json | null
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          interaction_type: string
          lead_id: string
          metadata?: Json | null
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          interaction_type?: string
          lead_id?: string
          metadata?: Json | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          campaign_id: string | null
          converted_at: string | null
          converted_user_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          last_contacted_at: string | null
          metadata: Json | null
          notes: string | null
          phone: string | null
          score: number | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          campaign_id?: string | null
          converted_at?: string | null
          converted_user_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          last_contacted_at?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          score?: number | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          campaign_id?: string | null
          converted_at?: string | null
          converted_user_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_contacted_at?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          score?: number | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
          package_quantity: string | null
          protein_g: number | null
          serving_size: string | null
          servings_per_container: number | null
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
          package_quantity?: string | null
          protein_g?: number | null
          serving_size?: string | null
          servings_per_container?: number | null
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
          package_quantity?: string | null
          protein_g?: number | null
          serving_size?: string | null
          servings_per_container?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_history: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          status: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entries: {
        Row: {
          created_at: string | null
          date: string
          food_id: string
          household_id: string | null
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
          household_id?: string | null
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
          household_id?: string | null
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
            foreignKeyName: "plan_entries_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["food_id"]
          },
          {
            foreignKeyName: "plan_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_entries_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
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
      post_analytics: {
        Row: {
          clicks: number | null
          comments: number | null
          created_at: string | null
          engagement_rate: number | null
          id: string
          impressions: number | null
          last_synced_at: string | null
          likes: number | null
          platform: Database["public"]["Enums"]["social_platform"]
          platform_post_id: string | null
          post_id: string
          reach: number | null
          shares: number | null
        }
        Insert: {
          clicks?: number | null
          comments?: number | null
          created_at?: string | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          likes?: number | null
          platform: Database["public"]["Enums"]["social_platform"]
          platform_post_id?: string | null
          post_id: string
          reach?: number | null
          shares?: number | null
        }
        Update: {
          clicks?: number | null
          comments?: number | null
          created_at?: string | null
          engagement_rate?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          likes?: number | null
          platform?: Database["public"]["Enums"]["social_platform"]
          platform_post_id?: string | null
          post_id?: string
          reach?: number | null
          shares?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_analytics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_queue: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          id: string
          platform: Database["public"]["Enums"]["social_platform"]
          post_id: string
          scheduled_for: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          platform: Database["public"]["Enums"]["social_platform"]
          post_id: string
          scheduled_for: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          post_id?: string
          scheduled_for?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_queue_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          onboarding_completed: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id: string
          onboarding_completed?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          onboarding_completed?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recipes: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          food_ids: string[]
          household_id: string | null
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
          household_id?: string | null
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
          household_id?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_posted_at: string | null
          metadata: Json | null
          platform: Database["public"]["Enums"]["social_platform"]
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_posted_at?: string | null
          metadata?: Json | null
          platform: Database["public"]["Enums"]["social_platform"]
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_posted_at?: string | null
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["social_platform"]
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          hashtags: string[] | null
          id: string
          image_urls: string[] | null
          link_url: string | null
          metadata: Json | null
          platforms: Database["public"]["Enums"]["social_platform"][]
          published_at: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["post_status"]
          title: string | null
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          hashtags?: string[] | null
          id?: string
          image_urls?: string[] | null
          link_url?: string | null
          metadata?: Json | null
          platforms: Database["public"]["Enums"]["social_platform"][]
          published_at?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          hashtags?: string[] | null
          id?: string
          image_urls?: string[] | null
          link_url?: string | null
          metadata?: Json | null
          platforms?: Database["public"]["Enums"]["social_platform"][]
          published_at?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          new_plan_id: string | null
          old_plan_id: string | null
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          new_plan_id?: string | null
          old_plan_id?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          new_plan_id?: string | null
          old_plan_id?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_new_plan_id_fkey"
            columns: ["new_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_old_plan_id_fkey"
            columns: ["old_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          ai_coach_daily_limit: number | null
          created_at: string | null
          features: Json | null
          food_tracker_monthly_limit: number | null
          has_food_chaining: boolean | null
          has_meal_builder: boolean | null
          has_multi_household: boolean | null
          has_nutrition_tracking: boolean | null
          has_white_label: boolean | null
          id: string
          is_active: boolean | null
          max_children: number | null
          max_meal_plans: number | null
          max_pantry_foods: number | null
          max_recipes: number | null
          max_therapists: number | null
          name: string
          price_monthly: number
          price_yearly: number | null
          sort_order: number | null
          stripe_price_id: string | null
          support_level: string | null
          updated_at: string | null
        }
        Insert: {
          ai_coach_daily_limit?: number | null
          created_at?: string | null
          features?: Json | null
          food_tracker_monthly_limit?: number | null
          has_food_chaining?: boolean | null
          has_meal_builder?: boolean | null
          has_multi_household?: boolean | null
          has_nutrition_tracking?: boolean | null
          has_white_label?: boolean | null
          id?: string
          is_active?: boolean | null
          max_children?: number | null
          max_meal_plans?: number | null
          max_pantry_foods?: number | null
          max_recipes?: number | null
          max_therapists?: number | null
          name: string
          price_monthly: number
          price_yearly?: number | null
          sort_order?: number | null
          stripe_price_id?: string | null
          support_level?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_coach_daily_limit?: number | null
          created_at?: string | null
          features?: Json | null
          food_tracker_monthly_limit?: number | null
          has_food_chaining?: boolean | null
          has_meal_builder?: boolean | null
          has_multi_household?: boolean | null
          has_nutrition_tracking?: boolean | null
          has_white_label?: boolean | null
          id?: string
          is_active?: boolean | null
          max_children?: number | null
          max_meal_plans?: number | null
          max_pantry_foods?: number | null
          max_recipes?: number | null
          max_therapists?: number | null
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          sort_order?: number | null
          stripe_price_id?: string | null
          support_level?: string | null
          updated_at?: string | null
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
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_usage_tracking: {
        Row: {
          ai_coach_requests: number | null
          created_at: string | null
          date: string
          food_tracker_entries: number | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_coach_requests?: number | null
          created_at?: string | null
          date?: string
          food_tracker_entries?: number | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_coach_requests?: number | null
          created_at?: string | null
          date?: string
          food_tracker_entries?: number | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          id: string
          platform: Database["public"]["Enums"]["social_platform"]
          post_id: string | null
          request_payload: Json | null
          response_body: string | null
          response_status: number | null
          success: boolean | null
          webhook_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform: Database["public"]["Enums"]["social_platform"]
          post_id?: string | null
          request_payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          success?: boolean | null
          webhook_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          post_id?: string | null
          request_payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          success?: boolean | null
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      kid_food_success_stats: {
        Row: {
          food_id: string | null
          food_name: string | null
          kid_id: string | null
          kid_name: string | null
          last_attempted: string | null
          partial_attempts: number | null
          refused_attempts: number | null
          success_rate: number | null
          successful_attempts: number | null
          total_attempts: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_food_similarity: {
        Args: { food1_id: string; food2_id: string }
        Returns: number
      }
      calculate_lead_score: {
        Args: { lead_id: string }
        Returns: number
      }
      can_add_child: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      check_and_unlock_achievements: {
        Args: {
          p_attempt_outcome?: string
          p_food_id?: string
          p_kid_id: string
        }
        Returns: undefined
      }
      check_feature_limit: {
        Args: {
          p_current_count?: number
          p_feature_type: string
          p_user_id: string
        }
        Returns: Json
      }
      deduct_food_quantity: {
        Args: { _amount?: number; _food_id: string }
        Returns: undefined
      }
      get_blog_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          draft_posts: number
          published_posts: number
          scheduled_posts: number
          total_comments: number
          total_posts: number
          total_views: number
        }[]
      }
      get_campaign_stats: {
        Args: { campaign_uuid: string }
        Returns: {
          avg_score: number
          conversion_rate: number
          converted_leads: number
          total_leads: number
        }[]
      }
      get_email_marketing_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_subscribers: number
          avg_click_rate: number
          avg_open_rate: number
          sent_campaigns: number
          total_campaigns: number
          total_subscribers: number
        }[]
      }
      get_food_chain_suggestions: {
        Args: { limit_count?: number; source_food: string }
        Returns: {
          food_id: string
          food_name: string
          reasons: string[]
          similarity_score: number
        }[]
      }
      get_post_engagement_summary: {
        Args: Record<PropertyKey, never>
        Returns: {
          avg_engagement_rate: number
          published_posts: number
          scheduled_posts: number
          total_engagement: number
          total_impressions: number
          total_posts: number
        }[]
      }
      get_user_household_id: {
        Args: { _user_id: string }
        Returns: string
      }
      get_user_subscription: {
        Args: { user_uuid: string }
        Returns: {
          cancel_at_period_end: boolean
          current_period_end: string
          plan_name: string
          status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_usage: {
        Args: { p_feature_type: string; p_user_id: string }
        Returns: undefined
      }
      is_food_safe_for_kid: {
        Args: { _food_allergens: string[]; _kid_allergens: string[] }
        Returns: boolean
      }
      schedule_post_to_queue: {
        Args: {
          _platforms: Database["public"]["Enums"]["social_platform"][]
          _post_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      lead_source:
        | "landing_page"
        | "signup_form"
        | "trial_signup"
        | "newsletter"
        | "contact_form"
        | "referral"
        | "social_media"
        | "organic_search"
        | "paid_ad"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "converted"
        | "unqualified"
        | "lost"
      post_status: "draft" | "scheduled" | "published" | "failed" | "deleted"
      social_platform:
        | "facebook"
        | "instagram"
        | "twitter"
        | "linkedin"
        | "tiktok"
        | "pinterest"
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
      lead_source: [
        "landing_page",
        "signup_form",
        "trial_signup",
        "newsletter",
        "contact_form",
        "referral",
        "social_media",
        "organic_search",
        "paid_ad",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "converted",
        "unqualified",
        "lost",
      ],
      post_status: ["draft", "scheduled", "published", "failed", "deleted"],
      social_platform: [
        "facebook",
        "instagram",
        "twitter",
        "linkedin",
        "tiktok",
        "pinterest",
      ],
    },
  },
} as const
