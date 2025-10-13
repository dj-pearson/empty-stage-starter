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
      admin_alert_preferences: {
        Row: {
          admin_id: string | null
          alert_type: string
          created_at: string | null
          email_enabled: boolean | null
          id: string
          push_enabled: boolean | null
          threshold_value: number | null
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          alert_type: string
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          threshold_value?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          alert_type?: string
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          threshold_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_alert_preferences_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_alert_preferences_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_alerts: {
        Row: {
          alert_data: Json | null
          alert_type: string
          created_at: string | null
          id: string
          is_read: boolean | null
          is_resolved: boolean | null
          message: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
          updated_at: string | null
        }
        Insert: {
          alert_data?: Json | null
          alert_type: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          is_resolved?: boolean | null
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          alert_data?: Json | null
          alert_type?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          is_resolved?: boolean | null
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_live_activity: {
        Row: {
          activity_data: Json
          activity_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          severity: string | null
          user_id: string | null
        }
        Insert: {
          activity_data?: Json
          activity_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          severity?: string | null
          user_id?: string | null
        }
        Update: {
          activity_data?: Json
          activity_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          severity?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          severity: string
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          severity: string
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          severity?: string
          title?: string
        }
        Relationships: []
      }
      admin_system_health: {
        Row: {
          id: string
          metric_type: string
          metric_unit: string | null
          metric_value: number
          recorded_at: string | null
        }
        Insert: {
          id?: string
          metric_type: string
          metric_unit?: string | null
          metric_value: number
          recorded_at?: string | null
        }
        Update: {
          id?: string
          metric_type?: string
          metric_unit?: string | null
          metric_value?: number
          recorded_at?: string | null
        }
        Relationships: []
      }
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
      ai_cost_budgets: {
        Row: {
          budget_name: string
          budget_type: string
          created_at: string | null
          critical_threshold_pct: number | null
          enterprise_tier_limit_cents: number
          free_tier_limit_cents: number
          id: string
          is_active: boolean | null
          premium_tier_limit_cents: number
          updated_at: string | null
          warning_threshold_pct: number | null
        }
        Insert: {
          budget_name: string
          budget_type: string
          created_at?: string | null
          critical_threshold_pct?: number | null
          enterprise_tier_limit_cents?: number
          free_tier_limit_cents?: number
          id?: string
          is_active?: boolean | null
          premium_tier_limit_cents?: number
          updated_at?: string | null
          warning_threshold_pct?: number | null
        }
        Update: {
          budget_name?: string
          budget_type?: string
          created_at?: string | null
          critical_threshold_pct?: number | null
          enterprise_tier_limit_cents?: number
          free_tier_limit_cents?: number
          id?: string
          is_active?: boolean | null
          premium_tier_limit_cents?: number
          updated_at?: string | null
          warning_threshold_pct?: number | null
        }
        Relationships: []
      }
      ai_model_pricing: {
        Row: {
          completion_price_per_1m_tokens: number
          created_at: string | null
          id: string
          is_active: boolean | null
          model_name: string
          prompt_price_per_1m_tokens: number
          provider: string
          updated_at: string | null
        }
        Insert: {
          completion_price_per_1m_tokens: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          model_name: string
          prompt_price_per_1m_tokens: number
          provider: string
          updated_at?: string | null
        }
        Update: {
          completion_price_per_1m_tokens?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          model_name?: string
          prompt_price_per_1m_tokens?: number
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
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
      ai_usage_logs: {
        Row: {
          completion_cost_cents: number | null
          completion_tokens: number | null
          created_at: string | null
          endpoint: string
          error_message: string | null
          id: string
          model: string | null
          prompt_cost_cents: number | null
          prompt_tokens: number | null
          request_duration_ms: number | null
          request_metadata: Json | null
          response_metadata: Json | null
          status: string | null
          total_cost_cents: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_cost_cents?: number | null
          completion_tokens?: number | null
          created_at?: string | null
          endpoint: string
          error_message?: string | null
          id?: string
          model?: string | null
          prompt_cost_cents?: number | null
          prompt_tokens?: number | null
          request_duration_ms?: number | null
          request_metadata?: Json | null
          response_metadata?: Json | null
          status?: string | null
          total_cost_cents?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_cost_cents?: number | null
          completion_tokens?: number | null
          created_at?: string | null
          endpoint?: string
          error_message?: string | null
          id?: string
          model?: string | null
          prompt_cost_cents?: number | null
          prompt_tokens?: number | null
          request_duration_ms?: number | null
          request_metadata?: Json | null
          response_metadata?: Json | null
          status?: string | null
          total_cost_cents?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      automation_email_events: {
        Row: {
          created_at: string | null
          email_id: string | null
          event_data: Json | null
          event_type: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email_id?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email_id?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_email_events_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "automation_email_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_email_queue: {
        Row: {
          created_at: string | null
          error_message: string | null
          html_body: string
          id: string
          max_retries: number | null
          priority: number | null
          retry_count: number | null
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          subject: string
          template_key: string
          template_variables: Json | null
          text_body: string | null
          to_email: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          html_body: string
          id?: string
          max_retries?: number | null
          priority?: number | null
          retry_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template_key: string
          template_variables?: Json | null
          text_body?: string | null
          to_email: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          html_body?: string
          id?: string
          max_retries?: number | null
          priority?: number | null
          retry_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_key?: string
          template_variables?: Json | null
          text_body?: string | null
          to_email?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_email_queue_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "automation_email_templates"
            referencedColumns: ["template_key"]
          },
        ]
      }
      automation_email_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          marketing_emails: boolean | null
          milestone_emails: boolean | null
          tips_and_advice: boolean | null
          unsubscribe_token: string | null
          unsubscribed_at: string | null
          updated_at: string | null
          user_id: string | null
          weekly_summary: boolean | null
          welcome_emails: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          marketing_emails?: boolean | null
          milestone_emails?: boolean | null
          tips_and_advice?: boolean | null
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          weekly_summary?: boolean | null
          welcome_emails?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          marketing_emails?: boolean | null
          milestone_emails?: boolean | null
          tips_and_advice?: boolean | null
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          weekly_summary?: boolean | null
          welcome_emails?: boolean | null
        }
        Relationships: []
      }
      automation_email_templates: {
        Row: {
          category: string
          created_at: string | null
          html_body: string
          id: string
          is_active: boolean | null
          send_delay_minutes: number | null
          subject: string
          template_key: string
          template_name: string
          text_body: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          category: string
          created_at?: string | null
          html_body: string
          id?: string
          is_active?: boolean | null
          send_delay_minutes?: number | null
          subject: string
          template_key: string
          template_name: string
          text_body?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          category?: string
          created_at?: string | null
          html_body?: string
          id?: string
          is_active?: boolean | null
          send_delay_minutes?: number | null
          subject?: string
          template_key?: string
          template_name?: string
          text_body?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      backup_config: {
        Row: {
          auto_cleanup: boolean | null
          created_at: string | null
          email_notifications: boolean | null
          enabled: boolean | null
          frequency: string | null
          id: string
          include_images: boolean | null
          last_backup_at: string | null
          next_backup_at: string | null
          retention_days: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_cleanup?: boolean | null
          created_at?: string | null
          email_notifications?: boolean | null
          enabled?: boolean | null
          frequency?: string | null
          id?: string
          include_images?: boolean | null
          last_backup_at?: string | null
          next_backup_at?: string | null
          retention_days?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_cleanup?: boolean | null
          created_at?: string | null
          email_notifications?: boolean | null
          enabled?: boolean | null
          frequency?: string | null
          id?: string
          include_images?: boolean | null
          last_backup_at?: string | null
          next_backup_at?: string | null
          retention_days?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_logs: {
        Row: {
          backup_type: string
          completed_at: string | null
          compressed_size_bytes: number | null
          compression_ratio: number | null
          created_at: string | null
          error_message: string | null
          expires_at: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          records_count: Json | null
          retention_days: number | null
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          backup_type: string
          completed_at?: string | null
          compressed_size_bytes?: number | null
          compression_ratio?: number | null
          created_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          records_count?: Json | null
          retention_days?: number | null
          started_at?: string | null
          status: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          backup_type?: string
          completed_at?: string | null
          compressed_size_bytes?: number | null
          compression_ratio?: number | null
          created_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          records_count?: Json | null
          retention_days?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
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
      blog_content_tracking: {
        Row: {
          content_hash: string
          created_at: string | null
          id: string
          post_id: string | null
          title_fingerprint: string
          topic_keywords: string[] | null
        }
        Insert: {
          content_hash: string
          created_at?: string | null
          id?: string
          post_id?: string | null
          title_fingerprint: string
          topic_keywords?: string[] | null
        }
        Update: {
          content_hash?: string
          created_at?: string | null
          id?: string
          post_id?: string | null
          title_fingerprint?: string
          topic_keywords?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_content_tracking_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_generation_history: {
        Row: {
          generated_at: string | null
          id: string
          keywords: string[] | null
          perspective_used: string | null
          prompt: string
          title: string
          tone_used: string | null
        }
        Insert: {
          generated_at?: string | null
          id?: string
          keywords?: string[] | null
          perspective_used?: string | null
          prompt: string
          title: string
          tone_used?: string | null
        }
        Update: {
          generated_at?: string | null
          id?: string
          keywords?: string[] | null
          perspective_used?: string | null
          prompt?: string
          title?: string
          tone_used?: string | null
        }
        Relationships: []
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
      blog_title_bank: {
        Row: {
          created_at: string | null
          id: string
          is_locked: boolean | null
          last_used_at: string | null
          times_used: number | null
          title: string
          variations_generated: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_locked?: boolean | null
          last_used_at?: string | null
          times_used?: number | null
          title: string
          variations_generated?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_locked?: boolean | null
          last_used_at?: string | null
          times_used?: number | null
          title?: string
          variations_generated?: number | null
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
      complementary_subscriptions: {
        Row: {
          created_at: string | null
          end_date: string | null
          granted_by: string
          id: string
          is_permanent: boolean | null
          plan_id: string
          reason: string | null
          start_date: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          granted_by: string
          id?: string
          is_permanent?: boolean | null
          plan_id: string
          reason?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          granted_by?: string
          id?: string
          is_permanent?: boolean | null
          plan_id?: string
          reason?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complementary_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
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
      feature_flag_analytics: {
        Row: {
          flag_key: string
          id: string
          metric_type: string
          metric_value: number
          recorded_at: string | null
        }
        Insert: {
          flag_key: string
          id?: string
          metric_type: string
          metric_value: number
          recorded_at?: string | null
        }
        Update: {
          flag_key?: string
          id?: string
          metric_type?: string
          metric_value?: number
          recorded_at?: string | null
        }
        Relationships: []
      }
      feature_flag_evaluations: {
        Row: {
          enabled: boolean
          evaluated_at: string | null
          evaluation_reason: string | null
          flag_key: string
          id: string
          user_id: string | null
        }
        Insert: {
          enabled: boolean
          evaluated_at?: string | null
          evaluation_reason?: string | null
          flag_key: string
          id?: string
          user_id?: string | null
        }
        Update: {
          enabled?: boolean
          evaluated_at?: string | null
          evaluation_reason?: string | null
          flag_key?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          key: string
          metadata: Json | null
          name: string
          rollout_percentage: number | null
          targeting_rules: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          metadata?: Json | null
          name: string
          rollout_percentage?: number | null
          targeting_rules?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          metadata?: Json | null
          name?: string
          rollout_percentage?: number | null
          targeting_rules?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feature_flags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      food_aisle_mappings: {
        Row: {
          aisle_id: string | null
          created_at: string | null
          food_name: string
          id: string
          store_layout_id: string | null
        }
        Insert: {
          aisle_id?: string | null
          created_at?: string | null
          food_name: string
          id?: string
          store_layout_id?: string | null
        }
        Update: {
          aisle_id?: string | null
          created_at?: string | null
          food_name?: string
          id?: string
          store_layout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_aisle_mappings_aisle_id_fkey"
            columns: ["aisle_id"]
            isOneToOne: false
            referencedRelation: "store_aisles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_aisle_mappings_store_layout_id_fkey"
            columns: ["store_layout_id"]
            isOneToOne: false
            referencedRelation: "store_layouts"
            referencedColumns: ["id"]
          },
        ]
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
          plan_entry_id: string | null
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
          plan_entry_id?: string | null
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
          plan_entry_id?: string | null
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
          {
            foreignKeyName: "food_attempts_plan_entry_id_fkey"
            columns: ["plan_entry_id"]
            isOneToOne: false
            referencedRelation: "plan_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_attempts_plan_entry_id_fkey"
            columns: ["plan_entry_id"]
            isOneToOne: false
            referencedRelation: "unified_meal_tracking"
            referencedColumns: ["plan_entry_id"]
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
          barcode: string | null
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
          barcode?: string | null
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
          barcode?: string | null
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
          added_by_user_id: string | null
          added_via: string | null
          aisle: string | null
          auto_generated: boolean | null
          barcode: string | null
          brand_preference: string | null
          category: string
          checked: boolean
          created_at: string | null
          grocery_list_id: string | null
          household_id: string | null
          id: string
          name: string
          notes: string | null
          photo_url: string | null
          priority: string | null
          quantity: number
          restock_reason: string | null
          source_plan_entry_id: string | null
          source_recipe_id: string | null
          unit: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          added_by_user_id?: string | null
          added_via?: string | null
          aisle?: string | null
          auto_generated?: boolean | null
          barcode?: string | null
          brand_preference?: string | null
          category: string
          checked?: boolean
          created_at?: string | null
          grocery_list_id?: string | null
          household_id?: string | null
          id?: string
          name: string
          notes?: string | null
          photo_url?: string | null
          priority?: string | null
          quantity?: number
          restock_reason?: string | null
          source_plan_entry_id?: string | null
          source_recipe_id?: string | null
          unit?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          added_by_user_id?: string | null
          added_via?: string | null
          aisle?: string | null
          auto_generated?: boolean | null
          barcode?: string | null
          brand_preference?: string | null
          category?: string
          checked?: boolean
          created_at?: string | null
          grocery_list_id?: string | null
          household_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          photo_url?: string | null
          priority?: string | null
          quantity?: number
          restock_reason?: string | null
          source_plan_entry_id?: string | null
          source_recipe_id?: string | null
          unit?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_grocery_list_id_fkey"
            columns: ["grocery_list_id"]
            isOneToOne: false
            referencedRelation: "grocery_lists"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "grocery_items_source_plan_entry_id_fkey"
            columns: ["source_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "unified_meal_tracking"
            referencedColumns: ["plan_entry_id"]
          },
          {
            foreignKeyName: "grocery_items_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "grocery_items_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_lists: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          household_id: string | null
          icon: string | null
          id: string
          is_archived: boolean | null
          is_default: boolean | null
          name: string
          store_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          household_id?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean | null
          is_default?: boolean | null
          name: string
          store_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          household_id?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean | null
          is_default?: boolean | null
          name?: string
          store_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grocery_lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_purchase_history: {
        Row: {
          category: string | null
          created_at: string | null
          household_id: string | null
          id: string
          item_name: string
          price: number | null
          purchased_at: string | null
          quantity: number | null
          store_name: string | null
          unit: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          household_id?: string | null
          id?: string
          item_name: string
          price?: number | null
          purchased_at?: string | null
          quantity?: number | null
          store_name?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          household_id?: string | null
          id?: string
          item_name?: string
          price?: number | null
          purchased_at?: string | null
          quantity?: number | null
          store_name?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grocery_purchase_history_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
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
          allergen_severity: Json | null
          allergens: string[] | null
          always_eats_foods: string[] | null
          behavioral_notes: string | null
          created_at: string | null
          cross_contamination_sensitive: boolean | null
          date_of_birth: string | null
          dietary_restrictions: string[] | null
          dietary_variety_score: number | null
          disliked_foods: string[] | null
          eating_behavior: string | null
          favorite_foods: string[] | null
          flavor_preferences: string[] | null
          gender: string | null
          health_goals: string[] | null
          height_cm: number | null
          helpful_strategies: string[] | null
          household_id: string | null
          id: string
          name: string
          new_food_willingness: string | null
          notes: string | null
          nutrition_concerns: string[] | null
          pickiness_level: string | null
          preferred_preparations: string[] | null
          profile_completed: boolean | null
          profile_last_reviewed: string | null
          profile_picture_url: string | null
          texture_dislikes: string[] | null
          texture_preferences: string[] | null
          texture_sensitivity_level: string | null
          updated_at: string | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          age?: number | null
          allergen_severity?: Json | null
          allergens?: string[] | null
          always_eats_foods?: string[] | null
          behavioral_notes?: string | null
          created_at?: string | null
          cross_contamination_sensitive?: boolean | null
          date_of_birth?: string | null
          dietary_restrictions?: string[] | null
          dietary_variety_score?: number | null
          disliked_foods?: string[] | null
          eating_behavior?: string | null
          favorite_foods?: string[] | null
          flavor_preferences?: string[] | null
          gender?: string | null
          health_goals?: string[] | null
          height_cm?: number | null
          helpful_strategies?: string[] | null
          household_id?: string | null
          id?: string
          name: string
          new_food_willingness?: string | null
          notes?: string | null
          nutrition_concerns?: string[] | null
          pickiness_level?: string | null
          preferred_preparations?: string[] | null
          profile_completed?: boolean | null
          profile_last_reviewed?: string | null
          profile_picture_url?: string | null
          texture_dislikes?: string[] | null
          texture_preferences?: string[] | null
          texture_sensitivity_level?: string | null
          updated_at?: string | null
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          age?: number | null
          allergen_severity?: Json | null
          allergens?: string[] | null
          always_eats_foods?: string[] | null
          behavioral_notes?: string | null
          created_at?: string | null
          cross_contamination_sensitive?: boolean | null
          date_of_birth?: string | null
          dietary_restrictions?: string[] | null
          dietary_variety_score?: number | null
          disliked_foods?: string[] | null
          eating_behavior?: string | null
          favorite_foods?: string[] | null
          flavor_preferences?: string[] | null
          gender?: string | null
          health_goals?: string[] | null
          height_cm?: number | null
          helpful_strategies?: string[] | null
          household_id?: string | null
          id?: string
          name?: string
          new_food_willingness?: string | null
          notes?: string | null
          nutrition_concerns?: string[] | null
          pickiness_level?: string | null
          preferred_preparations?: string[] | null
          profile_completed?: boolean | null
          profile_last_reviewed?: string | null
          profile_picture_url?: string | null
          texture_dislikes?: string[] | null
          texture_preferences?: string[] | null
          texture_sensitivity_level?: string | null
          updated_at?: string | null
          user_id?: string
          weight_kg?: number | null
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
          barcode: string | null
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
          barcode?: string | null
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
          barcode?: string | null
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
          food_attempt_id: string | null
          food_id: string
          household_id: string | null
          id: string
          is_primary_dish: boolean | null
          kid_id: string
          meal_slot: string
          notes: string | null
          recipe_id: string | null
          result: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          food_attempt_id?: string | null
          food_id: string
          household_id?: string | null
          id?: string
          is_primary_dish?: boolean | null
          kid_id: string
          meal_slot: string
          notes?: string | null
          recipe_id?: string | null
          result?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          food_attempt_id?: string | null
          food_id?: string
          household_id?: string | null
          id?: string
          is_primary_dish?: boolean | null
          kid_id?: string
          meal_slot?: string
          notes?: string | null
          recipe_id?: string | null
          result?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entries_food_attempt_id_fkey"
            columns: ["food_attempt_id"]
            isOneToOne: false
            referencedRelation: "food_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_entries_food_attempt_id_fkey"
            columns: ["food_attempt_id"]
            isOneToOne: false
            referencedRelation: "unified_meal_tracking"
            referencedColumns: ["food_attempt_id"]
          },
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
          {
            foreignKeyName: "plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
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
          subscription_tier: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id: string
          onboarding_completed?: boolean | null
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          onboarding_completed?: boolean | null
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promotional_campaigns: {
        Row: {
          affected_plan_ids: string[]
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_duration_type: string
          discount_type: string
          discount_value: number
          end_date: string | null
          id: string
          is_active: boolean | null
          name: string
          start_date: string
          stripe_coupon_id: string | null
          updated_at: string | null
        }
        Insert: {
          affected_plan_ids?: string[]
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_duration_type?: string
          discount_type: string
          discount_value: number
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          start_date: string
          stripe_coupon_id?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_plan_ids?: string[]
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_duration_type?: string
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          start_date?: string
          stripe_coupon_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rate_limit_config: {
        Row: {
          created_at: string | null
          description: string | null
          endpoint: string
          enterprise_tier_limit: number
          free_tier_limit: number
          id: string
          is_active: boolean | null
          premium_tier_limit: number
          updated_at: string | null
          window_minutes: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          endpoint: string
          enterprise_tier_limit?: number
          free_tier_limit?: number
          id?: string
          is_active?: boolean | null
          premium_tier_limit?: number
          updated_at?: string | null
          window_minutes?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          endpoint?: string
          enterprise_tier_limit?: number
          free_tier_limit?: number
          id?: string
          is_active?: boolean | null
          premium_tier_limit?: number
          updated_at?: string | null
          window_minutes?: number
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          request_count: number | null
          updated_at: string | null
          user_id: string | null
          window_start: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          request_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          window_start: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          request_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          window_start?: string
        }
        Relationships: []
      }
      recipe_attempts: {
        Row: {
          amount_eaten: string | null
          attempted_at: string | null
          created_at: string | null
          id: string
          kid_id: string | null
          kid_rating: number | null
          modifications: string | null
          notes: string | null
          photo_urls: string[] | null
          rating: number | null
          recipe_id: string | null
          user_id: string | null
          would_make_again: boolean | null
        }
        Insert: {
          amount_eaten?: string | null
          attempted_at?: string | null
          created_at?: string | null
          id?: string
          kid_id?: string | null
          kid_rating?: number | null
          modifications?: string | null
          notes?: string | null
          photo_urls?: string[] | null
          rating?: number | null
          recipe_id?: string | null
          user_id?: string | null
          would_make_again?: boolean | null
        }
        Update: {
          amount_eaten?: string | null
          attempted_at?: string | null
          created_at?: string | null
          id?: string
          kid_id?: string | null
          kid_rating?: number | null
          modifications?: string | null
          notes?: string | null
          photo_urls?: string[] | null
          rating?: number | null
          recipe_id?: string | null
          user_id?: string | null
          would_make_again?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_attempts_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
          },
          {
            foreignKeyName: "recipe_attempts_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_attempts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_attempts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_collection_items: {
        Row: {
          added_at: string | null
          collection_id: string | null
          id: string
          recipe_id: string | null
        }
        Insert: {
          added_at?: string | null
          collection_id?: string | null
          id?: string
          recipe_id?: string | null
        }
        Update: {
          added_at?: string | null
          collection_id?: string | null
          id?: string
          recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "recipe_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_collection_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_collection_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_collections: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          household_id: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          household_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          household_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_collections_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string | null
          food_id: string | null
          id: string
          ingredient_name: string
          is_optional: boolean | null
          preparation_notes: string | null
          quantity: number | null
          recipe_id: string | null
          section: string | null
          sort_order: number | null
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          ingredient_name: string
          is_optional?: boolean | null
          preparation_notes?: string | null
          quantity?: number | null
          recipe_id?: string | null
          section?: string | null
          sort_order?: number | null
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          ingredient_name?: string
          is_optional?: boolean | null
          preparation_notes?: string | null
          quantity?: number | null
          recipe_id?: string | null
          section?: string | null
          sort_order?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["food_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          photo_url: string
          recipe_id: string | null
          sort_order: number | null
          uploaded_by: string | null
          uploaded_by_user_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          photo_url: string
          recipe_id?: string | null
          sort_order?: number | null
          uploaded_by?: string | null
          uploaded_by_user_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          photo_url?: string
          recipe_id?: string | null
          sort_order?: number | null
          uploaded_by?: string | null
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_photos_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_photos_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          additional_ingredients: string | null
          category: string | null
          cook_time: string | null
          created_at: string | null
          description: string | null
          difficulty_level: string | null
          food_ids: string[]
          household_id: string | null
          id: string
          image_url: string | null
          instructions: string | null
          kid_friendly_score: number | null
          last_made_date: string | null
          name: string
          nutrition_info: Json | null
          prep_time: string | null
          rating: number | null
          servings: string | null
          source_type: string | null
          source_url: string | null
          tags: string[] | null
          times_made: number | null
          tips: string | null
          total_time_minutes: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          additional_ingredients?: string | null
          category?: string | null
          cook_time?: string | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          food_ids?: string[]
          household_id?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          kid_friendly_score?: number | null
          last_made_date?: string | null
          name: string
          nutrition_info?: Json | null
          prep_time?: string | null
          rating?: number | null
          servings?: string | null
          source_type?: string | null
          source_url?: string | null
          tags?: string[] | null
          times_made?: number | null
          tips?: string | null
          total_time_minutes?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          additional_ingredients?: string | null
          category?: string | null
          cook_time?: string | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          food_ids?: string[]
          household_id?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          kid_friendly_score?: number | null
          last_made_date?: string | null
          name?: string
          nutrition_info?: Json | null
          prep_time?: string | null
          rating?: number | null
          servings?: string | null
          source_type?: string | null
          source_url?: string | null
          tags?: string[] | null
          times_made?: number | null
          tips?: string | null
          total_time_minutes?: number | null
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
      referral_codes: {
        Row: {
          clicks: number | null
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          signups: number | null
          successful_referrals: number | null
          user_id: string
        }
        Insert: {
          clicks?: number | null
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          signups?: number | null
          successful_referrals?: number | null
          user_id: string
        }
        Update: {
          clicks?: number | null
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          signups?: number | null
          successful_referrals?: number | null
          user_id?: string
        }
        Relationships: []
      }
      referral_program_config: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          max_rewards_per_user: number | null
          min_referrals_for_reward: number | null
          referred_reward_duration_months: number | null
          referred_reward_type: string
          referred_reward_value: number
          referrer_reward_duration_months: number | null
          referrer_reward_type: string
          referrer_reward_value: number
          tier: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_rewards_per_user?: number | null
          min_referrals_for_reward?: number | null
          referred_reward_duration_months?: number | null
          referred_reward_type?: string
          referred_reward_value?: number
          referrer_reward_duration_months?: number | null
          referrer_reward_type?: string
          referrer_reward_value?: number
          tier?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_rewards_per_user?: number | null
          min_referrals_for_reward?: number | null
          referred_reward_duration_months?: number | null
          referred_reward_type?: string
          referred_reward_value?: number
          referrer_reward_duration_months?: number | null
          referrer_reward_type?: string
          referrer_reward_value?: number
          tier?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          applied_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          notes: string | null
          referral_id: string | null
          reward_duration_months: number | null
          reward_type: string
          reward_value: number
          status: string | null
          updated_at: string | null
          user_id: string
          user_tier: string | null
        }
        Insert: {
          applied_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          referral_id?: string | null
          reward_duration_months?: number | null
          reward_type: string
          reward_value: number
          status?: string | null
          updated_at?: string | null
          user_id: string
          user_tier?: string | null
        }
        Update: {
          applied_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          referral_id?: string | null
          reward_duration_months?: number | null
          reward_type?: string
          reward_value?: number
          status?: string | null
          updated_at?: string | null
          user_id?: string
          user_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          referral_code: string
          referred_user_id: string
          referrer_id: string | null
          rewarded_at: string | null
          status: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_id?: string | null
          rewarded_at?: string | null
          status?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_id?: string | null
          rewarded_at?: string | null
          status?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_sessions: {
        Row: {
          actual_total: number | null
          checked_items: number | null
          created_at: string | null
          ended_at: string | null
          estimated_total: number | null
          grocery_list_id: string | null
          household_id: string | null
          id: string
          is_active: boolean | null
          started_at: string | null
          store_location: string | null
          store_name: string | null
          total_items: number | null
          user_id: string | null
        }
        Insert: {
          actual_total?: number | null
          checked_items?: number | null
          created_at?: string | null
          ended_at?: string | null
          estimated_total?: number | null
          grocery_list_id?: string | null
          household_id?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          store_location?: string | null
          store_name?: string | null
          total_items?: number | null
          user_id?: string | null
        }
        Update: {
          actual_total?: number | null
          checked_items?: number | null
          created_at?: string | null
          ended_at?: string | null
          estimated_total?: number | null
          grocery_list_id?: string | null
          household_id?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          store_location?: string | null
          store_name?: string | null
          total_items?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_sessions_grocery_list_id_fkey"
            columns: ["grocery_list_id"]
            isOneToOne: false
            referencedRelation: "grocery_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_sessions_household_id_fkey"
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
          is_global: boolean | null
          last_posted_at: string | null
          metadata: Json | null
          platform: Database["public"]["Enums"]["social_platform"] | null
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
          is_global?: boolean | null
          last_posted_at?: string | null
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
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
          is_global?: boolean | null
          last_posted_at?: string | null
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
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
          long_form_content: string | null
          metadata: Json | null
          platforms: Database["public"]["Enums"]["social_platform"][]
          published_at: string | null
          scheduled_for: string | null
          short_form_content: string | null
          status: Database["public"]["Enums"]["post_status"]
          title: string | null
          updated_at: string | null
          video_url: string | null
          webhook_url: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          hashtags?: string[] | null
          id?: string
          image_urls?: string[] | null
          link_url?: string | null
          long_form_content?: string | null
          metadata?: Json | null
          platforms: Database["public"]["Enums"]["social_platform"][]
          published_at?: string | null
          scheduled_for?: string | null
          short_form_content?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
          webhook_url?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          hashtags?: string[] | null
          id?: string
          image_urls?: string[] | null
          link_url?: string | null
          long_form_content?: string | null
          metadata?: Json | null
          platforms?: Database["public"]["Enums"]["social_platform"][]
          published_at?: string | null
          scheduled_for?: string | null
          short_form_content?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      store_aisles: {
        Row: {
          aisle_name: string
          aisle_number: string | null
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          sort_order: number
          store_layout_id: string | null
        }
        Insert: {
          aisle_name: string
          aisle_number?: string | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          sort_order: number
          store_layout_id?: string | null
        }
        Update: {
          aisle_name?: string
          aisle_number?: string | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          sort_order?: number
          store_layout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_aisles_store_layout_id_fkey"
            columns: ["store_layout_id"]
            isOneToOne: false
            referencedRelation: "store_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      store_layouts: {
        Row: {
          created_at: string | null
          household_id: string | null
          id: string
          is_default: boolean | null
          store_chain: string | null
          store_location: string | null
          store_name: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          household_id?: string | null
          id?: string
          is_default?: boolean | null
          store_chain?: string | null
          store_location?: string | null
          store_name: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          household_id?: string | null
          id?: string
          is_default?: boolean | null
          store_chain?: string | null
          store_location?: string | null
          store_name?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_layouts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
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
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          context: Json | null
          created_at: string | null
          description: string
          id: string
          priority: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          context?: Json | null
          created_at?: string | null
          description: string
          id?: string
          priority?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          context?: Json | null
          created_at?: string | null
          description?: string
          id?: string
          priority?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_canned_responses: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_canned_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_canned_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachments: Json | null
          author_id: string | null
          created_at: string | null
          id: string
          is_internal: boolean | null
          message: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          message: string
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          message?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_queue"
            referencedColumns: ["id"]
          },
        ]
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
          complementary_subscription_id: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_complementary: boolean | null
          plan_id: string | null
          promotional_campaign_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          complementary_subscription_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_complementary?: boolean | null
          plan_id?: string | null
          promotional_campaign_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          complementary_subscription_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_complementary?: boolean | null
          plan_id?: string | null
          promotional_campaign_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_complementary_subscription_id_fkey"
            columns: ["complementary_subscription_id"]
            isOneToOne: false
            referencedRelation: "complementary_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_promotional_campaign_id_fkey"
            columns: ["promotional_campaign_id"]
            isOneToOne: false
            referencedRelation: "promotional_campaigns"
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
      waitlist: {
        Row: {
          converted_to_user: boolean | null
          email: string
          full_name: string | null
          id: string
          joined_at: string
          metadata: Json | null
          notified_at: string | null
          referral_source: string | null
          status: string
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          converted_to_user?: boolean | null
          email: string
          full_name?: string | null
          id?: string
          joined_at?: string
          metadata?: Json | null
          notified_at?: string | null
          referral_source?: string | null
          status?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          converted_to_user?: boolean | null
          email?: string
          full_name?: string | null
          id?: string
          joined_at?: string
          metadata?: Json | null
          notified_at?: string | null
          referral_source?: string | null
          status?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
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
      admin_activity_feed: {
        Row: {
          activity_data: Json | null
          activity_type: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          metadata: Json | null
          severity: string | null
          user_id: string | null
        }
        Relationships: []
      }
      admin_ai_usage: {
        Row: {
          avg_requests_per_user: number | null
          description: string | null
          endpoint: string | null
          last_request_at: string | null
          peak_requests_per_minute: number | null
          requests_24h: number | null
          requests_7d: number | null
          total_requests: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      admin_content_quality: {
        Row: {
          added_30d: number | null
          added_7d: number | null
          avg_name_length: number | null
          content_type: string | null
          items_with_allergens: number | null
          items_with_quantity: number | null
          total_items: number | null
        }
        Relationships: []
      }
      admin_daily_activity: {
        Row: {
          achievements_earned: number | null
          active_users: number | null
          date: string | null
          food_attempts_created: number | null
          foods_added: number | null
          meals_logged: number | null
          plan_entries_created: number | null
          recipes_created: number | null
          successful_attempts: number | null
        }
        Relationships: []
      }
      admin_error_tracking: {
        Row: {
          error_count: number | null
          error_type: string | null
          last_occurrence: string | null
          recent_errors: Json | null
        }
        Relationships: []
      }
      admin_feature_adoption: {
        Row: {
          adoption_rate_pct: number | null
          feature: string | null
          last_used: string | null
          total_usage_count: number | null
          users_using: number | null
        }
        Relationships: []
      }
      admin_platform_health: {
        Row: {
          achievements_7d: number | null
          active_users_30d: number | null
          active_users_7d: number | null
          failed_backups_24h: number | null
          failed_emails_24h: number | null
          new_users_30d: number | null
          new_users_7d: number | null
          rate_limit_hits_1h: number | null
          snapshot_at: string | null
          successful_attempts_7d: number | null
          total_food_attempts: number | null
          total_foods: number | null
          total_kids: number | null
          total_plan_entries: number | null
          total_recipes: number | null
          total_users: number | null
        }
        Relationships: []
      }
      admin_system_health_summary: {
        Row: {
          metric_type: string | null
          metric_unit: string | null
          metric_value: number | null
          recorded_at: string | null
          rn: number | null
        }
        Relationships: []
      }
      admin_unread_alerts: {
        Row: {
          alert_data: Json | null
          alert_type: string | null
          created_at: string | null
          id: string | null
          message: string | null
          severity: string | null
          title: string | null
        }
        Insert: {
          alert_data?: Json | null
          alert_type?: string | null
          created_at?: string | null
          id?: string | null
          message?: string | null
          severity?: string | null
          title?: string | null
        }
        Update: {
          alert_data?: Json | null
          alert_type?: string | null
          created_at?: string | null
          id?: string | null
          message?: string | null
          severity?: string | null
          title?: string | null
        }
        Relationships: []
      }
      admin_user_engagement: {
        Row: {
          engagement_score: number | null
          foods_count: number | null
          full_name: string | null
          joined_at: string | null
          kids_count: number | null
          last_attempt_date: string | null
          last_plan_date: string | null
          recipes_count: number | null
          total_food_attempts: number | null
          total_plan_entries: number | null
          user_id: string | null
          user_tier: string | null
        }
        Insert: {
          engagement_score?: never
          foods_count?: never
          full_name?: string | null
          joined_at?: string | null
          kids_count?: never
          last_attempt_date?: never
          last_plan_date?: never
          recipes_count?: never
          total_food_attempts?: never
          total_plan_entries?: never
          user_id?: string | null
          user_tier?: never
        }
        Update: {
          engagement_score?: never
          foods_count?: never
          full_name?: string | null
          joined_at?: string | null
          kids_count?: never
          last_attempt_date?: never
          last_plan_date?: never
          recipes_count?: never
          total_food_attempts?: never
          total_plan_entries?: never
          user_id?: string | null
          user_tier?: never
        }
        Relationships: []
      }
      admin_user_retention: {
        Row: {
          cohort_month: string | null
          cohort_size: number | null
          month_0: number | null
          month_1: number | null
          month_2: number | null
          month_3: number | null
          retention_month_1_pct: number | null
          retention_month_2_pct: number | null
          retention_month_3_pct: number | null
        }
        Relationships: []
      }
      ai_cost_by_endpoint: {
        Row: {
          avg_cost_per_request_cents: number | null
          avg_duration_ms: number | null
          avg_tokens_per_request: number | null
          endpoint: string | null
          total_cost_cents: number | null
          total_cost_dollars: number | null
          total_requests: number | null
          total_tokens: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      ai_cost_by_model: {
        Row: {
          avg_cost_per_request_cents: number | null
          avg_duration_ms: number | null
          model: string | null
          total_completion_tokens: number | null
          total_cost_cents: number | null
          total_cost_dollars: number | null
          total_prompt_tokens: number | null
          total_requests: number | null
          total_tokens: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      ai_cost_by_user: {
        Row: {
          current_month_cost_cents: number | null
          full_name: string | null
          last_request_at: string | null
          monthly_budget_cents: number | null
          total_cost_cents: number | null
          total_cost_dollars: number | null
          total_requests: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Relationships: []
      }
      ai_cost_daily_summary: {
        Row: {
          avg_cost_per_request_cents: number | null
          avg_duration_ms: number | null
          date: string | null
          error_count: number | null
          total_cost_cents: number | null
          total_cost_dollars: number | null
          total_requests: number | null
          total_tokens: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      automation_email_statistics: {
        Row: {
          category: string | null
          click_rate: number | null
          clicked_count: number | null
          failed: number | null
          open_rate: number | null
          opened_count: number | null
          pending: number | null
          successful: number | null
          template_key: string | null
          template_name: string | null
          total_sent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_email_queue_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "automation_email_templates"
            referencedColumns: ["template_key"]
          },
        ]
      }
      backup_statistics: {
        Row: {
          avg_compression_ratio: number | null
          avg_duration_seconds: number | null
          failed_backups: number | null
          last_successful_backup: string | null
          successful_backups: number | null
          total_backups: number | null
          total_size_bytes: number | null
          user_id: string | null
        }
        Relationships: []
      }
      feature_flag_summary: {
        Row: {
          adoption_rate_7d: number | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          enabled_count_7d: number | null
          id: string | null
          key: string | null
          name: string | null
          rollout_percentage: number | null
          updated_at: string | null
          users_last_7d: number | null
        }
        Relationships: []
      }
      grocery_list_with_context: {
        Row: {
          aisle: string | null
          auto_generated: boolean | null
          category: string | null
          checked: boolean | null
          created_at: string | null
          current_pantry_quantity: number | null
          household_id: string | null
          id: string | null
          name: string | null
          priority: string | null
          quantity: number | null
          restock_reason: string | null
          sort_priority: number | null
          source_plan_entry_id: string | null
          unit: string | null
          updated_at: string | null
          user_id: string | null
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
          {
            foreignKeyName: "grocery_items_source_plan_entry_id_fkey"
            columns: ["source_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "unified_meal_tracking"
            referencedColumns: ["plan_entry_id"]
          },
        ]
      }
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
      rate_limit_analytics: {
        Row: {
          avg_requests_per_user: number | null
          endpoint: string | null
          hour: string | null
          max_requests_by_user: number | null
          total_requests: number | null
          unique_users: number | null
          users_hitting_limit: number | null
        }
        Relationships: []
      }
      recipe_success_stats: {
        Row: {
          acceptance_rate: number | null
          foods_accepted: number | null
          foods_eaten: number | null
          last_scheduled: string | null
          recipe_id: string | null
          recipe_name: string | null
          times_scheduled: number | null
          total_food_entries: number | null
        }
        Relationships: []
      }
      ticket_queue: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          category: string | null
          context: Json | null
          created_at: string | null
          description: string | null
          email: string | null
          full_name: string | null
          id: string | null
          last_message_at: string | null
          message_count: number | null
          priority: string | null
          resolved_at: string | null
          status: string | null
          subject: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_user_engagement"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_meal_tracking: {
        Row: {
          amount_consumed: string | null
          attempted_at: string | null
          bites_taken: number | null
          combined_result: string | null
          created_at: string | null
          date: string | null
          detailed_notes: string | null
          food_attempt_id: string | null
          food_category: string | null
          food_id: string | null
          food_name: string | null
          has_detailed_tracking: boolean | null
          is_milestone: boolean | null
          is_primary_dish: boolean | null
          kid_id: string | null
          meal_slot: string | null
          mood_after: string | null
          mood_before: string | null
          outcome: string | null
          plan_entry_id: string | null
          quick_notes: string | null
          quick_result: string | null
          reaction_notes: string | null
          recipe_id: string | null
          recipe_name: string | null
          stage: string | null
          strategies_used: string[] | null
          updated_at: string | null
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
          {
            foreignKeyName: "plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_add_restock_items: {
        Args: { p_kid_id?: string; p_user_id: string }
        Returns: number
      }
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
      check_ai_budget: {
        Args: { p_budget_type?: string; p_user_id: string }
        Returns: {
          alert_level: string
          budget_limit_cents: number
          current_spend_cents: number
          percentage_used: number
          within_budget: boolean
        }[]
      }
      check_and_unlock_achievements: {
        Args: {
          p_attempt_outcome?: string
          p_food_id?: string
          p_kid_id: string
        }
        Returns: undefined
      }
      check_content_similarity: {
        Args: { new_content_hash: string }
        Returns: {
          is_duplicate: boolean
          post_id: string
          post_title: string
        }[]
      }
      check_email_subscription: {
        Args: { p_email_type: string; p_user_id: string }
        Returns: boolean
      }
      check_feature_limit: {
        Args: {
          p_current_count?: number
          p_feature_type: string
          p_user_id: string
        }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_max_requests: number
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          limit_exceeded: boolean
          reset_at: string
        }[]
      }
      check_rate_limit_with_tier: {
        Args: { p_endpoint: string; p_user_id: string }
        Returns: {
          allowed: boolean
          current_count: number
          max_requests: number
          reset_at: string
          tier: string
        }[]
      }
      check_title_similarity: {
        Args: { new_title: string; threshold?: number }
        Returns: {
          similar_post_id: string
          similar_title: string
          similarity_score: number
        }[]
      }
      cleanup_expired_backups: {
        Args: Record<PropertyKey, never>
        Returns: {
          deleted_count: number
          freed_bytes: number
        }[]
      }
      cleanup_old_activity_logs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_rate_limits: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      create_admin_alert: {
        Args: {
          p_alert_data?: Json
          p_alert_type: string
          p_message: string
          p_severity: string
          p_title: string
        }
        Returns: string
      }
      create_admin_notification: {
        Args: {
          p_message: string
          p_metadata?: Json
          p_severity: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      deduct_food_quantity: {
        Args: { _amount?: number; _food_id: string }
        Returns: undefined
      }
      detect_error_spike: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      detect_restock_needs: {
        Args: { p_kid_id?: string; p_user_id: string }
        Returns: {
          aisle: string
          category: string
          current_quantity: number
          food_id: string
          food_name: string
          priority: string
          reason: string
          recommended_quantity: number
        }[]
      }
      evaluate_feature_flag: {
        Args: { p_flag_key: string; p_user_id: string }
        Returns: boolean
      }
      extract_keywords: {
        Args: { text_content: string }
        Returns: string[]
      }
      extract_user_backup_data: {
        Args: { p_user_id: string }
        Returns: Json
      }
      generate_content_hash: {
        Args: { content_text: string }
        Returns: string
      }
      generate_referral_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_active_campaign_for_plan: {
        Args: { p_plan_id: string }
        Returns: {
          campaign_id: string
          discount_duration_type: string
          discount_type: string
          discount_value: number
        }[]
      }
      get_activity_summary: {
        Args: { p_time_window?: unknown }
        Returns: {
          activity_type: string
          count: number
          severity: string
        }[]
      }
      get_blog_generation_insights: {
        Args: Record<PropertyKey, never>
        Returns: {
          most_used_count: number
          most_used_title: string
          recent_topics: string[]
          recommended_next_topics: string[]
          total_titles: number
          unused_titles: number
        }[]
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
      get_diverse_title_suggestions: {
        Args: { count?: number }
        Returns: {
          last_used_days_ago: number
          times_used: number
          title: string
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
      get_flag_adoption_stats: {
        Args: { p_days?: number; p_flag_key: string }
        Returns: {
          adoption_rate: number
          enabled_count: number
          total_evaluations: number
          unique_users: number
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
      get_next_blog_title: {
        Args: Record<PropertyKey, never>
        Returns: {
          times_used: number
          title: string
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
      get_user_feature_flags: {
        Args: { p_user_id: string }
        Returns: {
          enabled: boolean
          flag_key: string
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
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
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
      log_admin_activity: {
        Args: {
          p_activity_data?: Json
          p_activity_type: string
          p_metadata?: Json
          p_severity?: string
          p_user_id: string
        }
        Returns: string
      }
      log_ai_usage: {
        Args: {
          p_completion_tokens: number
          p_endpoint: string
          p_error_message?: string
          p_model: string
          p_prompt_tokens: number
          p_request_duration_ms?: number
          p_request_metadata?: Json
          p_response_metadata?: Json
          p_status?: string
          p_user_id: string
        }
        Returns: string
      }
      normalize_title: {
        Args: { title_text: string }
        Returns: string
      }
      populate_title_bank: {
        Args: { titles_json: Json }
        Returns: number
      }
      queue_email: {
        Args: {
          p_delay_minutes?: number
          p_priority?: number
          p_template_key: string
          p_template_variables?: Json
          p_to_email: string
          p_user_id: string
        }
        Returns: string
      }
      schedule_next_backup: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      schedule_post_to_queue: {
        Args: {
          _platforms: Database["public"]["Enums"]["social_platform"][]
          _post_id: string
        }
        Returns: undefined
      }
      schedule_recipe_to_plan: {
        Args: {
          p_date: string
          p_kid_id: string
          p_meal_slot: string
          p_recipe_id: string
        }
        Returns: number
      }
      schedule_weekly_summaries: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      scheduled_auto_restock: {
        Args: Record<PropertyKey, never>
        Returns: {
          items_added: number
          user_id: string
        }[]
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
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
        | "webhook"
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
        "webhook",
      ],
    },
  },
} as const
