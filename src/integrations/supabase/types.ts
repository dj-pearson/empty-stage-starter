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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alert_preferences_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alert_preferences_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
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
      analytics_insights: {
        Row: {
          action_notes: string | null
          action_taken: boolean | null
          affected_pages: string[] | null
          affected_queries: string[] | null
          category: string | null
          connection_id: string | null
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          description: string | null
          detected_at: string | null
          id: string
          insight_type: string
          is_dismissed: boolean | null
          is_read: boolean | null
          metric_change: number | null
          metric_name: string | null
          metric_value: number | null
          recommended_action: string | null
          severity: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          action_notes?: string | null
          action_taken?: boolean | null
          affected_pages?: string[] | null
          affected_queries?: string[] | null
          category?: string | null
          connection_id?: string | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          description?: string | null
          detected_at?: string | null
          id?: string
          insight_type: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          metric_change?: number | null
          metric_name?: string | null
          metric_value?: number | null
          recommended_action?: string | null
          severity?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          action_notes?: string | null
          action_taken?: boolean | null
          affected_pages?: string[] | null
          affected_queries?: string[] | null
          category?: string | null
          connection_id?: string | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          description?: string | null
          detected_at?: string | null
          id?: string
          insight_type?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          metric_change?: number | null
          metric_name?: string | null
          metric_value?: number | null
          recommended_action?: string | null
          severity?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_insights_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_platform_connections: {
        Row: {
          access_token: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          metadata: Json | null
          platform: string
          platform_account_id: string | null
          platform_account_name: string | null
          refresh_token: string | null
          scope: string[] | null
          sync_error: string | null
          sync_status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          metadata?: Json | null
          platform: string
          platform_account_id?: string | null
          platform_account_name?: string | null
          refresh_token?: string | null
          scope?: string[] | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          metadata?: Json | null
          platform?: string
          platform_account_id?: string | null
          platform_account_name?: string | null
          refresh_token?: string | null
          scope?: string[] | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
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
      blog_ab_tests: {
        Row: {
          confidence_level: number | null
          ended_at: string | null
          id: string
          post_id: string | null
          started_at: string | null
          variant_a: string
          variant_a_clicks: number | null
          variant_a_conversions: number | null
          variant_a_time_on_page: number | null
          variant_a_views: number | null
          variant_b: string
          variant_b_clicks: number | null
          variant_b_conversions: number | null
          variant_b_time_on_page: number | null
          variant_b_views: number | null
          variant_type: string
          winner: string | null
        }
        Insert: {
          confidence_level?: number | null
          ended_at?: string | null
          id?: string
          post_id?: string | null
          started_at?: string | null
          variant_a: string
          variant_a_clicks?: number | null
          variant_a_conversions?: number | null
          variant_a_time_on_page?: number | null
          variant_a_views?: number | null
          variant_b: string
          variant_b_clicks?: number | null
          variant_b_conversions?: number | null
          variant_b_time_on_page?: number | null
          variant_b_views?: number | null
          variant_type: string
          winner?: string | null
        }
        Update: {
          confidence_level?: number | null
          ended_at?: string | null
          id?: string
          post_id?: string | null
          started_at?: string | null
          variant_a?: string
          variant_a_clicks?: number | null
          variant_a_conversions?: number | null
          variant_a_time_on_page?: number | null
          variant_a_views?: number | null
          variant_b?: string
          variant_b_clicks?: number | null
          variant_b_conversions?: number | null
          variant_b_time_on_page?: number | null
          variant_b_views?: number | null
          variant_type?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_ab_tests_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_ab_tests_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_analytics: {
        Row: {
          avg_time_on_page: number | null
          bounce_rate: number | null
          conversions: number | null
          cta_clicks: number | null
          date: string
          direct_traffic: number | null
          id: string
          organic_traffic: number | null
          pageviews: number | null
          post_id: string | null
          referral_traffic: number | null
          scroll_depth_avg: number | null
          social_traffic: number | null
          unique_visitors: number | null
        }
        Insert: {
          avg_time_on_page?: number | null
          bounce_rate?: number | null
          conversions?: number | null
          cta_clicks?: number | null
          date: string
          direct_traffic?: number | null
          id?: string
          organic_traffic?: number | null
          pageviews?: number | null
          post_id?: string | null
          referral_traffic?: number | null
          scroll_depth_avg?: number | null
          social_traffic?: number | null
          unique_visitors?: number | null
        }
        Update: {
          avg_time_on_page?: number | null
          bounce_rate?: number | null
          conversions?: number | null
          cta_clicks?: number | null
          date?: string
          direct_traffic?: number | null
          id?: string
          organic_traffic?: number | null
          pageviews?: number | null
          post_id?: string | null
          referral_traffic?: number | null
          scroll_depth_avg?: number | null
          social_traffic?: number | null
          unique_visitors?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_analytics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_analytics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_authors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string
          expertise: string[] | null
          id: string
          is_guest: boolean | null
          post_count: number | null
          social_links: Json | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name: string
          expertise?: string[] | null
          id?: string
          is_guest?: boolean | null
          post_count?: number | null
          social_links?: Json | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string
          expertise?: string[] | null
          id?: string
          is_guest?: boolean | null
          post_count?: number | null
          social_links?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      blog_backlinks: {
        Row: {
          anchor_text: string | null
          discovered_at: string | null
          domain_authority: number | null
          id: string
          is_active: boolean | null
          last_checked_at: string | null
          link_type: string | null
          post_id: string | null
          source_domain: string
          source_url: string
        }
        Insert: {
          anchor_text?: string | null
          discovered_at?: string | null
          domain_authority?: number | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          link_type?: string | null
          post_id?: string | null
          source_domain: string
          source_url: string
        }
        Update: {
          anchor_text?: string | null
          discovered_at?: string | null
          domain_authority?: number | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          link_type?: string | null
          post_id?: string | null
          source_domain?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_backlinks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_backlinks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
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
      blog_comment_votes: {
        Row: {
          comment_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
          vote_type: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
          vote_type?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
          vote_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "blog_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_comments: {
        Row: {
          author_email: string
          author_name: string
          content: string
          created_at: string | null
          downvotes: number | null
          id: string
          parent_comment_id: string | null
          post_id: string | null
          status: string | null
          upvotes: number | null
          user_id: string | null
        }
        Insert: {
          author_email: string
          author_name: string
          content: string
          created_at?: string | null
          downvotes?: number | null
          id?: string
          parent_comment_id?: string | null
          post_id?: string | null
          status?: string | null
          upvotes?: number | null
          user_id?: string | null
        }
        Update: {
          author_email?: string
          author_name?: string
          content?: string
          created_at?: string | null
          downvotes?: number | null
          id?: string
          parent_comment_id?: string | null
          post_id?: string | null
          status?: string | null
          upvotes?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "blog_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_competitor_content: {
        Row: {
          competitor_domain: string
          competitor_post_url: string
          estimated_traffic: number | null
          id: string
          notes: string | null
          our_competing_post_id: string | null
          published_date: string | null
          target_keywords: string[] | null
          title: string | null
          tracked_at: string | null
          word_count: number | null
        }
        Insert: {
          competitor_domain: string
          competitor_post_url: string
          estimated_traffic?: number | null
          id?: string
          notes?: string | null
          our_competing_post_id?: string | null
          published_date?: string | null
          target_keywords?: string[] | null
          title?: string | null
          tracked_at?: string | null
          word_count?: number | null
        }
        Update: {
          competitor_domain?: string
          competitor_post_url?: string
          estimated_traffic?: number | null
          id?: string
          notes?: string | null
          our_competing_post_id?: string | null
          published_date?: string | null
          target_keywords?: string[] | null
          title?: string | null
          tracked_at?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_competitor_content_our_competing_post_id_fkey"
            columns: ["our_competing_post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_competitor_content_our_competing_post_id_fkey"
            columns: ["our_competing_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_content_calendar: {
        Row: {
          assigned_to: string | null
          content_pillar: string | null
          created_at: string | null
          id: string
          notes: string | null
          planned_publish_date: string
          priority: number | null
          status: string | null
          target_keywords: string[] | null
          target_search_volume: number | null
          title_suggestion: string | null
          topic_cluster_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          content_pillar?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          planned_publish_date: string
          priority?: number | null
          status?: string | null
          target_keywords?: string[] | null
          target_search_volume?: number | null
          title_suggestion?: string | null
          topic_cluster_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          content_pillar?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          planned_publish_date?: string
          priority?: number | null
          status?: string | null
          target_keywords?: string[] | null
          target_search_volume?: number | null
          title_suggestion?: string | null
          topic_cluster_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_topic_cluster"
            columns: ["topic_cluster_id"]
            isOneToOne: false
            referencedRelation: "blog_topic_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_content_formats: {
        Row: {
          content: string
          created_at: string | null
          format_type: string
          generated_by: string | null
          id: string
          metadata: Json | null
          post_id: string | null
          status: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          format_type: string
          generated_by?: string | null
          id?: string
          metadata?: Json | null
          post_id?: string | null
          status?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          format_type?: string
          generated_by?: string | null
          id?: string
          metadata?: Json | null
          post_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_content_formats_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_content_formats_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_content_gaps: {
        Row: {
          assigned_to: string | null
          competitor_urls: string[] | null
          created_at: string | null
          current_ranking_position: number | null
          id: string
          keyword: string
          keyword_difficulty: number | null
          opportunity_score: number | null
          priority: string | null
          search_volume: number | null
          status: string | null
        }
        Insert: {
          assigned_to?: string | null
          competitor_urls?: string[] | null
          created_at?: string | null
          current_ranking_position?: number | null
          id?: string
          keyword: string
          keyword_difficulty?: number | null
          opportunity_score?: number | null
          priority?: string | null
          search_volume?: number | null
          status?: string | null
        }
        Update: {
          assigned_to?: string | null
          competitor_urls?: string[] | null
          created_at?: string | null
          current_ranking_position?: number | null
          id?: string
          keyword?: string
          keyword_difficulty?: number | null
          opportunity_score?: number | null
          priority?: string | null
          search_volume?: number | null
          status?: string | null
        }
        Relationships: []
      }
      blog_content_gating: {
        Row: {
          created_at: string | null
          gate_after_percentage: number | null
          gate_message: string
          gate_title: string
          id: string
          is_active: boolean | null
          post_id: string | null
          unlock_count: number | null
        }
        Insert: {
          created_at?: string | null
          gate_after_percentage?: number | null
          gate_message: string
          gate_title: string
          id?: string
          is_active?: boolean | null
          post_id?: string | null
          unlock_count?: number | null
        }
        Update: {
          created_at?: string | null
          gate_after_percentage?: number | null
          gate_message?: string
          gate_title?: string
          id?: string
          is_active?: boolean | null
          post_id?: string | null
          unlock_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_content_gating_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_content_gating_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_content_quality_scores: {
        Row: {
          analyzed_at: string | null
          comprehensiveness_score: number | null
          engagement_score: number | null
          id: string
          issues: Json | null
          overall_score: number | null
          post_id: string | null
          readability_score: number | null
          seo_score: number | null
          suggestions: Json | null
          uniqueness_score: number | null
        }
        Insert: {
          analyzed_at?: string | null
          comprehensiveness_score?: number | null
          engagement_score?: number | null
          id?: string
          issues?: Json | null
          overall_score?: number | null
          post_id?: string | null
          readability_score?: number | null
          seo_score?: number | null
          suggestions?: Json | null
          uniqueness_score?: number | null
        }
        Update: {
          analyzed_at?: string | null
          comprehensiveness_score?: number | null
          engagement_score?: number | null
          id?: string
          issues?: Json | null
          overall_score?: number | null
          post_id?: string | null
          readability_score?: number | null
          seo_score?: number | null
          suggestions?: Json | null
          uniqueness_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_content_quality_scores_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_content_quality_scores_post_id_fkey"
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
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_content_tracking_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_conversions: {
        Row: {
          conversion_type: string
          conversion_value: number | null
          converted_at: string | null
          id: string
          post_id: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          conversion_type: string
          conversion_value?: number | null
          converted_at?: string | null
          id?: string
          post_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          conversion_type?: string
          conversion_value?: number | null
          converted_at?: string | null
          id?: string
          post_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_conversions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_conversions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_core_web_vitals: {
        Row: {
          cls_avg: number | null
          date: string
          fcp_avg: number | null
          fid_avg: number | null
          id: string
          lcp_avg: number | null
          post_id: string | null
          sample_size: number | null
          ttfb_avg: number | null
        }
        Insert: {
          cls_avg?: number | null
          date: string
          fcp_avg?: number | null
          fid_avg?: number | null
          id?: string
          lcp_avg?: number | null
          post_id?: string | null
          sample_size?: number | null
          ttfb_avg?: number | null
        }
        Update: {
          cls_avg?: number | null
          date?: string
          fcp_avg?: number | null
          fid_avg?: number | null
          id?: string
          lcp_avg?: number | null
          post_id?: string | null
          sample_size?: number | null
          ttfb_avg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_core_web_vitals_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_core_web_vitals_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_distribution_channels: {
        Row: {
          auto_published: boolean | null
          id: string
          metrics: Json | null
          platform: string
          platform_post_id: string | null
          platform_url: string | null
          post_id: string | null
          published_at: string | null
          status: string | null
        }
        Insert: {
          auto_published?: boolean | null
          id?: string
          metrics?: Json | null
          platform: string
          platform_post_id?: string | null
          platform_url?: string | null
          post_id?: string | null
          published_at?: string | null
          status?: string | null
        }
        Update: {
          auto_published?: boolean | null
          id?: string
          metrics?: Json | null
          platform?: string
          platform_post_id?: string | null
          platform_url?: string | null
          post_id?: string | null
          published_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_distribution_channels_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_distribution_channels_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_email_captures: {
        Row: {
          captured_at: string | null
          converted_to_user: boolean | null
          email: string
          id: string
          lead_magnet_id: string | null
          name: string | null
          post_id: string | null
          source: string | null
        }
        Insert: {
          captured_at?: string | null
          converted_to_user?: boolean | null
          email: string
          id?: string
          lead_magnet_id?: string | null
          name?: string | null
          post_id?: string | null
          source?: string | null
        }
        Update: {
          captured_at?: string | null
          converted_to_user?: boolean | null
          email?: string
          id?: string
          lead_magnet_id?: string | null
          name?: string | null
          post_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_email_captures_lead_magnet_id_fkey"
            columns: ["lead_magnet_id"]
            isOneToOne: false
            referencedRelation: "blog_lead_magnets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_email_captures_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_email_captures_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_engagement_events: {
        Row: {
          event_timestamp: string | null
          event_type: string
          id: string
          post_id: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          event_timestamp?: string | null
          event_type: string
          id?: string
          post_id?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          event_timestamp?: string | null
          event_type?: string
          id?: string
          post_id?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_engagement_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_engagement_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_exit_intent_popups: {
        Row: {
          conversion_rate: number | null
          created_at: string | null
          cta_text: string | null
          id: string
          is_active: boolean | null
          message: string
          offer_text: string | null
          show_delay_seconds: number | null
          target_categories: string[] | null
          target_posts: string[] | null
          title: string
        }
        Insert: {
          conversion_rate?: number | null
          created_at?: string | null
          cta_text?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          offer_text?: string | null
          show_delay_seconds?: number | null
          target_categories?: string[] | null
          target_posts?: string[] | null
          title: string
        }
        Update: {
          conversion_rate?: number | null
          created_at?: string | null
          cta_text?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          offer_text?: string | null
          show_delay_seconds?: number | null
          target_categories?: string[] | null
          target_posts?: string[] | null
          title?: string
        }
        Relationships: []
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
      blog_guest_submissions: {
        Row: {
          author_bio: string | null
          author_social_links: Json | null
          content: string
          excerpt: string | null
          id: string
          published_post_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          submitted_at: string | null
          submitted_by_email: string
          submitted_by_name: string
          title: string
        }
        Insert: {
          author_bio?: string | null
          author_social_links?: Json | null
          content: string
          excerpt?: string | null
          id?: string
          published_post_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by_email: string
          submitted_by_name: string
          title: string
        }
        Update: {
          author_bio?: string | null
          author_social_links?: Json | null
          content?: string
          excerpt?: string | null
          id?: string
          published_post_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by_email?: string
          submitted_by_name?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_guest_submissions_published_post_id_fkey"
            columns: ["published_post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_guest_submissions_published_post_id_fkey"
            columns: ["published_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_internal_links: {
        Row: {
          anchor_text: string
          click_count: number | null
          created_at: string | null
          id: string
          is_automatic: boolean | null
          link_position: string | null
          source_post_id: string | null
          target_post_id: string | null
        }
        Insert: {
          anchor_text: string
          click_count?: number | null
          created_at?: string | null
          id?: string
          is_automatic?: boolean | null
          link_position?: string | null
          source_post_id?: string | null
          target_post_id?: string | null
        }
        Update: {
          anchor_text?: string
          click_count?: number | null
          created_at?: string | null
          id?: string
          is_automatic?: boolean | null
          link_position?: string | null
          source_post_id?: string | null
          target_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_internal_links_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_internal_links_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_internal_links_target_post_id_fkey"
            columns: ["target_post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_internal_links_target_post_id_fkey"
            columns: ["target_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_lead_magnets: {
        Row: {
          conversion_rate: number | null
          created_at: string | null
          downloads_count: number | null
          file_url: string | null
          id: string
          is_active: boolean | null
          magnet_description: string | null
          magnet_title: string
          magnet_type: string
          post_id: string | null
        }
        Insert: {
          conversion_rate?: number | null
          created_at?: string | null
          downloads_count?: number | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          magnet_description?: string | null
          magnet_title: string
          magnet_type: string
          post_id?: string | null
        }
        Update: {
          conversion_rate?: number | null
          created_at?: string | null
          downloads_count?: number | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          magnet_description?: string | null
          magnet_title?: string
          magnet_type?: string
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_lead_magnets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_lead_magnets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_media_library: {
        Row: {
          alt_text: string | null
          caption: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          height: number | null
          id: string
          is_optimized: boolean | null
          optimized_variants: Json | null
          tags: string[] | null
          uploaded_at: string | null
          uploaded_by: string | null
          used_in_posts: string[] | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          height?: number | null
          id?: string
          is_optimized?: boolean | null
          optimized_variants?: Json | null
          tags?: string[] | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          used_in_posts?: string[] | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          height?: number | null
          id?: string
          is_optimized?: boolean | null
          optimized_variants?: Json | null
          tags?: string[] | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          used_in_posts?: string[] | null
          width?: number | null
        }
        Relationships: []
      }
      blog_newsletter_campaigns: {
        Row: {
          campaign_name: string
          campaign_type: string | null
          click_count: number | null
          content_html: string
          created_at: string | null
          featured_posts: string[] | null
          id: string
          open_count: number | null
          preview_text: string | null
          scheduled_for: string | null
          sent_at: string | null
          sent_count: number | null
          status: string | null
          subject_line: string
          unsubscribe_count: number | null
        }
        Insert: {
          campaign_name: string
          campaign_type?: string | null
          click_count?: number | null
          content_html: string
          created_at?: string | null
          featured_posts?: string[] | null
          id?: string
          open_count?: number | null
          preview_text?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
          subject_line: string
          unsubscribe_count?: number | null
        }
        Update: {
          campaign_name?: string
          campaign_type?: string | null
          click_count?: number | null
          content_html?: string
          created_at?: string | null
          featured_posts?: string[] | null
          id?: string
          open_count?: number | null
          preview_text?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
          subject_line?: string
          unsubscribe_count?: number | null
        }
        Relationships: []
      }
      blog_newsletter_subscribers: {
        Row: {
          email: string
          id: string
          is_active: boolean | null
          name: string | null
          preferences: Json | null
          source: string | null
          subscribed_at: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          id?: string
          is_active?: boolean | null
          name?: string | null
          preferences?: Json | null
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string | null
          preferences?: Json | null
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
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
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
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
      blog_post_versions: {
        Row: {
          change_summary: string | null
          content: string
          created_at: string | null
          excerpt: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          post_id: string | null
          saved_by: string | null
          title: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          content: string
          created_at?: string | null
          excerpt?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          post_id?: string | null
          saved_by?: string | null
          title: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          content?: string
          created_at?: string | null
          excerpt?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          post_id?: string | null
          saved_by?: string | null
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_versions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_versions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_generated: boolean | null
          ai_prompt: string | null
          author_bio_id: string | null
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
          author_bio_id?: string | null
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
          author_bio_id?: string | null
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
            foreignKeyName: "blog_posts_author_bio_id_fkey"
            columns: ["author_bio_id"]
            isOneToOne: false
            referencedRelation: "blog_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_refresh_tracking: {
        Row: {
          content_diff: Json | null
          id: string
          last_refreshed_at: string | null
          performance_after: Json | null
          performance_before: Json | null
          post_id: string | null
          refresh_reason: string | null
          refreshed_by: string | null
        }
        Insert: {
          content_diff?: Json | null
          id?: string
          last_refreshed_at?: string | null
          performance_after?: Json | null
          performance_before?: Json | null
          post_id?: string | null
          refresh_reason?: string | null
          refreshed_by?: string | null
        }
        Update: {
          content_diff?: Json | null
          id?: string
          last_refreshed_at?: string | null
          performance_after?: Json | null
          performance_before?: Json | null
          post_id?: string | null
          refresh_reason?: string | null
          refreshed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_refresh_tracking_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_refresh_tracking_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_related_posts_cache: {
        Row: {
          calculated_at: string | null
          post_id: string
          related_post_ids: string[]
          relevance_scores: number[] | null
        }
        Insert: {
          calculated_at?: string | null
          post_id: string
          related_post_ids: string[]
          relevance_scores?: number[] | null
        }
        Update: {
          calculated_at?: string | null
          post_id?: string
          related_post_ids?: string[]
          relevance_scores?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_related_posts_cache_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_related_posts_cache_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_repurposed_content: {
        Row: {
          auto_generated: boolean | null
          content: Json
          created_at: string | null
          id: string
          performance_metrics: Json | null
          published_to: string[] | null
          repurpose_type: string
          source_post_id: string | null
        }
        Insert: {
          auto_generated?: boolean | null
          content: Json
          created_at?: string | null
          id?: string
          performance_metrics?: Json | null
          published_to?: string[] | null
          repurpose_type: string
          source_post_id?: string | null
        }
        Update: {
          auto_generated?: boolean | null
          content?: Json
          created_at?: string | null
          id?: string
          performance_metrics?: Json | null
          published_to?: string[] | null
          repurpose_type?: string
          source_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_repurposed_content_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_repurposed_content_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_rss_feeds: {
        Row: {
          created_at: string | null
          description: string | null
          feed_name: string
          feed_slug: string
          filter_type: string | null
          filter_value: string | null
          id: string
          include_full_content: boolean | null
          is_active: boolean | null
          max_items: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          feed_name: string
          feed_slug: string
          filter_type?: string | null
          filter_value?: string | null
          id?: string
          include_full_content?: boolean | null
          is_active?: boolean | null
          max_items?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          feed_name?: string
          feed_slug?: string
          filter_type?: string | null
          filter_value?: string | null
          id?: string
          include_full_content?: boolean | null
          is_active?: boolean | null
          max_items?: number | null
        }
        Relationships: []
      }
      blog_seo_rankings: {
        Row: {
          change_30d: number | null
          change_7d: number | null
          competition_level: string | null
          featured_snippet: boolean | null
          id: string
          keyword: string
          position: number | null
          post_id: string | null
          search_volume: number | null
          tracked_date: string | null
          url_shown: string | null
        }
        Insert: {
          change_30d?: number | null
          change_7d?: number | null
          competition_level?: string | null
          featured_snippet?: boolean | null
          id?: string
          keyword: string
          position?: number | null
          post_id?: string | null
          search_volume?: number | null
          tracked_date?: string | null
          url_shown?: string | null
        }
        Update: {
          change_30d?: number | null
          change_7d?: number | null
          competition_level?: string | null
          featured_snippet?: boolean | null
          id?: string
          keyword?: string
          position?: number | null
          post_id?: string | null
          search_volume?: number | null
          tracked_date?: string | null
          url_shown?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_seo_rankings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_seo_rankings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_social_schedule: {
        Row: {
          content: string
          engagement_metrics: Json | null
          error_message: string | null
          id: string
          media_urls: string[] | null
          platform: string
          post_id: string | null
          published_at: string | null
          scheduled_for: string
          status: string | null
        }
        Insert: {
          content: string
          engagement_metrics?: Json | null
          error_message?: string | null
          id?: string
          media_urls?: string[] | null
          platform: string
          post_id?: string | null
          published_at?: string | null
          scheduled_for: string
          status?: string | null
        }
        Update: {
          content?: string
          engagement_metrics?: Json | null
          error_message?: string | null
          id?: string
          media_urls?: string[] | null
          platform?: string
          post_id?: string | null
          published_at?: string | null
          scheduled_for?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_social_schedule_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_social_schedule_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
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
      blog_target_keywords: {
        Row: {
          competition_score: number | null
          created_at: string | null
          current_density: number | null
          current_position: number | null
          id: string
          keyword: string
          keyword_type: string | null
          optimal_density_max: number | null
          optimal_density_min: number | null
          post_id: string | null
          search_volume: number | null
        }
        Insert: {
          competition_score?: number | null
          created_at?: string | null
          current_density?: number | null
          current_position?: number | null
          id?: string
          keyword: string
          keyword_type?: string | null
          optimal_density_max?: number | null
          optimal_density_min?: number | null
          post_id?: string | null
          search_volume?: number | null
        }
        Update: {
          competition_score?: number | null
          created_at?: string | null
          current_density?: number | null
          current_position?: number | null
          id?: string
          keyword?: string
          keyword_type?: string | null
          optimal_density_max?: number | null
          optimal_density_min?: number | null
          post_id?: string | null
          search_volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_target_keywords_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_target_keywords_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
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
      blog_topic_clusters: {
        Row: {
          cluster_keywords: string[] | null
          created_at: string | null
          description: string | null
          id: string
          pillar_post_id: string | null
          pillar_title: string
          target_audience_segment: string | null
        }
        Insert: {
          cluster_keywords?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          pillar_post_id?: string | null
          pillar_title: string
          target_audience_segment?: string | null
        }
        Update: {
          cluster_keywords?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          pillar_post_id?: string | null
          pillar_title?: string
          target_audience_segment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_topic_clusters_pillar_post_id_fkey"
            columns: ["pillar_post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_topic_clusters_pillar_post_id_fkey"
            columns: ["pillar_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_user_reading_behavior: {
        Row: {
          completed: boolean | null
          device_type: string | null
          id: string
          post_id: string | null
          read_at: string | null
          read_percentage: number | null
          time_spent_seconds: number | null
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          device_type?: string | null
          id?: string
          post_id?: string | null
          read_at?: string | null
          read_percentage?: number | null
          time_spent_seconds?: number | null
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          device_type?: string | null
          id?: string
          post_id?: string | null
          read_at?: string | null
          read_percentage?: number | null
          time_spent_seconds?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_user_reading_behavior_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_popular_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_user_reading_behavior_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_calculations: {
        Row: {
          adults: number
          annual_savings: number | null
          children: number
          cost_per_meal: number
          cost_per_person_per_day: number
          created_at: string | null
          device_type: string | null
          dietary_restrictions: Json | null
          email: string | null
          email_captured: boolean | null
          family_size: number
          id: string
          meal_plan_downloaded: boolean | null
          name: string | null
          recommended_monthly_budget: number
          session_id: string
          shared: boolean | null
          state: string | null
          trial_started: boolean | null
          usda_plan_level: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          vs_dining_out_savings: number | null
          vs_meal_kits_savings: number | null
          zip_code: string | null
        }
        Insert: {
          adults: number
          annual_savings?: number | null
          children: number
          cost_per_meal: number
          cost_per_person_per_day: number
          created_at?: string | null
          device_type?: string | null
          dietary_restrictions?: Json | null
          email?: string | null
          email_captured?: boolean | null
          family_size: number
          id?: string
          meal_plan_downloaded?: boolean | null
          name?: string | null
          recommended_monthly_budget: number
          session_id: string
          shared?: boolean | null
          state?: string | null
          trial_started?: boolean | null
          usda_plan_level: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          vs_dining_out_savings?: number | null
          vs_meal_kits_savings?: number | null
          zip_code?: string | null
        }
        Update: {
          adults?: number
          annual_savings?: number | null
          children?: number
          cost_per_meal?: number
          cost_per_person_per_day?: number
          created_at?: string | null
          device_type?: string | null
          dietary_restrictions?: Json | null
          email?: string | null
          email_captured?: boolean | null
          family_size?: number
          id?: string
          meal_plan_downloaded?: boolean | null
          name?: string | null
          recommended_monthly_budget?: number
          session_id?: string
          shared?: boolean | null
          state?: string | null
          trial_started?: boolean | null
          usda_plan_level?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          vs_dining_out_savings?: number | null
          vs_meal_kits_savings?: number | null
          zip_code?: string | null
        }
        Relationships: []
      }
      budget_leads: {
        Row: {
          accepts_marketing: boolean | null
          budget_calculation_id: string | null
          created_at: string | null
          day_3_email_sent_at: string | null
          day_7_email_sent_at: string | null
          email: string
          email_sequence_started: boolean | null
          family_size: number | null
          id: string
          monthly_budget: number | null
          name: string | null
          referral_code: string | null
          referral_count: number | null
          subscription_active: boolean | null
          trial_started: boolean | null
          trial_started_at: string | null
          unsubscribed: boolean | null
          updated_at: string | null
          welcome_email_sent_at: string | null
        }
        Insert: {
          accepts_marketing?: boolean | null
          budget_calculation_id?: string | null
          created_at?: string | null
          day_3_email_sent_at?: string | null
          day_7_email_sent_at?: string | null
          email: string
          email_sequence_started?: boolean | null
          family_size?: number | null
          id?: string
          monthly_budget?: number | null
          name?: string | null
          referral_code?: string | null
          referral_count?: number | null
          subscription_active?: boolean | null
          trial_started?: boolean | null
          trial_started_at?: string | null
          unsubscribed?: boolean | null
          updated_at?: string | null
          welcome_email_sent_at?: string | null
        }
        Update: {
          accepts_marketing?: boolean | null
          budget_calculation_id?: string | null
          created_at?: string | null
          day_3_email_sent_at?: string | null
          day_7_email_sent_at?: string | null
          email?: string
          email_sequence_started?: boolean | null
          family_size?: number | null
          id?: string
          monthly_budget?: number | null
          name?: string | null
          referral_code?: string | null
          referral_count?: number | null
          subscription_active?: boolean | null
          trial_started?: boolean | null
          trial_started_at?: string | null
          unsubscribed?: boolean | null
          updated_at?: string | null
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_leads_budget_calculation_id_fkey"
            columns: ["budget_calculation_id"]
            isOneToOne: false
            referencedRelation: "budget_calculations"
            referencedColumns: ["id"]
          },
        ]
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
      delivery_order_history: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          order_id: string | null
          status: string
          status_message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          status: string
          status_message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          status?: string
          status_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_order_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "grocery_delivery_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_preferences: {
        Row: {
          allow_substitutions: boolean | null
          auto_order_day: string | null
          auto_order_enabled: boolean | null
          auto_order_threshold: number | null
          created_at: string | null
          default_delivery_type: string | null
          household_id: string | null
          id: string
          notify_if_over_budget: boolean | null
          preferred_delivery_day: string[] | null
          preferred_delivery_time: string | null
          preferred_provider_id: string | null
          substitution_preference: string | null
          updated_at: string | null
          user_id: string | null
          weekly_grocery_budget: number | null
        }
        Insert: {
          allow_substitutions?: boolean | null
          auto_order_day?: string | null
          auto_order_enabled?: boolean | null
          auto_order_threshold?: number | null
          created_at?: string | null
          default_delivery_type?: string | null
          household_id?: string | null
          id?: string
          notify_if_over_budget?: boolean | null
          preferred_delivery_day?: string[] | null
          preferred_delivery_time?: string | null
          preferred_provider_id?: string | null
          substitution_preference?: string | null
          updated_at?: string | null
          user_id?: string | null
          weekly_grocery_budget?: number | null
        }
        Update: {
          allow_substitutions?: boolean | null
          auto_order_day?: string | null
          auto_order_enabled?: boolean | null
          auto_order_threshold?: number | null
          created_at?: string | null
          default_delivery_type?: string | null
          household_id?: string | null
          id?: string
          notify_if_over_budget?: boolean | null
          preferred_delivery_day?: string[] | null
          preferred_delivery_time?: string | null
          preferred_provider_id?: string | null
          substitution_preference?: string | null
          updated_at?: string | null
          user_id?: string | null
          weekly_grocery_budget?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_preferences_preferred_provider_id_fkey"
            columns: ["preferred_provider_id"]
            isOneToOne: false
            referencedRelation: "delivery_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      delivery_pricing_cache: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          item_category: string | null
          item_name: string
          last_updated: string | null
          price: number | null
          provider_id: string | null
          store_name: string | null
          unit: string | null
          zip_code: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          item_category?: string | null
          item_name: string
          last_updated?: string | null
          price?: number | null
          provider_id?: string | null
          store_name?: string | null
          unit?: string | null
          zip_code?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          item_category?: string | null
          item_name?: string
          last_updated?: string | null
          price?: number | null
          provider_id?: string | null
          store_name?: string | null
          unit?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pricing_cache_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "delivery_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_providers: {
        Row: {
          api_endpoint: string | null
          auth_type: string | null
          created_at: string | null
          delivery_fee: number | null
          display_name: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          min_order_amount: number | null
          provider_name: string
          requires_oauth: boolean | null
          supported_regions: Json | null
          supports_express_delivery: boolean | null
          supports_price_matching: boolean | null
          supports_scheduled_delivery: boolean | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          api_endpoint?: string | null
          auth_type?: string | null
          created_at?: string | null
          delivery_fee?: number | null
          display_name: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          min_order_amount?: number | null
          provider_name: string
          requires_oauth?: boolean | null
          supported_regions?: Json | null
          supports_express_delivery?: boolean | null
          supports_price_matching?: boolean | null
          supports_scheduled_delivery?: boolean | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          api_endpoint?: string | null
          auth_type?: string | null
          created_at?: string | null
          delivery_fee?: number | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          min_order_amount?: number | null
          provider_name?: string
          requires_oauth?: boolean | null
          supported_regions?: Json | null
          supports_express_delivery?: boolean | null
          supports_price_matching?: boolean | null
          supports_scheduled_delivery?: boolean | null
          updated_at?: string | null
          website_url?: string | null
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
      email_sequence_steps: {
        Row: {
          condition_rules: Json | null
          created_at: string | null
          delay_days: number
          delay_hours: number
          html_body: string
          id: string
          sequence_id: string
          step_order: number
          subject: string
          template_id: string | null
          text_body: string | null
        }
        Insert: {
          condition_rules?: Json | null
          created_at?: string | null
          delay_days?: number
          delay_hours?: number
          html_body: string
          id?: string
          sequence_id: string
          step_order: number
          subject: string
          template_id?: string | null
          text_body?: string | null
        }
        Update: {
          condition_rules?: Json | null
          created_at?: string | null
          delay_days?: number
          delay_hours?: number
          html_body?: string
          id?: string
          sequence_id?: string
          step_order?: number
          subject?: string
          template_id?: string | null
          text_body?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          trigger_conditions: Json | null
          trigger_event: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          trigger_conditions?: Json | null
          trigger_event: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          trigger_conditions?: Json | null
          trigger_event?: string
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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
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
      grocery_delivery_orders: {
        Row: {
          account_id: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string | null
          created_from_meal_plan: boolean | null
          delivered_at: string | null
          delivery_address: Json | null
          delivery_fee: number | null
          delivery_type: string | null
          delivery_window_end: string | null
          delivery_window_start: string | null
          estimated_amount: number | null
          external_order_id: string | null
          household_id: string | null
          id: string
          item_count: number | null
          items: Json
          meal_plan_week_start: string | null
          order_notes: string | null
          order_number: string | null
          provider_id: string | null
          service_fee: number | null
          shopper_name: string | null
          shopper_phone: string | null
          shopper_rating: number | null
          status: string | null
          submitted_at: string | null
          substitution_preferences: string | null
          subtotal: number | null
          tax: number | null
          tip: number | null
          total_amount: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          created_from_meal_plan?: boolean | null
          delivered_at?: string | null
          delivery_address?: Json | null
          delivery_fee?: number | null
          delivery_type?: string | null
          delivery_window_end?: string | null
          delivery_window_start?: string | null
          estimated_amount?: number | null
          external_order_id?: string | null
          household_id?: string | null
          id?: string
          item_count?: number | null
          items: Json
          meal_plan_week_start?: string | null
          order_notes?: string | null
          order_number?: string | null
          provider_id?: string | null
          service_fee?: number | null
          shopper_name?: string | null
          shopper_phone?: string | null
          shopper_rating?: number | null
          status?: string | null
          submitted_at?: string | null
          substitution_preferences?: string | null
          subtotal?: number | null
          tax?: number | null
          tip?: number | null
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          created_from_meal_plan?: boolean | null
          delivered_at?: string | null
          delivery_address?: Json | null
          delivery_fee?: number | null
          delivery_type?: string | null
          delivery_window_end?: string | null
          delivery_window_start?: string | null
          estimated_amount?: number | null
          external_order_id?: string | null
          household_id?: string | null
          id?: string
          item_count?: number | null
          items?: Json
          meal_plan_week_start?: string | null
          order_notes?: string | null
          order_number?: string | null
          provider_id?: string | null
          service_fee?: number | null
          shopper_name?: string | null
          shopper_phone?: string | null
          shopper_rating?: number | null
          status?: string | null
          submitted_at?: string | null
          substitution_preferences?: string | null
          subtotal?: number | null
          tax?: number | null
          tip?: number | null
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grocery_delivery_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_delivery_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_delivery_orders_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_delivery_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "delivery_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_delivery_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_delivery_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_delivery_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
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
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
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
      gsc_issues: {
        Row: {
          affected_count: number | null
          affected_urls: string[] | null
          created_at: string | null
          first_detected: string | null
          fixed_at: string | null
          fixed_by_user_id: string | null
          id: string
          issue_category: string
          issue_description: string | null
          issue_name: string
          issue_type: string
          last_detected: string | null
          property_id: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          affected_count?: number | null
          affected_urls?: string[] | null
          created_at?: string | null
          first_detected?: string | null
          fixed_at?: string | null
          fixed_by_user_id?: string | null
          id?: string
          issue_category: string
          issue_description?: string | null
          issue_name: string
          issue_type: string
          last_detected?: string | null
          property_id?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          affected_count?: number | null
          affected_urls?: string[] | null
          created_at?: string | null
          first_detected?: string | null
          fixed_at?: string | null
          fixed_by_user_id?: string | null
          id?: string
          issue_category?: string
          issue_description?: string | null
          issue_name?: string
          issue_type?: string
          last_detected?: string | null
          property_id?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gsc_issues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "gsc_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_keyword_performance: {
        Row: {
          clicks: number
          created_at: string | null
          ctr: number
          date: string
          desktop_clicks: number | null
          id: string
          impressions: number
          keyword_id: string | null
          mobile_clicks: number | null
          position: number
          property_id: string | null
          tablet_clicks: number | null
          top_pages: Json | null
        }
        Insert: {
          clicks?: number
          created_at?: string | null
          ctr?: number
          date: string
          desktop_clicks?: number | null
          id?: string
          impressions?: number
          keyword_id?: string | null
          mobile_clicks?: number | null
          position?: number
          property_id?: string | null
          tablet_clicks?: number | null
          top_pages?: Json | null
        }
        Update: {
          clicks?: number
          created_at?: string | null
          ctr?: number
          date?: string
          desktop_clicks?: number | null
          id?: string
          impressions?: number
          keyword_id?: string | null
          mobile_clicks?: number | null
          position?: number
          property_id?: string | null
          tablet_clicks?: number | null
          top_pages?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "gsc_keyword_performance_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "seo_keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gsc_keyword_performance_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "gsc_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_oauth_credentials: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          refresh_token: string
          scope: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          refresh_token: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          refresh_token?: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gsc_page_performance: {
        Row: {
          clicks: number
          created_at: string | null
          ctr: number
          date: string
          desktop_impressions: number | null
          id: string
          impressions: number
          mobile_impressions: number | null
          page_url: string
          position: number
          property_id: string | null
          tablet_impressions: number | null
          top_queries: Json | null
        }
        Insert: {
          clicks?: number
          created_at?: string | null
          ctr?: number
          date: string
          desktop_impressions?: number | null
          id?: string
          impressions?: number
          mobile_impressions?: number | null
          page_url: string
          position?: number
          property_id?: string | null
          tablet_impressions?: number | null
          top_queries?: Json | null
        }
        Update: {
          clicks?: number
          created_at?: string | null
          ctr?: number
          date?: string
          desktop_impressions?: number | null
          id?: string
          impressions?: number
          mobile_impressions?: number | null
          page_url?: string
          position?: number
          property_id?: string | null
          tablet_impressions?: number | null
          top_queries?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "gsc_page_performance_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "gsc_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_properties: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          is_primary: boolean | null
          is_verified: boolean | null
          last_synced_at: string | null
          permission_level: string | null
          property_type: string
          property_url: string
          sync_enabled: boolean | null
          sync_frequency: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
          last_synced_at?: string | null
          permission_level?: string | null
          property_type: string
          property_url: string
          sync_enabled?: boolean | null
          sync_frequency?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
          last_synced_at?: string | null
          permission_level?: string | null
          property_type?: string
          property_url?: string
          sync_enabled?: boolean | null
          sync_frequency?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gsc_sync_log: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          end_date: string | null
          error_details: Json | null
          error_message: string | null
          id: string
          property_id: string | null
          records_synced: number | null
          start_date: string | null
          started_at: string | null
          sync_status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          end_date?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          property_id?: string | null
          records_synced?: number | null
          start_date?: string | null
          started_at?: string | null
          sync_status: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          end_date?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          property_id?: string | null
          records_synced?: number | null
          start_date?: string | null
          started_at?: string | null
          sync_status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gsc_sync_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "gsc_properties"
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
      kid_meal_suggestions: {
        Row: {
          accepted_plan_entry_id: string | null
          created_at: string | null
          household_id: string | null
          id: string
          kid_id: string | null
          meal_date: string
          meal_slot: string
          original_plan_entry_id: string | null
          parent_response: string | null
          status: string | null
          suggested_food_name: string | null
          suggested_recipe_id: string | null
          suggestion_reason: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_plan_entry_id?: string | null
          created_at?: string | null
          household_id?: string | null
          id?: string
          kid_id?: string | null
          meal_date: string
          meal_slot: string
          original_plan_entry_id?: string | null
          parent_response?: string | null
          status?: string | null
          suggested_food_name?: string | null
          suggested_recipe_id?: string | null
          suggestion_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_plan_entry_id?: string | null
          created_at?: string | null
          household_id?: string | null
          id?: string
          kid_id?: string | null
          meal_date?: string
          meal_slot?: string
          original_plan_entry_id?: string | null
          parent_response?: string | null
          status?: string | null
          suggested_food_name?: string | null
          suggested_recipe_id?: string | null
          suggestion_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_meal_suggestions_accepted_plan_entry_id_fkey"
            columns: ["accepted_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "plan_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_accepted_plan_entry_id_fkey"
            columns: ["accepted_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "unified_meal_tracking"
            referencedColumns: ["plan_entry_id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_original_plan_entry_id_fkey"
            columns: ["original_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "plan_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_original_plan_entry_id_fkey"
            columns: ["original_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "unified_meal_tracking"
            referencedColumns: ["plan_entry_id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_suggested_recipe_id_fkey"
            columns: ["suggested_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_suggested_recipe_id_fkey"
            columns: ["suggested_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "kid_meal_suggestions_suggested_recipe_id_fkey"
            columns: ["suggested_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
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
      lead_score_history: {
        Row: {
          created_at: string | null
          id: string
          lead_id: string
          metadata: Json | null
          new_score: number
          old_score: number
          reason: string
          score_delta: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          new_score: number
          old_score: number
          reason: string
          score_delta?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          new_score?: number
          old_score?: number
          reason?: string
          score_delta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_history_lead_id_fkey"
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
      meal_plan_generations: {
        Row: {
          adults: number
          allergies: Json | null
          children: number
          children_ages: Json | null
          cooking_skill_level: string | null
          cooking_time_available: number | null
          created_at: string | null
          device_type: string | null
          dietary_restrictions: Json | null
          email: string | null
          email_captured: boolean | null
          family_size: number
          feedback: string | null
          full_plan_downloaded: boolean | null
          grocery_list: Json
          id: string
          kitchen_equipment: Json | null
          meal_plan: Json
          name: string | null
          picky_eater_level: string | null
          rating: number | null
          session_id: string
          shared: boolean | null
          total_estimated_cost: number | null
          total_prep_time: number | null
          trial_started: boolean | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          adults: number
          allergies?: Json | null
          children: number
          children_ages?: Json | null
          cooking_skill_level?: string | null
          cooking_time_available?: number | null
          created_at?: string | null
          device_type?: string | null
          dietary_restrictions?: Json | null
          email?: string | null
          email_captured?: boolean | null
          family_size: number
          feedback?: string | null
          full_plan_downloaded?: boolean | null
          grocery_list: Json
          id?: string
          kitchen_equipment?: Json | null
          meal_plan: Json
          name?: string | null
          picky_eater_level?: string | null
          rating?: number | null
          session_id: string
          shared?: boolean | null
          total_estimated_cost?: number | null
          total_prep_time?: number | null
          trial_started?: boolean | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          adults?: number
          allergies?: Json | null
          children?: number
          children_ages?: Json | null
          cooking_skill_level?: string | null
          cooking_time_available?: number | null
          created_at?: string | null
          device_type?: string | null
          dietary_restrictions?: Json | null
          email?: string | null
          email_captured?: boolean | null
          family_size?: number
          feedback?: string | null
          full_plan_downloaded?: boolean | null
          grocery_list?: Json
          id?: string
          kitchen_equipment?: Json | null
          meal_plan?: Json
          name?: string | null
          picky_eater_level?: string | null
          rating?: number | null
          session_id?: string
          shared?: boolean | null
          total_estimated_cost?: number | null
          total_prep_time?: number | null
          trial_started?: boolean | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      meal_plan_leads: {
        Row: {
          accepts_marketing: boolean | null
          created_at: string | null
          day_2_email_sent_at: string | null
          day_5_email_sent_at: string | null
          day_7_email_sent_at: string | null
          email: string
          email_sequence_started: boolean | null
          family_size: number | null
          id: string
          meal_plan_generation_id: string | null
          name: string | null
          picky_eater_level: string | null
          referral_code: string | null
          referral_count: number | null
          subscription_active: boolean | null
          trial_started: boolean | null
          trial_started_at: string | null
          unsubscribed: boolean | null
          updated_at: string | null
          welcome_email_sent_at: string | null
        }
        Insert: {
          accepts_marketing?: boolean | null
          created_at?: string | null
          day_2_email_sent_at?: string | null
          day_5_email_sent_at?: string | null
          day_7_email_sent_at?: string | null
          email: string
          email_sequence_started?: boolean | null
          family_size?: number | null
          id?: string
          meal_plan_generation_id?: string | null
          name?: string | null
          picky_eater_level?: string | null
          referral_code?: string | null
          referral_count?: number | null
          subscription_active?: boolean | null
          trial_started?: boolean | null
          trial_started_at?: string | null
          unsubscribed?: boolean | null
          updated_at?: string | null
          welcome_email_sent_at?: string | null
        }
        Update: {
          accepts_marketing?: boolean | null
          created_at?: string | null
          day_2_email_sent_at?: string | null
          day_5_email_sent_at?: string | null
          day_7_email_sent_at?: string | null
          email?: string
          email_sequence_started?: boolean | null
          family_size?: number | null
          id?: string
          meal_plan_generation_id?: string | null
          name?: string | null
          picky_eater_level?: string | null
          referral_code?: string | null
          referral_count?: number | null
          subscription_active?: boolean | null
          trial_started?: boolean | null
          trial_started_at?: string | null
          unsubscribed?: boolean | null
          updated_at?: string | null
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_leads_meal_plan_generation_id_fkey"
            columns: ["meal_plan_generation_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_template_entries: {
        Row: {
          created_at: string | null
          day_of_week: number
          food_ids: string[] | null
          id: string
          is_optional: boolean | null
          meal_slot: string
          notes: string | null
          recipe_id: string | null
          template_id: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          food_ids?: string[] | null
          id?: string
          is_optional?: boolean | null
          meal_slot: string
          notes?: string | null
          recipe_id?: string | null
          template_id?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          food_ids?: string[] | null
          id?: string
          is_optional?: boolean | null
          meal_slot?: string
          notes?: string | null
          recipe_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_template_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_template_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "meal_plan_template_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_template_entries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_templates: {
        Row: {
          created_at: string | null
          created_from_week: string | null
          description: string | null
          dietary_restrictions: string[] | null
          household_id: string | null
          id: string
          is_admin_template: boolean | null
          is_favorite: boolean | null
          is_starter_template: boolean | null
          name: string
          season: string | null
          success_rate: number | null
          target_age_range: string | null
          times_used: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_from_week?: string | null
          description?: string | null
          dietary_restrictions?: string[] | null
          household_id?: string | null
          id?: string
          is_admin_template?: boolean | null
          is_favorite?: boolean | null
          is_starter_template?: boolean | null
          name: string
          season?: string | null
          success_rate?: number | null
          target_age_range?: string | null
          times_used?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_from_week?: string | null
          description?: string | null
          dietary_restrictions?: string[] | null
          household_id?: string | null
          id?: string
          is_admin_template?: boolean | null
          is_favorite?: boolean | null
          is_starter_template?: boolean | null
          name?: string
          season?: string | null
          success_rate?: number | null
          target_age_range?: string | null
          times_used?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_templates_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      meal_suggestions: {
        Row: {
          accepted_at: string | null
          based_on_pantry: boolean | null
          based_on_preferences: boolean | null
          based_on_season: boolean | null
          based_on_variety: boolean | null
          based_on_votes: boolean | null
          confidence_score: number | null
          created_at: string | null
          difficulty: string | null
          estimated_cook_time: number | null
          estimated_prep_time: number | null
          expires_at: string | null
          feedback_rating: number | null
          feedback_text: string | null
          household_id: string | null
          id: string
          match_factors: Json | null
          meal_slot: string | null
          predicted_kid_approval: number | null
          reasoning: string | null
          recipe_id: string | null
          rejected_at: string | null
          status: string | null
          suggested_for_date: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          based_on_pantry?: boolean | null
          based_on_preferences?: boolean | null
          based_on_season?: boolean | null
          based_on_variety?: boolean | null
          based_on_votes?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          difficulty?: string | null
          estimated_cook_time?: number | null
          estimated_prep_time?: number | null
          expires_at?: string | null
          feedback_rating?: number | null
          feedback_text?: string | null
          household_id?: string | null
          id?: string
          match_factors?: Json | null
          meal_slot?: string | null
          predicted_kid_approval?: number | null
          reasoning?: string | null
          recipe_id?: string | null
          rejected_at?: string | null
          status?: string | null
          suggested_for_date?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          based_on_pantry?: boolean | null
          based_on_preferences?: boolean | null
          based_on_season?: boolean | null
          based_on_variety?: boolean | null
          based_on_votes?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          difficulty?: string | null
          estimated_cook_time?: number | null
          estimated_prep_time?: number | null
          expires_at?: string | null
          feedback_rating?: number | null
          feedback_text?: string | null
          household_id?: string | null
          id?: string
          match_factors?: Json | null
          meal_slot?: string | null
          predicted_kid_approval?: number | null
          reasoning?: string | null
          recipe_id?: string | null
          rejected_at?: string | null
          status?: string | null
          suggested_for_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_suggestions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_suggestions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_suggestions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "meal_suggestions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_vote_summary: {
        Row: {
          approval_score: number | null
          household_id: string | null
          id: string
          last_vote_at: string | null
          love_it_count: number | null
          meal_date: string
          meal_slot: string
          no_way_count: number | null
          okay_count: number | null
          plan_entry_id: string | null
          recipe_id: string | null
          total_votes: number | null
          updated_at: string | null
        }
        Insert: {
          approval_score?: number | null
          household_id?: string | null
          id?: string
          last_vote_at?: string | null
          love_it_count?: number | null
          meal_date: string
          meal_slot: string
          no_way_count?: number | null
          okay_count?: number | null
          plan_entry_id?: string | null
          recipe_id?: string | null
          total_votes?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_score?: number | null
          household_id?: string | null
          id?: string
          last_vote_at?: string | null
          love_it_count?: number | null
          meal_date?: string
          meal_slot?: string
          no_way_count?: number | null
          okay_count?: number | null
          plan_entry_id?: string | null
          recipe_id?: string | null
          total_votes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_vote_summary_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_vote_summary_plan_entry_id_fkey"
            columns: ["plan_entry_id"]
            isOneToOne: true
            referencedRelation: "plan_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_vote_summary_plan_entry_id_fkey"
            columns: ["plan_entry_id"]
            isOneToOne: true
            referencedRelation: "unified_meal_tracking"
            referencedColumns: ["plan_entry_id"]
          },
          {
            foreignKeyName: "meal_vote_summary_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_vote_summary_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "meal_vote_summary_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_votes: {
        Row: {
          household_id: string | null
          id: string
          kid_id: string | null
          meal_date: string
          meal_slot: string
          plan_entry_id: string | null
          reason: string | null
          recipe_id: string | null
          updated_at: string | null
          vote: string
          vote_emoji: string | null
          voted_at: string | null
          voting_session_id: string | null
        }
        Insert: {
          household_id?: string | null
          id?: string
          kid_id?: string | null
          meal_date: string
          meal_slot: string
          plan_entry_id?: string | null
          reason?: string | null
          recipe_id?: string | null
          updated_at?: string | null
          vote: string
          vote_emoji?: string | null
          voted_at?: string | null
          voting_session_id?: string | null
        }
        Update: {
          household_id?: string | null
          id?: string
          kid_id?: string | null
          meal_date?: string
          meal_slot?: string
          plan_entry_id?: string | null
          reason?: string | null
          recipe_id?: string | null
          updated_at?: string | null
          vote?: string
          vote_emoji?: string | null
          voted_at?: string | null
          voting_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_votes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_votes_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
          },
          {
            foreignKeyName: "meal_votes_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_votes_plan_entry_id_fkey"
            columns: ["plan_entry_id"]
            isOneToOne: false
            referencedRelation: "plan_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_votes_plan_entry_id_fkey"
            columns: ["plan_entry_id"]
            isOneToOne: false
            referencedRelation: "unified_meal_tracking"
            referencedColumns: ["plan_entry_id"]
          },
          {
            foreignKeyName: "meal_votes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_votes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "meal_votes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_history: {
        Row: {
          body: string
          channel: string
          clicked_at: string | null
          created_at: string | null
          delivered_at: string | null
          dismissed_at: string | null
          id: string
          notification_type: string
          sent_at: string
          title: string
          user_id: string | null
          was_clicked: boolean | null
          was_delivered: boolean | null
          was_dismissed: boolean | null
        }
        Insert: {
          body: string
          channel: string
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          id?: string
          notification_type: string
          sent_at: string
          title: string
          user_id?: string | null
          was_clicked?: boolean | null
          was_delivered?: boolean | null
          was_dismissed?: boolean | null
        }
        Update: {
          body?: string
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          id?: string
          notification_type?: string
          sent_at?: string
          title?: string
          user_id?: string | null
          was_clicked?: boolean | null
          was_delivered?: boolean | null
          was_dismissed?: boolean | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          digest_mode: boolean | null
          email_enabled: boolean | null
          food_success_updates: boolean | null
          grocery_reminder_day: string | null
          grocery_reminder_time: string | null
          grocery_reminders: boolean | null
          household_id: string | null
          id: string
          max_notifications_per_day: number | null
          meal_reminder_time_minutes: number | null
          meal_reminders: boolean | null
          milestone_celebrations: boolean | null
          partner_updates: boolean | null
          prep_reminder_time: string | null
          prep_reminders: boolean | null
          push_enabled: boolean | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          sms_enabled: boolean | null
          template_suggestions: boolean | null
          updated_at: string | null
          user_id: string | null
          weekly_summary: boolean | null
          weekly_summary_day: string | null
          weekly_summary_time: string | null
        }
        Insert: {
          created_at?: string | null
          digest_mode?: boolean | null
          email_enabled?: boolean | null
          food_success_updates?: boolean | null
          grocery_reminder_day?: string | null
          grocery_reminder_time?: string | null
          grocery_reminders?: boolean | null
          household_id?: string | null
          id?: string
          max_notifications_per_day?: number | null
          meal_reminder_time_minutes?: number | null
          meal_reminders?: boolean | null
          milestone_celebrations?: boolean | null
          partner_updates?: boolean | null
          prep_reminder_time?: string | null
          prep_reminders?: boolean | null
          push_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sms_enabled?: boolean | null
          template_suggestions?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          weekly_summary?: boolean | null
          weekly_summary_day?: string | null
          weekly_summary_time?: string | null
        }
        Update: {
          created_at?: string | null
          digest_mode?: boolean | null
          email_enabled?: boolean | null
          food_success_updates?: boolean | null
          grocery_reminder_day?: string | null
          grocery_reminder_time?: string | null
          grocery_reminders?: boolean | null
          household_id?: string | null
          id?: string
          max_notifications_per_day?: number | null
          meal_reminder_time_minutes?: number | null
          meal_reminders?: boolean | null
          milestone_celebrations?: boolean | null
          partner_updates?: boolean | null
          prep_reminder_time?: string | null
          prep_reminders?: boolean | null
          push_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sms_enabled?: boolean | null
          template_suggestions?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          weekly_summary?: boolean | null
          weekly_summary_day?: string | null
          weekly_summary_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          action_url: string | null
          batch_id: string | null
          body: string
          channel: string
          clicked_at: string | null
          created_at: string | null
          data: Json | null
          delivered_at: string | null
          digest_group: string | null
          error_message: string | null
          household_id: string | null
          icon: string | null
          id: string
          image_url: string | null
          notification_type: string
          priority: string | null
          retry_count: number | null
          scheduled_for: string
          sent_at: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          batch_id?: string | null
          body: string
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          data?: Json | null
          delivered_at?: string | null
          digest_group?: string | null
          error_message?: string | null
          household_id?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          notification_type: string
          priority?: string | null
          retry_count?: number | null
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          batch_id?: string | null
          body?: string
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          data?: Json | null
          delivered_at?: string | null
          digest_group?: string | null
          error_message?: string | null
          household_id?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          notification_type?: string
          priority?: string | null
          retry_count?: number | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          body_template: string
          created_at: string | null
          created_by: string | null
          household_id: string | null
          id: string
          is_active: boolean | null
          notification_data: Json | null
          rule_name: string
          rule_type: string
          target_user_ids: string[] | null
          title_template: string
          trigger_days: string[] | null
          trigger_time: string | null
          trigger_time_offset: number | null
          updated_at: string | null
        }
        Insert: {
          body_template: string
          created_at?: string | null
          created_by?: string | null
          household_id?: string | null
          id?: string
          is_active?: boolean | null
          notification_data?: Json | null
          rule_name: string
          rule_type: string
          target_user_ids?: string[] | null
          title_template: string
          trigger_days?: string[] | null
          trigger_time?: string | null
          trigger_time_offset?: number | null
          updated_at?: string | null
        }
        Update: {
          body_template?: string
          created_at?: string | null
          created_by?: string | null
          household_id?: string | null
          id?: string
          is_active?: boolean | null
          notification_data?: Json | null
          rule_name?: string
          rule_type?: string
          target_user_ids?: string[] | null
          title_template?: string
          trigger_days?: string[] | null
          trigger_time?: string | null
          trigger_time_offset?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
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
      order_substitutions: {
        Row: {
          created_at: string | null
          customer_approved: boolean | null
          id: string
          order_id: string | null
          original_food_id: string | null
          original_item_name: string
          original_price: number | null
          original_quantity: number | null
          reason: string | null
          substituted_item_name: string | null
          substituted_price: number | null
          substituted_quantity: number | null
        }
        Insert: {
          created_at?: string | null
          customer_approved?: boolean | null
          id?: string
          order_id?: string | null
          original_food_id?: string | null
          original_item_name: string
          original_price?: number | null
          original_quantity?: number | null
          reason?: string | null
          substituted_item_name?: string | null
          substituted_price?: number | null
          substituted_quantity?: number | null
        }
        Update: {
          created_at?: string | null
          customer_approved?: boolean | null
          id?: string
          order_id?: string | null
          original_food_id?: string | null
          original_item_name?: string
          original_price?: number | null
          original_quantity?: number | null
          reason?: string | null
          substituted_item_name?: string | null
          substituted_price?: number | null
          substituted_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_substitutions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "grocery_delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_substitutions_original_food_id_fkey"
            columns: ["original_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_substitutions_original_food_id_fkey"
            columns: ["original_food_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["food_id"]
          },
        ]
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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "payment_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_recovery_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          created_at: string | null
          currency: string | null
          dunning_email_sent: boolean | null
          dunning_email_sent_at: string | null
          failed_amount: number
          failure_code: string | null
          failure_reason: string | null
          id: string
          next_retry_at: string | null
          payment_intent_id: string | null
          payment_method_updated: boolean | null
          recovery_method: string | null
          result: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          attempt_number?: number
          attempted_at?: string
          created_at?: string | null
          currency?: string | null
          dunning_email_sent?: boolean | null
          dunning_email_sent_at?: string | null
          failed_amount: number
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          next_retry_at?: string | null
          payment_intent_id?: string | null
          payment_method_updated?: boolean | null
          recovery_method?: string | null
          result: string
          subscription_id: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          created_at?: string | null
          currency?: string | null
          dunning_email_sent?: boolean | null
          dunning_email_sent_at?: string | null
          failed_amount?: number
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          next_retry_at?: string | null
          payment_intent_id?: string | null
          payment_method_updated?: boolean | null
          recovery_method?: string | null
          result?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_recovery_attempts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "payment_recovery_attempts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
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
            referencedRelation: "recipe_scaling_info"
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
      push_tokens: {
        Row: {
          created_at: string | null
          device_id: string | null
          device_name: string | null
          failed_attempts: number | null
          id: string
          is_active: boolean | null
          last_error: string | null
          last_used_at: string | null
          platform: string
          token: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          device_name?: string | null
          failed_attempts?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_used_at?: string | null
          platform: string
          token: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          device_name?: string | null
          failed_attempts?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_used_at?: string | null
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      quiz_analytics: {
        Row: {
          ab_test_variant: string | null
          browser: string | null
          created_at: string | null
          current_step: number | null
          device_type: string | null
          event_data: Json | null
          event_type: string
          id: string
          quiz_response_id: string | null
          referral_source: string | null
          session_id: string
          time_on_page_seconds: number | null
          total_steps: number | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ab_test_variant?: string | null
          browser?: string | null
          created_at?: string | null
          current_step?: number | null
          device_type?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          quiz_response_id?: string | null
          referral_source?: string | null
          session_id: string
          time_on_page_seconds?: number | null
          total_steps?: number | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ab_test_variant?: string | null
          browser?: string | null
          created_at?: string | null
          current_step?: number | null
          device_type?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          quiz_response_id?: string | null
          referral_source?: string | null
          session_id?: string
          time_on_page_seconds?: number | null
          total_steps?: number | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_analytics_quiz_response_id_fkey"
            columns: ["quiz_response_id"]
            isOneToOne: false
            referencedRelation: "quiz_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_leads: {
        Row: {
          accepts_marketing: boolean | null
          child_name: string | null
          created_at: string | null
          email: string
          email_1_clicked: boolean | null
          email_1_opened: boolean | null
          email_1_sent_at: string | null
          email_2_clicked: boolean | null
          email_2_opened: boolean | null
          email_2_sent_at: string | null
          email_3_clicked: boolean | null
          email_3_opened: boolean | null
          email_3_sent_at: string | null
          email_4_clicked: boolean | null
          email_4_opened: boolean | null
          email_4_sent_at: string | null
          email_5_clicked: boolean | null
          email_5_opened: boolean | null
          email_5_sent_at: string | null
          email_6_clicked: boolean | null
          email_6_opened: boolean | null
          email_6_sent_at: string | null
          email_7_clicked: boolean | null
          email_7_opened: boolean | null
          email_7_sent_at: string | null
          email_sequence_started: boolean | null
          id: string
          parent_name: string | null
          personality_type: string | null
          quiz_response_id: string | null
          referral_code: string | null
          referral_count: number | null
          subscription_active: boolean | null
          subscription_started_at: string | null
          trial_started: boolean | null
          trial_started_at: string | null
          unsubscribed: boolean | null
          unsubscribed_at: string | null
          updated_at: string | null
        }
        Insert: {
          accepts_marketing?: boolean | null
          child_name?: string | null
          created_at?: string | null
          email: string
          email_1_clicked?: boolean | null
          email_1_opened?: boolean | null
          email_1_sent_at?: string | null
          email_2_clicked?: boolean | null
          email_2_opened?: boolean | null
          email_2_sent_at?: string | null
          email_3_clicked?: boolean | null
          email_3_opened?: boolean | null
          email_3_sent_at?: string | null
          email_4_clicked?: boolean | null
          email_4_opened?: boolean | null
          email_4_sent_at?: string | null
          email_5_clicked?: boolean | null
          email_5_opened?: boolean | null
          email_5_sent_at?: string | null
          email_6_clicked?: boolean | null
          email_6_opened?: boolean | null
          email_6_sent_at?: string | null
          email_7_clicked?: boolean | null
          email_7_opened?: boolean | null
          email_7_sent_at?: string | null
          email_sequence_started?: boolean | null
          id?: string
          parent_name?: string | null
          personality_type?: string | null
          quiz_response_id?: string | null
          referral_code?: string | null
          referral_count?: number | null
          subscription_active?: boolean | null
          subscription_started_at?: string | null
          trial_started?: boolean | null
          trial_started_at?: string | null
          unsubscribed?: boolean | null
          unsubscribed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          accepts_marketing?: boolean | null
          child_name?: string | null
          created_at?: string | null
          email?: string
          email_1_clicked?: boolean | null
          email_1_opened?: boolean | null
          email_1_sent_at?: string | null
          email_2_clicked?: boolean | null
          email_2_opened?: boolean | null
          email_2_sent_at?: string | null
          email_3_clicked?: boolean | null
          email_3_opened?: boolean | null
          email_3_sent_at?: string | null
          email_4_clicked?: boolean | null
          email_4_opened?: boolean | null
          email_4_sent_at?: string | null
          email_5_clicked?: boolean | null
          email_5_opened?: boolean | null
          email_5_sent_at?: string | null
          email_6_clicked?: boolean | null
          email_6_opened?: boolean | null
          email_6_sent_at?: string | null
          email_7_clicked?: boolean | null
          email_7_opened?: boolean | null
          email_7_sent_at?: string | null
          email_sequence_started?: boolean | null
          id?: string
          parent_name?: string | null
          personality_type?: string | null
          quiz_response_id?: string | null
          referral_code?: string | null
          referral_count?: number | null
          subscription_active?: boolean | null
          subscription_started_at?: string | null
          trial_started?: boolean | null
          trial_started_at?: string | null
          unsubscribed?: boolean | null
          unsubscribed_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_leads_quiz_response_id_fkey"
            columns: ["quiz_response_id"]
            isOneToOne: false
            referencedRelation: "quiz_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_referrals: {
        Row: {
          converted: boolean | null
          created_at: string | null
          id: string
          referral_code: string
          referred_email: string | null
          referred_quiz_response_id: string | null
          referrer_email: string | null
          reward_granted: boolean | null
        }
        Insert: {
          converted?: boolean | null
          created_at?: string | null
          id?: string
          referral_code: string
          referred_email?: string | null
          referred_quiz_response_id?: string | null
          referrer_email?: string | null
          reward_granted?: boolean | null
        }
        Update: {
          converted?: boolean | null
          created_at?: string | null
          id?: string
          referral_code?: string
          referred_email?: string | null
          referred_quiz_response_id?: string | null
          referrer_email?: string | null
          reward_granted?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_referrals_referred_quiz_response_id_fkey"
            columns: ["referred_quiz_response_id"]
            isOneToOne: false
            referencedRelation: "quiz_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_referrals_referrer_email_fkey"
            columns: ["referrer_email"]
            isOneToOne: false
            referencedRelation: "quiz_leads"
            referencedColumns: ["email"]
          },
        ]
      }
      quiz_responses: {
        Row: {
          ab_test_variant: string | null
          answers: Json
          child_name: string | null
          completion_time_seconds: number | null
          created_at: string | null
          device_type: string | null
          email: string | null
          email_captured: boolean | null
          id: string
          parent_name: string | null
          pdf_downloaded: boolean | null
          personality_type: string
          referral_source: string | null
          scores: Json
          secondary_type: string | null
          session_id: string | null
          shared_social: boolean | null
          trial_started: boolean | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ab_test_variant?: string | null
          answers: Json
          child_name?: string | null
          completion_time_seconds?: number | null
          created_at?: string | null
          device_type?: string | null
          email?: string | null
          email_captured?: boolean | null
          id?: string
          parent_name?: string | null
          pdf_downloaded?: boolean | null
          personality_type: string
          referral_source?: string | null
          scores: Json
          secondary_type?: string | null
          session_id?: string | null
          shared_social?: boolean | null
          trial_started?: boolean | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ab_test_variant?: string | null
          answers?: Json
          child_name?: string | null
          completion_time_seconds?: number | null
          created_at?: string | null
          device_type?: string | null
          email?: string | null
          email_captured?: boolean | null
          id?: string
          parent_name?: string | null
          pdf_downloaded?: boolean | null
          personality_type?: string
          referral_source?: string | null
          scores?: Json
          secondary_type?: string | null
          session_id?: string | null
          shared_social?: boolean | null
          trial_started?: boolean | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      quiz_shares: {
        Row: {
          clicks: number | null
          conversions: number | null
          created_at: string | null
          id: string
          personality_type: string | null
          platform: string
          quiz_response_id: string | null
          referral_code: string | null
          share_url: string | null
        }
        Insert: {
          clicks?: number | null
          conversions?: number | null
          created_at?: string | null
          id?: string
          personality_type?: string | null
          platform: string
          quiz_response_id?: string | null
          referral_code?: string | null
          share_url?: string | null
        }
        Update: {
          clicks?: number | null
          conversions?: number | null
          created_at?: string | null
          id?: string
          personality_type?: string | null
          platform?: string
          quiz_response_id?: string | null
          referral_code?: string | null
          share_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_shares_quiz_response_id_fkey"
            columns: ["quiz_response_id"]
            isOneToOne: false
            referencedRelation: "quiz_responses"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "recipe_scaling_info"
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
            referencedRelation: "recipe_scaling_info"
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
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
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
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
          },
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
          default_servings: number | null
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
          servings_max: number | null
          servings_min: number | null
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
          default_servings?: number | null
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
          servings_max?: number | null
          servings_min?: number | null
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
          default_servings?: number | null
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
          servings_max?: number | null
          servings_min?: number | null
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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      report_insights: {
        Row: {
          color_scheme: string | null
          created_at: string | null
          description: string | null
          household_id: string | null
          icon_name: string | null
          id: string
          insight_type: string
          metric_label: string | null
          metric_value: number | null
          priority: number | null
          report_id: string | null
          title: string
        }
        Insert: {
          color_scheme?: string | null
          created_at?: string | null
          description?: string | null
          household_id?: string | null
          icon_name?: string | null
          id?: string
          insight_type: string
          metric_label?: string | null
          metric_value?: number | null
          priority?: number | null
          report_id?: string | null
          title: string
        }
        Update: {
          color_scheme?: string | null
          created_at?: string | null
          description?: string | null
          household_id?: string | null
          icon_name?: string | null
          id?: string
          insight_type?: string
          metric_label?: string | null
          metric_value?: number | null
          priority?: number | null
          report_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_insights_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_insights_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "recent_reports_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_insights_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_preferences: {
        Row: {
          auto_generate: boolean | null
          created_at: string | null
          email_delivery: boolean | null
          generation_day: string | null
          generation_time: string | null
          household_id: string | null
          id: string
          in_app_only: boolean | null
          include_comparisons: boolean | null
          include_cost_estimates: boolean | null
          include_kid_voting: boolean | null
          include_nutrition_details: boolean | null
          include_recommendations: boolean | null
          push_notification: boolean | null
          summary_level: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_generate?: boolean | null
          created_at?: string | null
          email_delivery?: boolean | null
          generation_day?: string | null
          generation_time?: string | null
          household_id?: string | null
          id?: string
          in_app_only?: boolean | null
          include_comparisons?: boolean | null
          include_cost_estimates?: boolean | null
          include_kid_voting?: boolean | null
          include_nutrition_details?: boolean | null
          include_recommendations?: boolean | null
          push_notification?: boolean | null
          summary_level?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_generate?: boolean | null
          created_at?: string | null
          email_delivery?: boolean | null
          generation_day?: string | null
          generation_time?: string | null
          household_id?: string | null
          id?: string
          in_app_only?: boolean | null
          include_comparisons?: boolean | null
          include_cost_estimates?: boolean | null
          include_kid_voting?: boolean | null
          include_nutrition_details?: boolean | null
          include_recommendations?: boolean | null
          push_notification?: boolean | null
          summary_level?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      report_trends: {
        Row: {
          created_at: string | null
          household_id: string | null
          id: string
          metric_name: string
          metric_value: number
          week_start_date: string
        }
        Insert: {
          created_at?: string | null
          household_id?: string | null
          id?: string
          metric_name: string
          metric_value: number
          week_start_date: string
        }
        Update: {
          created_at?: string | null
          household_id?: string | null
          id?: string
          metric_name?: string
          metric_value?: number
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_trends_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_churn_predictions: {
        Row: {
          churn_probability: number
          confidence_score: number | null
          created_at: string | null
          id: string
          last_calculated: string
          model_version: string | null
          prediction_expires: string
          previous_probability: number | null
          risk_factors: Json
          risk_level: string
          trend: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          churn_probability: number
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          last_calculated?: string
          model_version?: string | null
          prediction_expires?: string
          previous_probability?: number | null
          risk_factors?: Json
          risk_level: string
          trend?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          churn_probability?: number
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          last_calculated?: string
          model_version?: string | null
          prediction_expires?: string
          previous_probability?: number | null
          risk_factors?: Json
          risk_level?: string
          trend?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_churn_predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_churn_predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_churn_predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      revenue_cohorts: {
        Row: {
          acquisition_channel: string | null
          churn_reason: string | null
          churned_at: string | null
          cohort_month: string
          created_at: string | null
          id: string
          initial_mrr: number | null
          initial_plan: string | null
          total_payments: number | null
          total_revenue: number | null
          user_id: string
        }
        Insert: {
          acquisition_channel?: string | null
          churn_reason?: string | null
          churned_at?: string | null
          cohort_month: string
          created_at?: string | null
          id?: string
          initial_mrr?: number | null
          initial_plan?: string | null
          total_payments?: number | null
          total_revenue?: number | null
          user_id: string
        }
        Update: {
          acquisition_channel?: string | null
          churn_reason?: string | null
          churned_at?: string | null
          cohort_month?: string
          created_at?: string | null
          id?: string
          initial_mrr?: number | null
          initial_plan?: string | null
          total_payments?: number | null
          total_revenue?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_cohorts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_cohorts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_cohorts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      revenue_forecasts: {
        Row: {
          assumptions: Json
          confidence_level: number | null
          forecast_date: string
          forecast_month: string
          generated_at: string | null
          id: string
          predicted_arr: number
          predicted_churn_rate: number | null
          predicted_churned_customers: number | null
          predicted_mrr: number
          predicted_new_customers: number | null
          scenario: string
        }
        Insert: {
          assumptions?: Json
          confidence_level?: number | null
          forecast_date: string
          forecast_month: string
          generated_at?: string | null
          id?: string
          predicted_arr: number
          predicted_churn_rate?: number | null
          predicted_churned_customers?: number | null
          predicted_mrr: number
          predicted_new_customers?: number | null
          scenario: string
        }
        Update: {
          assumptions?: Json
          confidence_level?: number | null
          forecast_date?: string
          forecast_month?: string
          generated_at?: string | null
          id?: string
          predicted_arr?: number
          predicted_churn_rate?: number | null
          predicted_churned_customers?: number | null
          predicted_mrr?: number
          predicted_new_customers?: number | null
          scenario?: string
        }
        Relationships: []
      }
      revenue_interventions: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          conversion_achieved: boolean | null
          created_at: string | null
          engagement_score: number | null
          executed_at: string | null
          id: string
          intervention_type: string
          result_data: Json | null
          revenue_impact: number | null
          scheduled_for: string | null
          status: string
          trigger_data: Json | null
          triggered_at: string
          triggered_by: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          campaign_name?: string | null
          conversion_achieved?: boolean | null
          created_at?: string | null
          engagement_score?: number | null
          executed_at?: string | null
          id?: string
          intervention_type: string
          result_data?: Json | null
          revenue_impact?: number | null
          scheduled_for?: string | null
          status?: string
          trigger_data?: Json | null
          triggered_at?: string
          triggered_by?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          campaign_name?: string | null
          conversion_achieved?: boolean | null
          created_at?: string | null
          engagement_score?: number | null
          executed_at?: string | null
          id?: string
          intervention_type?: string
          result_data?: Json | null
          revenue_impact?: number | null
          scheduled_for?: string | null
          status?: string
          trigger_data?: Json | null
          triggered_at?: string
          triggered_by?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_interventions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_interventions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_interventions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      seo_alert_rules: {
        Row: {
          condition: Json
          created_at: string | null
          id: string
          is_enabled: boolean | null
          last_triggered_at: string | null
          notification_channels: Json | null
          rule_name: string
          rule_type: string
          severity: string | null
          throttle_minutes: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          condition: Json
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          last_triggered_at?: string | null
          notification_channels?: Json | null
          rule_name: string
          rule_type: string
          severity?: string | null
          throttle_minutes?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          condition?: Json
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          last_triggered_at?: string | null
          notification_channels?: Json | null
          rule_name?: string
          rule_type?: string
          severity?: string | null
          throttle_minutes?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      seo_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_rule_id: string | null
          alert_type: string
          created_at: string | null
          details: Json | null
          id: string
          message: string
          notifications_sent: Json | null
          resolved_at: string | null
          severity: string
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_rule_id?: string | null
          alert_type: string
          created_at?: string | null
          details?: Json | null
          id?: string
          message: string
          notifications_sent?: Json | null
          resolved_at?: string | null
          severity: string
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_rule_id?: string | null
          alert_type?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          message?: string
          notifications_sent?: Json | null
          resolved_at?: string | null
          severity?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_alerts_alert_rule_id_fkey"
            columns: ["alert_rule_id"]
            isOneToOne: false
            referencedRelation: "seo_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_audit_history: {
        Row: {
          accessibility_score: number
          audit_type: string
          created_at: string | null
          duration_ms: number | null
          failed_checks: number
          id: string
          mobile_score: number
          onpage_score: number
          overall_score: number
          passed_checks: number
          performance_score: number
          results: Json
          technical_score: number
          total_checks: number
          triggered_by: string | null
          url: string
          user_agent: string | null
          warning_checks: number
        }
        Insert: {
          accessibility_score: number
          audit_type?: string
          created_at?: string | null
          duration_ms?: number | null
          failed_checks: number
          id?: string
          mobile_score: number
          onpage_score: number
          overall_score: number
          passed_checks: number
          performance_score: number
          results: Json
          technical_score: number
          total_checks: number
          triggered_by?: string | null
          url: string
          user_agent?: string | null
          warning_checks: number
        }
        Update: {
          accessibility_score?: number
          audit_type?: string
          created_at?: string | null
          duration_ms?: number | null
          failed_checks?: number
          id?: string
          mobile_score?: number
          onpage_score?: number
          overall_score?: number
          passed_checks?: number
          performance_score?: number
          results?: Json
          technical_score?: number
          total_checks?: number
          triggered_by?: string | null
          url?: string
          user_agent?: string | null
          warning_checks?: number
        }
        Relationships: []
      }
      seo_audit_schedule_results: {
        Row: {
          audit_history_id: string | null
          created_at: string | null
          execution_time_ms: number | null
          failed_checks: number | null
          id: string
          issues_summary: Json | null
          new_issues_count: number | null
          overall_score: number | null
          passed_checks: number | null
          resolved_issues_count: number | null
          schedule_id: string | null
          score_change: number | null
          total_checks: number | null
          user_id: string
          warning_checks: number | null
        }
        Insert: {
          audit_history_id?: string | null
          created_at?: string | null
          execution_time_ms?: number | null
          failed_checks?: number | null
          id?: string
          issues_summary?: Json | null
          new_issues_count?: number | null
          overall_score?: number | null
          passed_checks?: number | null
          resolved_issues_count?: number | null
          schedule_id?: string | null
          score_change?: number | null
          total_checks?: number | null
          user_id: string
          warning_checks?: number | null
        }
        Update: {
          audit_history_id?: string | null
          created_at?: string | null
          execution_time_ms?: number | null
          failed_checks?: number | null
          id?: string
          issues_summary?: Json | null
          new_issues_count?: number | null
          overall_score?: number | null
          passed_checks?: number | null
          resolved_issues_count?: number | null
          schedule_id?: string | null
          score_change?: number | null
          total_checks?: number | null
          user_id?: string
          warning_checks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_audit_schedule_results_audit_history_id_fkey"
            columns: ["audit_history_id"]
            isOneToOne: false
            referencedRelation: "seo_audit_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_audit_schedule_results_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "seo_monitoring_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_audits: {
        Row: {
          accessibility_score: number | null
          audit_data: Json
          content_score: number | null
          created_at: string
          id: string
          issues_count: number | null
          mobile_score: number | null
          onpage_score: number | null
          overall_score: number
          passed_count: number | null
          performance_score: number | null
          security_score: number | null
          technical_score: number | null
          updated_at: string
          url: string
          user_id: string
          warnings_count: number | null
        }
        Insert: {
          accessibility_score?: number | null
          audit_data?: Json
          content_score?: number | null
          created_at?: string
          id?: string
          issues_count?: number | null
          mobile_score?: number | null
          onpage_score?: number | null
          overall_score: number
          passed_count?: number | null
          performance_score?: number | null
          security_score?: number | null
          technical_score?: number | null
          updated_at?: string
          url: string
          user_id: string
          warnings_count?: number | null
        }
        Update: {
          accessibility_score?: number | null
          audit_data?: Json
          content_score?: number | null
          created_at?: string
          id?: string
          issues_count?: number | null
          mobile_score?: number | null
          onpage_score?: number | null
          overall_score?: number
          passed_count?: number | null
          performance_score?: number | null
          security_score?: number | null
          technical_score?: number | null
          updated_at?: string
          url?: string
          user_id?: string
          warnings_count?: number | null
        }
        Relationships: []
      }
      seo_backlink_history: {
        Row: {
          backlink_id: string
          domain_authority: number | null
          http_status_code: number | null
          id: string
          page_authority: number | null
          recorded_at: string
          spam_score: number | null
          status: string | null
        }
        Insert: {
          backlink_id: string
          domain_authority?: number | null
          http_status_code?: number | null
          id?: string
          page_authority?: number | null
          recorded_at?: string
          spam_score?: number | null
          status?: string | null
        }
        Update: {
          backlink_id?: string
          domain_authority?: number | null
          http_status_code?: number | null
          id?: string
          page_authority?: number | null
          recorded_at?: string
          spam_score?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_backlink_history_backlink_id_fkey"
            columns: ["backlink_id"]
            isOneToOne: false
            referencedRelation: "seo_backlinks"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_backlinks: {
        Row: {
          anchor_text: string | null
          competitor_domain: string | null
          created_at: string
          data_source: string | null
          domain_authority: number | null
          domain_rating: number | null
          first_seen_at: string
          http_status_code: number | null
          id: string
          is_competitor_link: boolean | null
          is_image_link: boolean | null
          last_checked_at: string | null
          link_position: string | null
          link_type: string | null
          lost_at: string | null
          notes: string | null
          page_authority: number | null
          source_domain: string
          source_url: string
          spam_score: number | null
          status: string | null
          surrounding_text: string | null
          target_url: string
          trust_score: number | null
          updated_at: string
          url_rating: number | null
        }
        Insert: {
          anchor_text?: string | null
          competitor_domain?: string | null
          created_at?: string
          data_source?: string | null
          domain_authority?: number | null
          domain_rating?: number | null
          first_seen_at?: string
          http_status_code?: number | null
          id?: string
          is_competitor_link?: boolean | null
          is_image_link?: boolean | null
          last_checked_at?: string | null
          link_position?: string | null
          link_type?: string | null
          lost_at?: string | null
          notes?: string | null
          page_authority?: number | null
          source_domain: string
          source_url: string
          spam_score?: number | null
          status?: string | null
          surrounding_text?: string | null
          target_url: string
          trust_score?: number | null
          updated_at?: string
          url_rating?: number | null
        }
        Update: {
          anchor_text?: string | null
          competitor_domain?: string | null
          created_at?: string
          data_source?: string | null
          domain_authority?: number | null
          domain_rating?: number | null
          first_seen_at?: string
          http_status_code?: number | null
          id?: string
          is_competitor_link?: boolean | null
          is_image_link?: boolean | null
          last_checked_at?: string | null
          link_position?: string | null
          link_type?: string | null
          lost_at?: string | null
          notes?: string | null
          page_authority?: number | null
          source_domain?: string
          source_url?: string
          spam_score?: number | null
          status?: string | null
          surrounding_text?: string | null
          target_url?: string
          trust_score?: number | null
          updated_at?: string
          url_rating?: number | null
        }
        Relationships: []
      }
      seo_broken_links: {
        Row: {
          broken_url: string
          check_frequency_hours: number | null
          consecutive_failures: number | null
          created_at: string
          error_message: string | null
          first_detected_at: string
          http_status_code: number | null
          id: string
          impact_score: number | null
          last_checked_at: string
          link_position: string | null
          link_text: string | null
          link_type: string | null
          priority: string | null
          resolution_notes: string | null
          resolved_at: string | null
          source_page_url: string
          status: string | null
          suggested_replacement: string | null
          surrounding_context: string | null
          updated_at: string
        }
        Insert: {
          broken_url: string
          check_frequency_hours?: number | null
          consecutive_failures?: number | null
          created_at?: string
          error_message?: string | null
          first_detected_at?: string
          http_status_code?: number | null
          id?: string
          impact_score?: number | null
          last_checked_at?: string
          link_position?: string | null
          link_text?: string | null
          link_type?: string | null
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          source_page_url: string
          status?: string | null
          suggested_replacement?: string | null
          surrounding_context?: string | null
          updated_at?: string
        }
        Update: {
          broken_url?: string
          check_frequency_hours?: number | null
          consecutive_failures?: number | null
          created_at?: string
          error_message?: string | null
          first_detected_at?: string
          http_status_code?: number | null
          id?: string
          impact_score?: number | null
          last_checked_at?: string
          link_position?: string | null
          link_text?: string | null
          link_type?: string | null
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          source_page_url?: string
          status?: string | null
          suggested_replacement?: string | null
          surrounding_context?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seo_competitor_analysis: {
        Row: {
          analysis: Json
          analyzed_at: string | null
          analyzed_by_user_id: string | null
          competitive_advantage: string[] | null
          competitor_name: string | null
          competitor_url: string
          content_type: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          mobile_score: number | null
          onpage_score: number | null
          our_advantage: string[] | null
          our_score: number | null
          overall_score: number
          performance_score: number | null
          score_difference: number | null
          status_code: number | null
          technical_score: number | null
        }
        Insert: {
          analysis: Json
          analyzed_at?: string | null
          analyzed_by_user_id?: string | null
          competitive_advantage?: string[] | null
          competitor_name?: string | null
          competitor_url: string
          content_type?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          mobile_score?: number | null
          onpage_score?: number | null
          our_advantage?: string[] | null
          our_score?: number | null
          overall_score: number
          performance_score?: number | null
          score_difference?: number | null
          status_code?: number | null
          technical_score?: number | null
        }
        Update: {
          analysis?: Json
          analyzed_at?: string | null
          analyzed_by_user_id?: string | null
          competitive_advantage?: string[] | null
          competitor_name?: string | null
          competitor_url?: string
          content_type?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          mobile_score?: number | null
          onpage_score?: number | null
          our_advantage?: string[] | null
          our_score?: number | null
          overall_score?: number
          performance_score?: number | null
          score_difference?: number | null
          status_code?: number | null
          technical_score?: number | null
        }
        Relationships: []
      }
      seo_competitors: {
        Row: {
          competitor_name: string | null
          competitor_url: string
          created_at: string
          id: string
          last_audit_data: Json | null
          last_audit_score: number | null
          last_audited_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          competitor_name?: string | null
          competitor_url: string
          created_at?: string
          id?: string
          last_audit_data?: Json | null
          last_audit_score?: number | null
          last_audited_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          competitor_name?: string | null
          competitor_url?: string
          created_at?: string
          id?: string
          last_audit_data?: Json | null
          last_audit_score?: number | null
          last_audited_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seo_content_analysis: {
        Row: {
          ai_analysis_provider: string | null
          ai_score: number | null
          ai_suggestions: Json | null
          analyzed_at: string
          automated_readability_index: number | null
          avg_sentence_length: number | null
          avg_word_length: number | null
          broken_links_count: number | null
          coleman_liau_index: number | null
          competitor_avg_heading_count: number | null
          competitor_avg_word_count: number | null
          complex_words_percentage: number | null
          content_gap_analysis: Json | null
          content_type: string | null
          created_at: string
          external_links_count: number | null
          flesch_kincaid_grade: number | null
          flesch_reading_ease: number | null
          gunning_fog_index: number | null
          h1_count: number | null
          h2_count: number | null
          h3_count: number | null
          heading_structure_score: number | null
          id: string
          images_count: number | null
          images_optimized_count: number | null
          images_with_alt_count: number | null
          internal_links_count: number | null
          keyword_count: number | null
          keyword_density: number | null
          keyword_optimization_score: number | null
          keyword_variations: Json | null
          lsi_keywords: Json | null
          overall_content_score: number | null
          page_id: string | null
          page_url: string
          paragraph_count: number | null
          passive_voice_percentage: number | null
          readability_score: number | null
          sentence_count: number | null
          smog_index: number | null
          structure_score: number | null
          target_keyword: string | null
          transition_words_percentage: number | null
          word_count: number | null
        }
        Insert: {
          ai_analysis_provider?: string | null
          ai_score?: number | null
          ai_suggestions?: Json | null
          analyzed_at?: string
          automated_readability_index?: number | null
          avg_sentence_length?: number | null
          avg_word_length?: number | null
          broken_links_count?: number | null
          coleman_liau_index?: number | null
          competitor_avg_heading_count?: number | null
          competitor_avg_word_count?: number | null
          complex_words_percentage?: number | null
          content_gap_analysis?: Json | null
          content_type?: string | null
          created_at?: string
          external_links_count?: number | null
          flesch_kincaid_grade?: number | null
          flesch_reading_ease?: number | null
          gunning_fog_index?: number | null
          h1_count?: number | null
          h2_count?: number | null
          h3_count?: number | null
          heading_structure_score?: number | null
          id?: string
          images_count?: number | null
          images_optimized_count?: number | null
          images_with_alt_count?: number | null
          internal_links_count?: number | null
          keyword_count?: number | null
          keyword_density?: number | null
          keyword_optimization_score?: number | null
          keyword_variations?: Json | null
          lsi_keywords?: Json | null
          overall_content_score?: number | null
          page_id?: string | null
          page_url: string
          paragraph_count?: number | null
          passive_voice_percentage?: number | null
          readability_score?: number | null
          sentence_count?: number | null
          smog_index?: number | null
          structure_score?: number | null
          target_keyword?: string | null
          transition_words_percentage?: number | null
          word_count?: number | null
        }
        Update: {
          ai_analysis_provider?: string | null
          ai_score?: number | null
          ai_suggestions?: Json | null
          analyzed_at?: string
          automated_readability_index?: number | null
          avg_sentence_length?: number | null
          avg_word_length?: number | null
          broken_links_count?: number | null
          coleman_liau_index?: number | null
          competitor_avg_heading_count?: number | null
          competitor_avg_word_count?: number | null
          complex_words_percentage?: number | null
          content_gap_analysis?: Json | null
          content_type?: string | null
          created_at?: string
          external_links_count?: number | null
          flesch_kincaid_grade?: number | null
          flesch_reading_ease?: number | null
          gunning_fog_index?: number | null
          h1_count?: number | null
          h2_count?: number | null
          h3_count?: number | null
          heading_structure_score?: number | null
          id?: string
          images_count?: number | null
          images_optimized_count?: number | null
          images_with_alt_count?: number | null
          internal_links_count?: number | null
          keyword_count?: number | null
          keyword_density?: number | null
          keyword_optimization_score?: number | null
          keyword_variations?: Json | null
          lsi_keywords?: Json | null
          overall_content_score?: number | null
          page_id?: string | null
          page_url?: string
          paragraph_count?: number | null
          passive_voice_percentage?: number | null
          readability_score?: number | null
          sentence_count?: number | null
          smog_index?: number | null
          structure_score?: number | null
          target_keyword?: string | null
          transition_words_percentage?: number | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_content_analysis_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_core_web_vitals: {
        Row: {
          accessibility_score: number | null
          best_practices_score: number | null
          cls_status: string | null
          created_at: string
          desktop_cls: number | null
          desktop_fcp: number | null
          desktop_fid: number | null
          desktop_inp: number | null
          desktop_lcp: number | null
          desktop_performance_score: number | null
          desktop_speed_index: number | null
          desktop_tbt: number | null
          desktop_ttfb: number | null
          diagnostics: Json | null
          fid_status: string | null
          id: string
          inp_status: string | null
          lcp_status: string | null
          measured_at: string
          mobile_cls: number | null
          mobile_fcp: number | null
          mobile_fid: number | null
          mobile_inp: number | null
          mobile_lcp: number | null
          mobile_performance_score: number | null
          mobile_speed_index: number | null
          mobile_tbt: number | null
          mobile_ttfb: number | null
          opportunities: Json | null
          page_id: string | null
          page_url: string
          seo_score: number | null
        }
        Insert: {
          accessibility_score?: number | null
          best_practices_score?: number | null
          cls_status?: string | null
          created_at?: string
          desktop_cls?: number | null
          desktop_fcp?: number | null
          desktop_fid?: number | null
          desktop_inp?: number | null
          desktop_lcp?: number | null
          desktop_performance_score?: number | null
          desktop_speed_index?: number | null
          desktop_tbt?: number | null
          desktop_ttfb?: number | null
          diagnostics?: Json | null
          fid_status?: string | null
          id?: string
          inp_status?: string | null
          lcp_status?: string | null
          measured_at?: string
          mobile_cls?: number | null
          mobile_fcp?: number | null
          mobile_fid?: number | null
          mobile_inp?: number | null
          mobile_lcp?: number | null
          mobile_performance_score?: number | null
          mobile_speed_index?: number | null
          mobile_tbt?: number | null
          mobile_ttfb?: number | null
          opportunities?: Json | null
          page_id?: string | null
          page_url: string
          seo_score?: number | null
        }
        Update: {
          accessibility_score?: number | null
          best_practices_score?: number | null
          cls_status?: string | null
          created_at?: string
          desktop_cls?: number | null
          desktop_fcp?: number | null
          desktop_fid?: number | null
          desktop_inp?: number | null
          desktop_lcp?: number | null
          desktop_performance_score?: number | null
          desktop_speed_index?: number | null
          desktop_tbt?: number | null
          desktop_ttfb?: number | null
          diagnostics?: Json | null
          fid_status?: string | null
          id?: string
          inp_status?: string | null
          lcp_status?: string | null
          measured_at?: string
          mobile_cls?: number | null
          mobile_fcp?: number | null
          mobile_fid?: number | null
          mobile_inp?: number | null
          mobile_lcp?: number | null
          mobile_performance_score?: number | null
          mobile_speed_index?: number | null
          mobile_tbt?: number | null
          mobile_ttfb?: number | null
          opportunities?: Json | null
          page_id?: string | null
          page_url?: string
          seo_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_core_web_vitals_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_crawl_results: {
        Row: {
          avg_load_time: number | null
          avg_word_count: number | null
          crawl_results: Json
          crawled_at: string
          created_at: string
          critical_issues: number
          high_issues: number
          id: string
          link_graph: Json | null
          low_issues: number
          medium_issues: number
          orphaned_pages: number
          pages_crawled: number
          start_url: string
          total_issues: number
        }
        Insert: {
          avg_load_time?: number | null
          avg_word_count?: number | null
          crawl_results: Json
          crawled_at?: string
          created_at?: string
          critical_issues?: number
          high_issues?: number
          id?: string
          link_graph?: Json | null
          low_issues?: number
          medium_issues?: number
          orphaned_pages?: number
          pages_crawled: number
          start_url: string
          total_issues: number
        }
        Update: {
          avg_load_time?: number | null
          avg_word_count?: number | null
          crawl_results?: Json
          crawled_at?: string
          created_at?: string
          critical_issues?: number
          high_issues?: number
          id?: string
          link_graph?: Json | null
          low_issues?: number
          medium_issues?: number
          orphaned_pages?: number
          pages_crawled?: number
          start_url?: string
          total_issues?: number
        }
        Relationships: []
      }
      seo_duplicate_content: {
        Row: {
          analyzed_at: string
          analyzed_urls: string[]
          avg_word_count: number | null
          created_at: string
          duplicate_details: Json
          exact_duplicates: number
          id: string
          near_duplicates: number
          page_details: Json | null
          similar_pages: number
          thin_content: number
          total_issues: number
          total_pages: number
        }
        Insert: {
          analyzed_at?: string
          analyzed_urls: string[]
          avg_word_count?: number | null
          created_at?: string
          duplicate_details: Json
          exact_duplicates?: number
          id?: string
          near_duplicates?: number
          page_details?: Json | null
          similar_pages?: number
          thin_content?: number
          total_issues?: number
          total_pages: number
        }
        Update: {
          analyzed_at?: string
          analyzed_urls?: string[]
          avg_word_count?: number | null
          created_at?: string
          duplicate_details?: Json
          exact_duplicates?: number
          id?: string
          near_duplicates?: number
          page_details?: Json | null
          similar_pages?: number
          thin_content?: number
          total_issues?: number
          total_pages?: number
        }
        Relationships: []
      }
      seo_fixes_applied: {
        Row: {
          after_score: number | null
          ai_confidence: number | null
          ai_model: string | null
          ai_prompt: string | null
          applied_at: string | null
          applied_by_user_id: string | null
          applied_via: string | null
          audit_id: string | null
          before_score: number | null
          changes_made: Json | null
          fix_description: string
          fix_status: string
          fix_type: string
          id: string
          impact_level: string
          issue_category: string
          issue_description: string
          issue_item: string
          reverted_at: string | null
          verified_at: string | null
        }
        Insert: {
          after_score?: number | null
          ai_confidence?: number | null
          ai_model?: string | null
          ai_prompt?: string | null
          applied_at?: string | null
          applied_by_user_id?: string | null
          applied_via?: string | null
          audit_id?: string | null
          before_score?: number | null
          changes_made?: Json | null
          fix_description: string
          fix_status?: string
          fix_type: string
          id?: string
          impact_level: string
          issue_category: string
          issue_description: string
          issue_item: string
          reverted_at?: string | null
          verified_at?: string | null
        }
        Update: {
          after_score?: number | null
          ai_confidence?: number | null
          ai_model?: string | null
          ai_prompt?: string | null
          applied_at?: string | null
          applied_by_user_id?: string | null
          applied_via?: string | null
          audit_id?: string | null
          before_score?: number | null
          changes_made?: Json | null
          fix_description?: string
          fix_status?: string
          fix_type?: string
          id?: string
          impact_level?: string
          issue_category?: string
          issue_description?: string
          issue_item?: string
          reverted_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_fixes_applied_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "seo_audit_history"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_image_analysis: {
        Row: {
          analyzed_at: string
          avg_size: number
          created_at: string
          id: string
          image_details: Json
          images_without_alt: number
          images_without_dimensions: number
          lazy_loaded_images: number
          oversized_images: number
          total_images: number
          total_issues: number
          total_size: number
          unoptimized_formats: number
          url: string
        }
        Insert: {
          analyzed_at?: string
          avg_size?: number
          created_at?: string
          id?: string
          image_details: Json
          images_without_alt?: number
          images_without_dimensions?: number
          lazy_loaded_images?: number
          oversized_images?: number
          total_images: number
          total_issues?: number
          total_size?: number
          unoptimized_formats?: number
          url: string
        }
        Update: {
          analyzed_at?: string
          avg_size?: number
          created_at?: string
          id?: string
          image_details?: Json
          images_without_alt?: number
          images_without_dimensions?: number
          lazy_loaded_images?: number
          oversized_images?: number
          total_images?: number
          total_issues?: number
          total_size?: number
          unoptimized_formats?: number
          url?: string
        }
        Relationships: []
      }
      seo_keyword_history: {
        Row: {
          checked_at: string | null
          difficulty: number | null
          id: string
          keyword_id: string
          position: number
          search_volume: number | null
        }
        Insert: {
          checked_at?: string | null
          difficulty?: number | null
          id?: string
          keyword_id: string
          position: number
          search_volume?: number | null
        }
        Update: {
          checked_at?: string | null
          difficulty?: number | null
          id?: string
          keyword_id?: string
          position?: number
          search_volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_keyword_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "seo_keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_keyword_position_history: {
        Row: {
          check_method: string | null
          checked_at: string | null
          clicks: number | null
          created_at: string | null
          ctr: number | null
          data_source: string
          device: string | null
          id: string
          impressions: number | null
          keyword_id: string | null
          location: string | null
          position: number | null
          position_change: number | null
          previous_position: number | null
          search_engine: string | null
          user_id: string
        }
        Insert: {
          check_method?: string | null
          checked_at?: string | null
          clicks?: number | null
          created_at?: string | null
          ctr?: number | null
          data_source: string
          device?: string | null
          id?: string
          impressions?: number | null
          keyword_id?: string | null
          location?: string | null
          position?: number | null
          position_change?: number | null
          previous_position?: number | null
          search_engine?: string | null
          user_id: string
        }
        Update: {
          check_method?: string | null
          checked_at?: string | null
          clicks?: number | null
          created_at?: string | null
          ctr?: number | null
          data_source?: string
          device?: string | null
          id?: string
          impressions?: number | null
          keyword_id?: string | null
          location?: string | null
          position?: number | null
          position_change?: number | null
          previous_position?: number | null
          search_engine?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_keyword_position_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "seo_keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_keywords: {
        Row: {
          best_position: number | null
          clicks: number | null
          cpc: number | null
          created_at: string | null
          ctr: number | null
          current_position: number | null
          data_source: string | null
          difficulty: number | null
          gsc_last_updated: string | null
          gsc_position: number | null
          id: string
          impressions: number | null
          is_primary: boolean | null
          keyword: string
          last_checked_at: string | null
          notes: string | null
          position_trend: string | null
          priority: string | null
          search_volume: number | null
          target_url: string
          updated_at: string | null
          worst_position: number | null
        }
        Insert: {
          best_position?: number | null
          clicks?: number | null
          cpc?: number | null
          created_at?: string | null
          ctr?: number | null
          current_position?: number | null
          data_source?: string | null
          difficulty?: number | null
          gsc_last_updated?: string | null
          gsc_position?: number | null
          id?: string
          impressions?: number | null
          is_primary?: boolean | null
          keyword: string
          last_checked_at?: string | null
          notes?: string | null
          position_trend?: string | null
          priority?: string | null
          search_volume?: number | null
          target_url: string
          updated_at?: string | null
          worst_position?: number | null
        }
        Update: {
          best_position?: number | null
          clicks?: number | null
          cpc?: number | null
          created_at?: string | null
          ctr?: number | null
          current_position?: number | null
          data_source?: string | null
          difficulty?: number | null
          gsc_last_updated?: string | null
          gsc_position?: number | null
          id?: string
          impressions?: number | null
          is_primary?: boolean | null
          keyword?: string
          last_checked_at?: string | null
          notes?: string | null
          position_trend?: string | null
          priority?: string | null
          search_volume?: number | null
          target_url?: string
          updated_at?: string | null
          worst_position?: number | null
        }
        Relationships: []
      }
      seo_link_analysis: {
        Row: {
          analyzed_at: string
          authority_pages: number
          avg_depth: number
          avg_inbound_links: number
          avg_outbound_links: number
          created_at: string
          hub_pages: number
          id: string
          link_graph: Json
          max_depth: number
          orphaned_pages: number
          page_details: Json
          start_url: string
          total_links: number
          total_pages: number
        }
        Insert: {
          analyzed_at?: string
          authority_pages?: number
          avg_depth?: number
          avg_inbound_links?: number
          avg_outbound_links?: number
          created_at?: string
          hub_pages?: number
          id?: string
          link_graph: Json
          max_depth?: number
          orphaned_pages?: number
          page_details: Json
          start_url: string
          total_links: number
          total_pages: number
        }
        Update: {
          analyzed_at?: string
          authority_pages?: number
          avg_depth?: number
          avg_inbound_links?: number
          avg_outbound_links?: number
          created_at?: string
          hub_pages?: number
          id?: string
          link_graph?: Json
          max_depth?: number
          orphaned_pages?: number
          page_details?: Json
          start_url?: string
          total_links?: number
          total_pages?: number
        }
        Relationships: []
      }
      seo_mobile_analysis: {
        Row: {
          analyzed_at: string
          created_at: string
          grade: string
          high_issues: number
          id: string
          low_issues: number
          medium_issues: number
          mobile_checks: Json
          overall_score: number
          total_issues: number
          url: string
        }
        Insert: {
          analyzed_at?: string
          created_at?: string
          grade: string
          high_issues?: number
          id?: string
          low_issues?: number
          medium_issues?: number
          mobile_checks: Json
          overall_score?: number
          total_issues?: number
          url: string
        }
        Update: {
          analyzed_at?: string
          created_at?: string
          grade?: string
          high_issues?: number
          id?: string
          low_issues?: number
          medium_issues?: number
          mobile_checks?: Json
          overall_score?: number
          total_issues?: number
          url?: string
        }
        Relationships: []
      }
      seo_monitoring_log: {
        Row: {
          created_at: string | null
          details: Json | null
          error_message: string | null
          error_stack: string | null
          event_status: string
          event_type: string
          id: string
          message: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          error_stack?: string | null
          event_status: string
          event_type: string
          id?: string
          message?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          error_stack?: string | null
          event_status?: string
          event_type?: string
          id?: string
          message?: string | null
        }
        Relationships: []
      }
      seo_monitoring_schedules: {
        Row: {
          config: Json | null
          consecutive_failures: number | null
          created_at: string | null
          cron_expression: string
          id: string
          is_enabled: boolean | null
          last_error: string | null
          last_run_at: string | null
          last_run_details: Json | null
          last_run_status: string | null
          next_run_at: string | null
          run_count: number | null
          schedule_name: string
          schedule_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          config?: Json | null
          consecutive_failures?: number | null
          created_at?: string | null
          cron_expression: string
          id?: string
          is_enabled?: boolean | null
          last_error?: string | null
          last_run_at?: string | null
          last_run_details?: Json | null
          last_run_status?: string | null
          next_run_at?: string | null
          run_count?: number | null
          schedule_name: string
          schedule_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          config?: Json | null
          consecutive_failures?: number | null
          created_at?: string | null
          cron_expression?: string
          id?: string
          is_enabled?: boolean | null
          last_error?: string | null
          last_run_at?: string | null
          last_run_details?: Json | null
          last_run_status?: string | null
          next_run_at?: string | null
          run_count?: number | null
          schedule_name?: string
          schedule_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      seo_notification_log: {
        Row: {
          alert_id: string | null
          body: string | null
          channel: string
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          notification_type: string
          recipient: string
          retry_count: number | null
          sent_at: string | null
          status: string
          subject: string | null
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          body?: string | null
          channel: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_type: string
          recipient: string
          retry_count?: number | null
          sent_at?: string | null
          status: string
          subject?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string | null
          body?: string | null
          channel?: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_type?: string
          recipient?: string
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_notification_log_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "seo_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_notification_preferences: {
        Row: {
          created_at: string | null
          daily_digest: boolean | null
          daily_digest_time: string | null
          email_address: string | null
          email_enabled: boolean | null
          id: string
          immediate_alerts: boolean | null
          notify_broken_links: boolean | null
          notify_competitor_changes: boolean | null
          notify_gsc_issues: boolean | null
          notify_keyword_changes: boolean | null
          notify_performance_issues: boolean | null
          notify_score_drops: boolean | null
          slack_channel: string | null
          slack_enabled: boolean | null
          slack_webhook_url: string | null
          updated_at: string | null
          user_id: string
          weekly_digest: boolean | null
          weekly_digest_day: string | null
          weekly_digest_time: string | null
        }
        Insert: {
          created_at?: string | null
          daily_digest?: boolean | null
          daily_digest_time?: string | null
          email_address?: string | null
          email_enabled?: boolean | null
          id?: string
          immediate_alerts?: boolean | null
          notify_broken_links?: boolean | null
          notify_competitor_changes?: boolean | null
          notify_gsc_issues?: boolean | null
          notify_keyword_changes?: boolean | null
          notify_performance_issues?: boolean | null
          notify_score_drops?: boolean | null
          slack_channel?: string | null
          slack_enabled?: boolean | null
          slack_webhook_url?: string | null
          updated_at?: string | null
          user_id: string
          weekly_digest?: boolean | null
          weekly_digest_day?: string | null
          weekly_digest_time?: string | null
        }
        Update: {
          created_at?: string | null
          daily_digest?: boolean | null
          daily_digest_time?: string | null
          email_address?: string | null
          email_enabled?: boolean | null
          id?: string
          immediate_alerts?: boolean | null
          notify_broken_links?: boolean | null
          notify_competitor_changes?: boolean | null
          notify_gsc_issues?: boolean | null
          notify_keyword_changes?: boolean | null
          notify_performance_issues?: boolean | null
          notify_score_drops?: boolean | null
          slack_channel?: string | null
          slack_enabled?: boolean | null
          slack_webhook_url?: string | null
          updated_at?: string | null
          user_id?: string
          weekly_digest?: boolean | null
          weekly_digest_day?: string | null
          weekly_digest_time?: string | null
        }
        Relationships: []
      }
      seo_opportunities: {
        Row: {
          assigned_to: string | null
          clicks: number | null
          connection_id: string | null
          created_at: string | null
          current_ctr: number | null
          current_position: number | null
          detected_at: string | null
          estimated_impact: string | null
          expected_ctr: number | null
          id: string
          impressions: number | null
          notes: string | null
          opportunity_type: string
          page_path: string | null
          position_change: number | null
          previous_position: number | null
          priority: string | null
          query: string | null
          recommendation: string | null
          resolved_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          clicks?: number | null
          connection_id?: string | null
          created_at?: string | null
          current_ctr?: number | null
          current_position?: number | null
          detected_at?: string | null
          estimated_impact?: string | null
          expected_ctr?: number | null
          id?: string
          impressions?: number | null
          notes?: string | null
          opportunity_type: string
          page_path?: string | null
          position_change?: number | null
          previous_position?: number | null
          priority?: string | null
          query?: string | null
          recommendation?: string | null
          resolved_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          clicks?: number | null
          connection_id?: string | null
          created_at?: string | null
          current_ctr?: number | null
          current_position?: number | null
          detected_at?: string | null
          estimated_impact?: string | null
          expected_ctr?: number | null
          id?: string
          impressions?: number | null
          notes?: string | null
          opportunity_type?: string
          page_path?: string | null
          position_change?: number | null
          previous_position?: number | null
          priority?: string | null
          query?: string | null
          recommendation?: string | null
          resolved_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_opportunities_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_page_scores: {
        Row: {
          content_score: number | null
          created_at: string | null
          external_links_count: number | null
          has_canonical: boolean | null
          has_h1: boolean | null
          has_meta_description: boolean | null
          has_og_tags: boolean | null
          has_structured_data: boolean | null
          has_title_tag: boolean | null
          high_priority_issues: number | null
          id: string
          images_count: number | null
          images_with_alt_count: number | null
          internal_links_count: number | null
          issues: Json | null
          issues_count: number | null
          last_analyzed_at: string | null
          low_priority_issues: number | null
          medium_priority_issues: number | null
          mobile_score: number | null
          onpage_score: number | null
          overall_score: number
          page_title: string | null
          page_type: string | null
          page_url: string
          performance_score: number | null
          technical_score: number | null
          word_count: number | null
        }
        Insert: {
          content_score?: number | null
          created_at?: string | null
          external_links_count?: number | null
          has_canonical?: boolean | null
          has_h1?: boolean | null
          has_meta_description?: boolean | null
          has_og_tags?: boolean | null
          has_structured_data?: boolean | null
          has_title_tag?: boolean | null
          high_priority_issues?: number | null
          id?: string
          images_count?: number | null
          images_with_alt_count?: number | null
          internal_links_count?: number | null
          issues?: Json | null
          issues_count?: number | null
          last_analyzed_at?: string | null
          low_priority_issues?: number | null
          medium_priority_issues?: number | null
          mobile_score?: number | null
          onpage_score?: number | null
          overall_score: number
          page_title?: string | null
          page_type?: string | null
          page_url: string
          performance_score?: number | null
          technical_score?: number | null
          word_count?: number | null
        }
        Update: {
          content_score?: number | null
          created_at?: string | null
          external_links_count?: number | null
          has_canonical?: boolean | null
          has_h1?: boolean | null
          has_meta_description?: boolean | null
          has_og_tags?: boolean | null
          has_structured_data?: boolean | null
          has_title_tag?: boolean | null
          high_priority_issues?: number | null
          id?: string
          images_count?: number | null
          images_with_alt_count?: number | null
          internal_links_count?: number | null
          issues?: Json | null
          issues_count?: number | null
          last_analyzed_at?: string | null
          low_priority_issues?: number | null
          medium_priority_issues?: number | null
          mobile_score?: number | null
          onpage_score?: number | null
          overall_score?: number
          page_title?: string | null
          page_type?: string | null
          page_url?: string
          performance_score?: number | null
          technical_score?: number | null
          word_count?: number | null
        }
        Relationships: []
      }
      seo_pages: {
        Row: {
          created_at: string
          external_links: number | null
          h1_count: number | null
          id: string
          images_count: number | null
          images_with_alt: number | null
          internal_links: number | null
          issues_count: number | null
          last_audited_at: string | null
          last_score: number | null
          meta_description: string | null
          title: string | null
          updated_at: string
          url: string
          user_id: string
          word_count: number | null
        }
        Insert: {
          created_at?: string
          external_links?: number | null
          h1_count?: number | null
          id?: string
          images_count?: number | null
          images_with_alt?: number | null
          internal_links?: number | null
          issues_count?: number | null
          last_audited_at?: string | null
          last_score?: number | null
          meta_description?: string | null
          title?: string | null
          updated_at?: string
          url: string
          user_id: string
          word_count?: number | null
        }
        Update: {
          created_at?: string
          external_links?: number | null
          h1_count?: number | null
          id?: string
          images_count?: number | null
          images_with_alt?: number | null
          internal_links?: number | null
          issues_count?: number | null
          last_audited_at?: string | null
          last_score?: number | null
          meta_description?: string | null
          title?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          word_count?: number | null
        }
        Relationships: []
      }
      seo_performance_budget: {
        Row: {
          analyzed_at: string
          budget_settings: Json | null
          created_at: string
          id: string
          passed_budget: boolean
          resource_metrics: Json
          score: number
          third_party_resources: number
          total_page_size: number
          total_requests: number
          url: string
          violations: Json | null
          violations_count: number
        }
        Insert: {
          analyzed_at?: string
          budget_settings?: Json | null
          created_at?: string
          id?: string
          passed_budget?: boolean
          resource_metrics: Json
          score?: number
          third_party_resources?: number
          total_page_size: number
          total_requests: number
          url: string
          violations?: Json | null
          violations_count?: number
        }
        Update: {
          analyzed_at?: string
          budget_settings?: Json | null
          created_at?: string
          id?: string
          passed_budget?: boolean
          resource_metrics?: Json
          score?: number
          third_party_resources?: number
          total_page_size?: number
          total_requests?: number
          url?: string
          violations?: Json | null
          violations_count?: number
        }
        Relationships: []
      }
      seo_recommendations: {
        Row: {
          audit_id: string | null
          category: string
          created_at: string | null
          description: string
          effort: string | null
          id: string
          impact: string | null
          is_resolved: boolean | null
          resolved_at: string | null
          title: string
        }
        Insert: {
          audit_id?: string | null
          category: string
          created_at?: string | null
          description: string
          effort?: string | null
          id?: string
          impact?: string | null
          is_resolved?: boolean | null
          resolved_at?: string | null
          title: string
        }
        Update: {
          audit_id?: string | null
          category?: string
          created_at?: string | null
          description?: string
          effort?: string | null
          id?: string
          impact?: string | null
          is_resolved?: boolean | null
          resolved_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_recommendations_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "seo_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_redirect_analysis: {
        Row: {
          analyzed_at: string
          analyzed_urls: string[]
          avg_chain_length: number
          created_at: string
          id: string
          redirect_details: Json
          total_issues: number
          total_urls: number
          urls_with_chains: number
          urls_with_loops: number
          urls_with_redirects: number
        }
        Insert: {
          analyzed_at?: string
          analyzed_urls: string[]
          avg_chain_length?: number
          created_at?: string
          id?: string
          redirect_details: Json
          total_issues?: number
          total_urls: number
          urls_with_chains?: number
          urls_with_loops?: number
          urls_with_redirects?: number
        }
        Update: {
          analyzed_at?: string
          analyzed_urls?: string[]
          avg_chain_length?: number
          created_at?: string
          id?: string
          redirect_details?: Json
          total_issues?: number
          total_urls?: number
          urls_with_chains?: number
          urls_with_loops?: number
          urls_with_redirects?: number
        }
        Relationships: []
      }
      seo_security_analysis: {
        Row: {
          analyzed_at: string
          created_at: string
          critical_issues: number
          grade: string
          high_issues: number
          id: string
          is_https: boolean
          low_issues: number
          medium_issues: number
          overall_score: number
          protocol: string
          security_checks: Json
          total_issues: number
          url: string
        }
        Insert: {
          analyzed_at?: string
          created_at?: string
          critical_issues?: number
          grade: string
          high_issues?: number
          id?: string
          is_https?: boolean
          low_issues?: number
          medium_issues?: number
          overall_score?: number
          protocol: string
          security_checks: Json
          total_issues?: number
          url: string
        }
        Update: {
          analyzed_at?: string
          created_at?: string
          critical_issues?: number
          grade?: string
          high_issues?: number
          id?: string
          is_https?: boolean
          low_issues?: number
          medium_issues?: number
          overall_score?: number
          protocol?: string
          security_checks?: Json
          total_issues?: number
          url?: string
        }
        Relationships: []
      }
      seo_serp_tracking: {
        Row: {
          api_response: Json | null
          avg_description_length: number | null
          avg_title_length: number | null
          checked_at: string
          competitors: Json | null
          created_at: string
          data_source: string | null
          device: string | null
          featured_snippet_owner: string | null
          has_featured_snippet: boolean | null
          has_image_pack: boolean | null
          has_knowledge_panel: boolean | null
          has_local_pack: boolean | null
          has_people_also_ask: boolean | null
          has_video_carousel: boolean | null
          id: string
          keyword: string
          language: string | null
          location: string | null
          page_results: number | null
          position_change: number | null
          position_trend: string | null
          search_engine: string | null
          serp_features: Json | null
          total_results: number | null
          your_position: number | null
          your_url: string | null
        }
        Insert: {
          api_response?: Json | null
          avg_description_length?: number | null
          avg_title_length?: number | null
          checked_at?: string
          competitors?: Json | null
          created_at?: string
          data_source?: string | null
          device?: string | null
          featured_snippet_owner?: string | null
          has_featured_snippet?: boolean | null
          has_image_pack?: boolean | null
          has_knowledge_panel?: boolean | null
          has_local_pack?: boolean | null
          has_people_also_ask?: boolean | null
          has_video_carousel?: boolean | null
          id?: string
          keyword: string
          language?: string | null
          location?: string | null
          page_results?: number | null
          position_change?: number | null
          position_trend?: string | null
          search_engine?: string | null
          serp_features?: Json | null
          total_results?: number | null
          your_position?: number | null
          your_url?: string | null
        }
        Update: {
          api_response?: Json | null
          avg_description_length?: number | null
          avg_title_length?: number | null
          checked_at?: string
          competitors?: Json | null
          created_at?: string
          data_source?: string | null
          device?: string | null
          featured_snippet_owner?: string | null
          has_featured_snippet?: boolean | null
          has_image_pack?: boolean | null
          has_knowledge_panel?: boolean | null
          has_local_pack?: boolean | null
          has_people_also_ask?: boolean | null
          has_video_carousel?: boolean | null
          id?: string
          keyword?: string
          language?: string | null
          location?: string | null
          page_results?: number | null
          position_change?: number | null
          position_trend?: string | null
          search_engine?: string | null
          serp_features?: Json | null
          total_results?: number | null
          your_position?: number | null
          your_url?: string | null
        }
        Relationships: []
      }
      seo_settings: {
        Row: {
          auto_fix_enabled: boolean | null
          auto_heal_ai_enabled: boolean | null
          created_at: string | null
          description: string
          id: string
          keywords: string | null
          last_audit_at: string | null
          llms_txt: string | null
          monitoring_enabled: boolean | null
          monitoring_interval_minutes: number | null
          og_description: string | null
          og_image: string | null
          og_title: string | null
          og_url: string | null
          robots_txt: string | null
          sitemap_xml: string | null
          structured_data: Json | null
          title: string
          twitter_card: string | null
          twitter_creator: string | null
          twitter_site: string | null
          updated_at: string | null
        }
        Insert: {
          auto_fix_enabled?: boolean | null
          auto_heal_ai_enabled?: boolean | null
          created_at?: string | null
          description?: string
          id?: string
          keywords?: string | null
          last_audit_at?: string | null
          llms_txt?: string | null
          monitoring_enabled?: boolean | null
          monitoring_interval_minutes?: number | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          og_url?: string | null
          robots_txt?: string | null
          sitemap_xml?: string | null
          structured_data?: Json | null
          title?: string
          twitter_card?: string | null
          twitter_creator?: string | null
          twitter_site?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_fix_enabled?: boolean | null
          auto_heal_ai_enabled?: boolean | null
          created_at?: string | null
          description?: string
          id?: string
          keywords?: string | null
          last_audit_at?: string | null
          llms_txt?: string | null
          monitoring_enabled?: boolean | null
          monitoring_interval_minutes?: number | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          og_url?: string | null
          robots_txt?: string | null
          sitemap_xml?: string | null
          structured_data?: Json | null
          title?: string
          twitter_card?: string | null
          twitter_creator?: string | null
          twitter_site?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      seo_structured_data: {
        Row: {
          created_at: string
          has_structured_data: boolean
          id: string
          invalid_items: number
          issues: Json | null
          overall_score: number
          structured_data_items: Json | null
          total_items: number
          url: string
          valid_items: number
          validated_at: string
        }
        Insert: {
          created_at?: string
          has_structured_data?: boolean
          id?: string
          invalid_items?: number
          issues?: Json | null
          overall_score?: number
          structured_data_items?: Json | null
          total_items?: number
          url: string
          valid_items?: number
          validated_at?: string
        }
        Update: {
          created_at?: string
          has_structured_data?: boolean
          id?: string
          invalid_items?: number
          issues?: Json | null
          overall_score?: number
          structured_data_items?: Json | null
          total_items?: number
          url?: string
          valid_items?: number
          validated_at?: string
        }
        Relationships: []
      }
      seo_tracked_keywords: {
        Row: {
          created_at: string
          difficulty: number | null
          id: string
          keyword: string
          last_checked_at: string | null
          position: number | null
          previous_position: number | null
          search_volume: number | null
          target_url: string
          trend: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number | null
          id?: string
          keyword: string
          last_checked_at?: string | null
          position?: number | null
          previous_position?: number | null
          search_volume?: number | null
          target_url: string
          trend?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number | null
          id?: string
          keyword?: string
          last_checked_at?: string | null
          position?: number | null
          previous_position?: number | null
          search_volume?: number | null
          target_url?: string
          trend?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["subscription_id"]
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
      subscription_notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          created_at: string | null
          dismissed_at: string | null
          feature_type: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          title: string
          user_id: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          created_at?: string | null
          dismissed_at?: string | null
          feature_type?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          title: string
          user_id: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          created_at?: string | null
          dismissed_at?: string | null
          feature_type?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          title?: string
          user_id?: string
        }
        Relationships: []
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
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          stripe_product_id: string | null
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
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
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
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          support_level?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      suggestion_analytics: {
        Row: {
          acceptance_rate: number | null
          avg_confidence_score: number | null
          created_at: string | null
          date: string
          household_id: string | null
          id: string
          suggestions_accepted: number | null
          suggestions_generated: number | null
          suggestions_rejected: number | null
          top_match_factors: Json | null
        }
        Insert: {
          acceptance_rate?: number | null
          avg_confidence_score?: number | null
          created_at?: string | null
          date: string
          household_id?: string | null
          id?: string
          suggestions_accepted?: number | null
          suggestions_generated?: number | null
          suggestions_rejected?: number | null
          top_match_factors?: Json | null
        }
        Update: {
          acceptance_rate?: number | null
          avg_confidence_score?: number | null
          created_at?: string | null
          date?: string
          household_id?: string | null
          id?: string
          suggestions_accepted?: number | null
          suggestions_generated?: number | null
          suggestions_rejected?: number | null
          top_match_factors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_analytics_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestion_feedback: {
        Row: {
          created_at: string | null
          feedback_text: string | null
          feedback_type: string
          household_id: string | null
          id: string
          suggestion_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          feedback_text?: string | null
          feedback_type: string
          household_id?: string | null
          id?: string
          suggestion_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          feedback_text?: string | null
          feedback_type?: string
          household_id?: string | null
          id?: string
          suggestion_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_feedback_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_feedback_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "active_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_feedback_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "meal_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      suggestion_preferences: {
        Row: {
          allergens: Json | null
          allow_missing_ingredients: boolean | null
          auto_generate_suggestions: boolean | null
          avoid_difficult_recipes: boolean | null
          avoid_recent_recipes: boolean | null
          created_at: string | null
          current_season: string | null
          dietary_restrictions: Json | null
          household_id: string | null
          id: string
          max_cook_time: number | null
          max_missing_ingredients: number | null
          max_prep_time: number | null
          min_kid_approval: number | null
          prefer_new_recipes: boolean | null
          prefer_quick_meals: boolean | null
          prefer_seasonal: boolean | null
          preferred_difficulty: string[] | null
          prioritize_kid_favorites: boolean | null
          recent_recipe_window_days: number | null
          suggestion_frequency: string | null
          updated_at: string | null
          use_pantry_items: boolean | null
          user_id: string | null
        }
        Insert: {
          allergens?: Json | null
          allow_missing_ingredients?: boolean | null
          auto_generate_suggestions?: boolean | null
          avoid_difficult_recipes?: boolean | null
          avoid_recent_recipes?: boolean | null
          created_at?: string | null
          current_season?: string | null
          dietary_restrictions?: Json | null
          household_id?: string | null
          id?: string
          max_cook_time?: number | null
          max_missing_ingredients?: number | null
          max_prep_time?: number | null
          min_kid_approval?: number | null
          prefer_new_recipes?: boolean | null
          prefer_quick_meals?: boolean | null
          prefer_seasonal?: boolean | null
          preferred_difficulty?: string[] | null
          prioritize_kid_favorites?: boolean | null
          recent_recipe_window_days?: number | null
          suggestion_frequency?: string | null
          updated_at?: string | null
          use_pantry_items?: boolean | null
          user_id?: string | null
        }
        Update: {
          allergens?: Json | null
          allow_missing_ingredients?: boolean | null
          auto_generate_suggestions?: boolean | null
          avoid_difficult_recipes?: boolean | null
          avoid_recent_recipes?: boolean | null
          created_at?: string | null
          current_season?: string | null
          dietary_restrictions?: Json | null
          household_id?: string | null
          id?: string
          max_cook_time?: number | null
          max_missing_ingredients?: number | null
          max_prep_time?: number | null
          min_kid_approval?: number | null
          prefer_new_recipes?: boolean | null
          prefer_quick_meals?: boolean | null
          prefer_seasonal?: boolean | null
          preferred_difficulty?: string[] | null
          prioritize_kid_favorites?: boolean | null
          recent_recipe_window_days?: number | null
          suggestion_frequency?: string | null
          updated_at?: string | null
          use_pantry_items?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      support_kb_articles: {
        Row: {
          auto_generated: boolean | null
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          created_from_ticket_id: string | null
          generated_from_pattern: string | null
          helpful_count: number | null
          id: string
          not_helpful_count: number | null
          published_at: string | null
          related_article_ids: string[] | null
          search_vector: unknown
          status: string | null
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          updated_by: string | null
          view_count: number | null
        }
        Insert: {
          auto_generated?: boolean | null
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          created_from_ticket_id?: string | null
          generated_from_pattern?: string | null
          helpful_count?: number | null
          id?: string
          not_helpful_count?: number | null
          published_at?: string | null
          related_article_ids?: string[] | null
          search_vector?: unknown
          status?: string | null
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          updated_by?: string | null
          view_count?: number | null
        }
        Update: {
          auto_generated?: boolean | null
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          created_from_ticket_id?: string | null
          generated_from_pattern?: string | null
          helpful_count?: number | null
          id?: string
          not_helpful_count?: number | null
          published_at?: string | null
          related_article_ids?: string[] | null
          search_vector?: unknown
          status?: string | null
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          updated_by?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "support_kb_articles_created_from_ticket_id_fkey"
            columns: ["created_from_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_kb_articles_created_from_ticket_id_fkey"
            columns: ["created_from_ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      support_response_templates: {
        Row: {
          avg_resolution_time_hours: number | null
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          success_rate: number | null
          template_text: string
          updated_at: string | null
          usage_count: number | null
          variables: string[] | null
        }
        Insert: {
          avg_resolution_time_hours?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name: string
          success_rate?: number | null
          template_text: string
          updated_at?: string | null
          usage_count?: number | null
          variables?: string[] | null
        }
        Update: {
          avg_resolution_time_hours?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          success_rate?: number | null
          template_text?: string
          updated_at?: string | null
          usage_count?: number | null
          variables?: string[] | null
        }
        Relationships: []
      }
      support_ticket_ai_analysis: {
        Row: {
          affected_feature: string | null
          analysis_model: string | null
          analyzed_at: string | null
          auto_gathered_context: Json | null
          auto_resolution_confidence: number | null
          auto_resolvable: boolean | null
          created_at: string | null
          id: string
          issue_confidence: number | null
          issue_type: string | null
          response_template_id: string | null
          sentiment: string | null
          sentiment_score: number | null
          similar_ticket_ids: string[] | null
          similarity_scores: number[] | null
          suggested_response: string | null
          ticket_id: string
          updated_at: string | null
          urgency_score: number | null
        }
        Insert: {
          affected_feature?: string | null
          analysis_model?: string | null
          analyzed_at?: string | null
          auto_gathered_context?: Json | null
          auto_resolution_confidence?: number | null
          auto_resolvable?: boolean | null
          created_at?: string | null
          id?: string
          issue_confidence?: number | null
          issue_type?: string | null
          response_template_id?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          similar_ticket_ids?: string[] | null
          similarity_scores?: number[] | null
          suggested_response?: string | null
          ticket_id: string
          updated_at?: string | null
          urgency_score?: number | null
        }
        Update: {
          affected_feature?: string | null
          analysis_model?: string | null
          analyzed_at?: string | null
          auto_gathered_context?: Json | null
          auto_resolution_confidence?: number | null
          auto_resolvable?: boolean | null
          created_at?: string | null
          id?: string
          issue_confidence?: number | null
          issue_type?: string | null
          response_template_id?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          similar_ticket_ids?: string[] | null
          similarity_scores?: number[] | null
          suggested_response?: string | null
          ticket_id?: string
          updated_at?: string | null
          urgency_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_ai_analysis_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_ai_analysis_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_ratings: {
        Row: {
          ai_assisted: boolean | null
          auto_resolved: boolean | null
          created_at: string | null
          feedback_text: string | null
          id: string
          rating: number
          rating_category: string | null
          response_template_used: string | null
          ticket_id: string
        }
        Insert: {
          ai_assisted?: boolean | null
          auto_resolved?: boolean | null
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          rating: number
          rating_category?: string | null
          response_template_used?: string | null
          ticket_id: string
        }
        Update: {
          ai_assisted?: boolean | null
          auto_resolved?: boolean | null
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          rating?: number
          rating_category?: string | null
          response_template_used?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_ratings_response_template_used_fkey"
            columns: ["response_template_used"]
            isOneToOne: false
            referencedRelation: "support_response_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_ratings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_ratings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "ticket_queue"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_canned_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_canned_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
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
      tool_analytics: {
        Row: {
          ab_test_variant: string | null
          browser: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          event_data: Json | null
          event_type: string
          id: string
          ip_address: unknown
          page_url: string | null
          referrer_url: string | null
          region: string | null
          session_id: string
          time_on_page_seconds: number | null
          tool_name: string
          tool_version: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ab_test_variant?: string | null
          browser?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          page_url?: string | null
          referrer_url?: string | null
          region?: string | null
          session_id: string
          time_on_page_seconds?: number | null
          tool_name: string
          tool_version?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ab_test_variant?: string | null
          browser?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          page_url?: string | null
          referrer_url?: string | null
          region?: string | null
          session_id?: string
          time_on_page_seconds?: number | null
          tool_name?: string
          tool_version?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      traffic_forecasts: {
        Row: {
          based_on_data_from: string | null
          based_on_data_to: string | null
          confidence_level: number | null
          confidence_lower: number | null
          confidence_upper: number | null
          connection_id: string | null
          created_at: string | null
          forecast_date: string
          generated_at: string | null
          id: string
          metric_type: string
          model_accuracy: number | null
          model_type: string | null
          predicted_value: number | null
        }
        Insert: {
          based_on_data_from?: string | null
          based_on_data_to?: string | null
          confidence_level?: number | null
          confidence_lower?: number | null
          confidence_upper?: number | null
          connection_id?: string | null
          created_at?: string | null
          forecast_date: string
          generated_at?: string | null
          id?: string
          metric_type: string
          model_accuracy?: number | null
          model_type?: string | null
          predicted_value?: number | null
        }
        Update: {
          based_on_data_from?: string | null
          based_on_data_to?: string | null
          confidence_level?: number | null
          confidence_lower?: number | null
          confidence_upper?: number | null
          connection_id?: string | null
          created_at?: string | null
          forecast_date?: string
          generated_at?: string | null
          id?: string
          metric_type?: string
          model_accuracy?: number | null
          model_type?: string | null
          predicted_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "traffic_forecasts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_device_traffic: {
        Row: {
          avg_session_duration: number | null
          bounce_rate: number | null
          browser: string | null
          browser_version: string | null
          clicks: number | null
          connection_id: string | null
          created_at: string | null
          ctr: number | null
          date: string
          device_brand: string | null
          device_category: string
          device_model: string | null
          id: string
          impressions: number | null
          os: string | null
          os_version: string | null
          pageviews: number | null
          sessions: number | null
          updated_at: string | null
          users: number | null
        }
        Insert: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          browser?: string | null
          browser_version?: string | null
          clicks?: number | null
          connection_id?: string | null
          created_at?: string | null
          ctr?: number | null
          date: string
          device_brand?: string | null
          device_category: string
          device_model?: string | null
          id?: string
          impressions?: number | null
          os?: string | null
          os_version?: string | null
          pageviews?: number | null
          sessions?: number | null
          updated_at?: string | null
          users?: number | null
        }
        Update: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          browser?: string | null
          browser_version?: string | null
          clicks?: number | null
          connection_id?: string | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          device_brand?: string | null
          device_category?: string
          device_model?: string | null
          id?: string
          impressions?: number | null
          os?: string | null
          os_version?: string | null
          pageviews?: number | null
          sessions?: number | null
          updated_at?: string | null
          users?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_device_traffic_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_geographic_traffic: {
        Row: {
          avg_session_duration: number | null
          bounce_rate: number | null
          city: string | null
          clicks: number | null
          connection_id: string | null
          country_code: string
          country_name: string | null
          created_at: string | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          pageviews: number | null
          region: string | null
          sessions: number | null
          updated_at: string | null
          users: number | null
        }
        Insert: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          city?: string | null
          clicks?: number | null
          connection_id?: string | null
          country_code: string
          country_name?: string | null
          created_at?: string | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          pageviews?: number | null
          region?: string | null
          sessions?: number | null
          updated_at?: string | null
          users?: number | null
        }
        Update: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          city?: string | null
          clicks?: number | null
          connection_id?: string | null
          country_code?: string
          country_name?: string | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          pageviews?: number | null
          region?: string | null
          sessions?: number | null
          updated_at?: string | null
          users?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_geographic_traffic_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_page_performance: {
        Row: {
          avg_position: number | null
          avg_time_on_page: number | null
          bounce_rate: number | null
          clicks: number | null
          cls: number | null
          connection_id: string | null
          created_at: string | null
          ctr: number | null
          date: string
          exit_rate: number | null
          fid: number | null
          id: string
          impressions: number | null
          lcp: number | null
          page_path: string
          page_title: string | null
          pageviews: number | null
          sessions: number | null
          unique_pageviews: number | null
          updated_at: string | null
          users: number | null
        }
        Insert: {
          avg_position?: number | null
          avg_time_on_page?: number | null
          bounce_rate?: number | null
          clicks?: number | null
          cls?: number | null
          connection_id?: string | null
          created_at?: string | null
          ctr?: number | null
          date: string
          exit_rate?: number | null
          fid?: number | null
          id?: string
          impressions?: number | null
          lcp?: number | null
          page_path: string
          page_title?: string | null
          pageviews?: number | null
          sessions?: number | null
          unique_pageviews?: number | null
          updated_at?: string | null
          users?: number | null
        }
        Update: {
          avg_position?: number | null
          avg_time_on_page?: number | null
          bounce_rate?: number | null
          clicks?: number | null
          cls?: number | null
          connection_id?: string | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          exit_rate?: number | null
          fid?: number | null
          id?: string
          impressions?: number | null
          lcp?: number | null
          page_path?: string
          page_title?: string | null
          pageviews?: number | null
          sessions?: number | null
          unique_pageviews?: number | null
          updated_at?: string | null
          users?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_page_performance_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_query_performance: {
        Row: {
          avg_position: number | null
          clicks: number | null
          clicks_change: number | null
          connection_id: string | null
          country: string | null
          created_at: string | null
          ctr: number | null
          date: string
          device_type: string | null
          id: string
          impressions: number | null
          impressions_change: number | null
          landing_page: string | null
          position_change: number | null
          query: string
          updated_at: string | null
        }
        Insert: {
          avg_position?: number | null
          clicks?: number | null
          clicks_change?: number | null
          connection_id?: string | null
          country?: string | null
          created_at?: string | null
          ctr?: number | null
          date: string
          device_type?: string | null
          id?: string
          impressions?: number | null
          impressions_change?: number | null
          landing_page?: string | null
          position_change?: number | null
          query: string
          updated_at?: string | null
        }
        Update: {
          avg_position?: number | null
          clicks?: number | null
          clicks_change?: number | null
          connection_id?: string | null
          country?: string | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          device_type?: string | null
          id?: string
          impressions?: number | null
          impressions_change?: number | null
          landing_page?: string | null
          position_change?: number | null
          query?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_query_performance_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_traffic_metrics: {
        Row: {
          avg_position: number | null
          avg_session_duration: number | null
          bounce_rate: number | null
          clicks: number | null
          connection_id: string | null
          conversion_rate: number | null
          conversions: number | null
          created_at: string | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          new_users: number | null
          pages_per_session: number | null
          pageviews: number | null
          raw_data: Json | null
          sessions: number | null
          updated_at: string | null
          users: number | null
        }
        Insert: {
          avg_position?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          clicks?: number | null
          connection_id?: string | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          new_users?: number | null
          pages_per_session?: number | null
          pageviews?: number | null
          raw_data?: Json | null
          sessions?: number | null
          updated_at?: string | null
          users?: number | null
        }
        Update: {
          avg_position?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          clicks?: number | null
          connection_id?: string | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          new_users?: number | null
          pages_per_session?: number | null
          pageviews?: number | null
          raw_data?: Json | null
          sessions?: number | null
          updated_at?: string | null
          users?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_traffic_metrics_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_traffic_sources: {
        Row: {
          avg_session_duration: number | null
          bounce_rate: number | null
          campaign: string | null
          connection_id: string | null
          conversion_rate: number | null
          conversions: number | null
          created_at: string | null
          date: string
          id: string
          medium: string | null
          new_users: number | null
          pages_per_session: number | null
          pageviews: number | null
          referral_path: string | null
          sessions: number | null
          source: string | null
          source_medium: string
          updated_at: string | null
          users: number | null
        }
        Insert: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          campaign?: string | null
          connection_id?: string | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string | null
          date: string
          id?: string
          medium?: string | null
          new_users?: number | null
          pages_per_session?: number | null
          pageviews?: number | null
          referral_path?: string | null
          sessions?: number | null
          source?: string | null
          source_medium: string
          updated_at?: string | null
          users?: number | null
        }
        Update: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          campaign?: string | null
          connection_id?: string | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string | null
          date?: string
          id?: string
          medium?: string | null
          new_users?: number | null
          pages_per_session?: number | null
          pageviews?: number | null
          referral_path?: string | null
          sessions?: number | null
          source?: string | null
          source_medium?: string
          updated_at?: string | null
          users?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_traffic_sources_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "analytics_platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_alerts: {
        Row: {
          feature_type: string
          id: string
          notified: boolean | null
          threshold_percentage: number
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          feature_type: string
          id?: string
          notified?: boolean | null
          threshold_percentage: number
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          feature_type?: string
          id?: string
          notified?: boolean | null
          threshold_percentage?: number
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_delivery_accounts: {
        Row: {
          access_token: string | null
          account_email: string | null
          api_key: string | null
          connection_status: string | null
          created_at: string | null
          default_delivery_window: string | null
          household_id: string | null
          id: string
          is_connected: boolean | null
          last_connected_at: string | null
          preferred_store_id: string | null
          preferred_store_name: string | null
          provider_id: string | null
          provider_user_id: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          api_key?: string | null
          connection_status?: string | null
          created_at?: string | null
          default_delivery_window?: string | null
          household_id?: string | null
          id?: string
          is_connected?: boolean | null
          last_connected_at?: string | null
          preferred_store_id?: string | null
          preferred_store_name?: string | null
          provider_id?: string | null
          provider_user_id?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          api_key?: string | null
          connection_status?: string | null
          created_at?: string | null
          default_delivery_window?: string | null
          household_id?: string | null
          id?: string
          is_connected?: boolean | null
          last_connected_at?: string | null
          preferred_store_id?: string | null
          preferred_store_name?: string | null
          provider_id?: string | null
          provider_user_id?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_delivery_accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_delivery_accounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "delivery_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_delivery_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_delivery_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_delivery_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_email_sequences: {
        Row: {
          canceled_at: string | null
          completed_at: string | null
          current_step: number | null
          enrolled_at: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          sequence_id: string
          user_id: string | null
        }
        Insert: {
          canceled_at?: string | null
          completed_at?: string | null
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          sequence_id: string
          user_id?: string | null
        }
        Update: {
          canceled_at?: string | null
          completed_at?: string | null
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          sequence_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_email_sequences_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_email_sequences_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
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
          billing_cycle: string | null
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
          billing_cycle?: string | null
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
          billing_cycle?: string | null
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
      voting_achievements: {
        Row: {
          achievement_description: string | null
          achievement_name: string
          achievement_type: string
          icon_name: string | null
          id: string
          kid_id: string | null
          points_earned: number | null
          unlocked_at: string | null
        }
        Insert: {
          achievement_description?: string | null
          achievement_name: string
          achievement_type: string
          icon_name?: string | null
          id?: string
          kid_id?: string | null
          points_earned?: number | null
          unlocked_at?: string | null
        }
        Update: {
          achievement_description?: string | null
          achievement_name?: string
          achievement_type?: string
          icon_name?: string | null
          id?: string
          kid_id?: string | null
          points_earned?: number | null
          unlocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voting_achievements_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid_food_success_stats"
            referencedColumns: ["kid_id"]
          },
          {
            foreignKeyName: "voting_achievements_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      voting_sessions: {
        Row: {
          allow_suggestions: boolean | null
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string
          household_id: string | null
          id: string
          meal_slots: string[] | null
          opened_at: string | null
          participation_rate: number | null
          require_reason: boolean | null
          session_name: string
          start_date: string
          status: string | null
          total_meals: number | null
          total_votes: number | null
          updated_at: string | null
        }
        Insert: {
          allow_suggestions?: boolean | null
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date: string
          household_id?: string | null
          id?: string
          meal_slots?: string[] | null
          opened_at?: string | null
          participation_rate?: number | null
          require_reason?: boolean | null
          session_name: string
          start_date: string
          status?: string | null
          total_meals?: number | null
          total_votes?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_suggestions?: boolean | null
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string
          household_id?: string | null
          id?: string
          meal_slots?: string[] | null
          opened_at?: string | null
          participation_rate?: number | null
          require_reason?: boolean | null
          session_name?: string
          start_date?: string
          status?: string | null
          total_meals?: number | null
          total_votes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voting_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voting_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voting_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "voting_sessions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
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
      weekly_reports: {
        Row: {
          achievements_unlocked: number | null
          avg_calories_per_day: number | null
          avg_carbs_per_day: number | null
          avg_fat_per_day: number | null
          avg_meal_approval_score: number | null
          avg_protein_per_day: number | null
          created_at: string | null
          estimated_grocery_cost: number | null
          generated_at: string | null
          grocery_completion_rate: number | null
          grocery_items_added: number | null
          grocery_items_purchased: number | null
          healthiest_meals: Json | null
          household_id: string | null
          id: string
          insights: Json | null
          kids_voted: number | null
          least_loved_meals: Json | null
          meals_completed: number | null
          meals_planned: number | null
          most_loved_meals: Json | null
          most_used_recipes: Json | null
          new_recipes_tried: number | null
          nutrition_goals_met: number | null
          nutrition_goals_total: number | null
          nutrition_score: number | null
          planning_completion_rate: number | null
          recipe_diversity_score: number | null
          recipe_repeats: number | null
          recommendations: Json | null
          report_version: number | null
          sent_at: string | null
          status: string | null
          templates_used: number | null
          time_saved_minutes: number | null
          total_kids: number | null
          total_votes_cast: number | null
          unique_recipes_used: number | null
          updated_at: string | null
          viewed_at: string | null
          voting_participation_rate: number | null
          week_end_date: string
          week_start_date: string
        }
        Insert: {
          achievements_unlocked?: number | null
          avg_calories_per_day?: number | null
          avg_carbs_per_day?: number | null
          avg_fat_per_day?: number | null
          avg_meal_approval_score?: number | null
          avg_protein_per_day?: number | null
          created_at?: string | null
          estimated_grocery_cost?: number | null
          generated_at?: string | null
          grocery_completion_rate?: number | null
          grocery_items_added?: number | null
          grocery_items_purchased?: number | null
          healthiest_meals?: Json | null
          household_id?: string | null
          id?: string
          insights?: Json | null
          kids_voted?: number | null
          least_loved_meals?: Json | null
          meals_completed?: number | null
          meals_planned?: number | null
          most_loved_meals?: Json | null
          most_used_recipes?: Json | null
          new_recipes_tried?: number | null
          nutrition_goals_met?: number | null
          nutrition_goals_total?: number | null
          nutrition_score?: number | null
          planning_completion_rate?: number | null
          recipe_diversity_score?: number | null
          recipe_repeats?: number | null
          recommendations?: Json | null
          report_version?: number | null
          sent_at?: string | null
          status?: string | null
          templates_used?: number | null
          time_saved_minutes?: number | null
          total_kids?: number | null
          total_votes_cast?: number | null
          unique_recipes_used?: number | null
          updated_at?: string | null
          viewed_at?: string | null
          voting_participation_rate?: number | null
          week_end_date: string
          week_start_date: string
        }
        Update: {
          achievements_unlocked?: number | null
          avg_calories_per_day?: number | null
          avg_carbs_per_day?: number | null
          avg_fat_per_day?: number | null
          avg_meal_approval_score?: number | null
          avg_protein_per_day?: number | null
          created_at?: string | null
          estimated_grocery_cost?: number | null
          generated_at?: string | null
          grocery_completion_rate?: number | null
          grocery_items_added?: number | null
          grocery_items_purchased?: number | null
          healthiest_meals?: Json | null
          household_id?: string | null
          id?: string
          insights?: Json | null
          kids_voted?: number | null
          least_loved_meals?: Json | null
          meals_completed?: number | null
          meals_planned?: number | null
          most_loved_meals?: Json | null
          most_used_recipes?: Json | null
          new_recipes_tried?: number | null
          nutrition_goals_met?: number | null
          nutrition_goals_total?: number | null
          nutrition_score?: number | null
          planning_completion_rate?: number | null
          recipe_diversity_score?: number | null
          recipe_repeats?: number | null
          recommendations?: Json | null
          report_version?: number | null
          sent_at?: string | null
          status?: string | null
          templates_used?: number | null
          time_saved_minutes?: number | null
          total_kids?: number | null
          total_votes_cast?: number | null
          unique_recipes_used?: number | null
          updated_at?: string | null
          viewed_at?: string | null
          voting_participation_rate?: number | null
          week_end_date?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_suggestions: {
        Row: {
          accepted_at: string | null
          based_on_pantry: boolean | null
          based_on_preferences: boolean | null
          based_on_season: boolean | null
          based_on_variety: boolean | null
          based_on_votes: boolean | null
          confidence_score: number | null
          created_at: string | null
          difficulty: string | null
          estimated_cook_time: number | null
          estimated_prep_time: number | null
          expires_at: string | null
          feedback_count: number | null
          feedback_rating: number | null
          feedback_text: string | null
          household_id: string | null
          id: string | null
          match_factors: Json | null
          meal_slot: string | null
          predicted_kid_approval: number | null
          reasoning: string | null
          recipe_description: string | null
          recipe_id: string | null
          recipe_image: string | null
          recipe_name: string | null
          recipe_servings: string | null
          rejected_at: string | null
          status: string | null
          suggested_for_date: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_suggestions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_suggestions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_scaling_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_suggestions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_success_stats"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "meal_suggestions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
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
      admin_user_intelligence: {
        Row: {
          account_age_days: number | null
          achievements_30d: number | null
          at_risk_errors: boolean | null
          at_risk_inactive: boolean | null
          at_risk_payment: boolean | null
          avg_resolution_hours: number | null
          cancel_at_period_end: boolean | null
          closed_tickets: number | null
          created_at: string | null
          email: string | null
          errors_7d: number | null
          estimated_ltv: number | null
          features_adopted: number | null
          food_attempts_30d: number | null
          foods_30d: number | null
          health_score: number | null
          health_status: string | null
          id: string | null
          kids_count: number | null
          last_activity: string | null
          last_login: string | null
          last_ticket_date: string | null
          logins_30d: number | null
          logins_7d: number | null
          meal_plans_30d: number | null
          mrr: number | null
          name: string | null
          next_billing_date: string | null
          open_tickets: number | null
          recipes_30d: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_id: string | null
          subscription_status: string | null
          total_tickets: number | null
          user_tier: string | null
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
      auth_users_exposure_check: {
        Row: {
          definition: string | null
          schemaname: unknown
          viewname: unknown
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
      blog_popular_posts: {
        Row: {
          avg_engagement: number | null
          avg_time: number | null
          comment_count: number | null
          excerpt: string | null
          featured_image_url: string | null
          id: string | null
          slug: string | null
          title: string | null
          total_views: number | null
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
      recent_reports_summary: {
        Row: {
          avg_meal_approval_score: number | null
          generated_at: string | null
          household_id: string | null
          id: string | null
          insight_count: number | null
          meals_planned: number | null
          nutrition_score: number | null
          planning_completion_rate: number | null
          status: string | null
          viewed_at: string | null
          voting_participation_rate: number | null
          week_end_date: string | null
          week_start_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_scaling_info: {
        Row: {
          default_servings: number | null
          id: string | null
          name: string | null
          scaling_options_count: number | null
          servings: string | null
          servings_max: number | null
          servings_min: number | null
        }
        Insert: {
          default_servings?: number | null
          id?: string | null
          name?: string | null
          scaling_options_count?: never
          servings?: string | null
          servings_max?: number | null
          servings_min?: number | null
        }
        Update: {
          default_servings?: number | null
          id?: string | null
          name?: string | null
          scaling_options_count?: never
          servings?: string | null
          servings_max?: number | null
          servings_min?: number | null
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
      revenue_cohort_retention: {
        Row: {
          avg_ltv: number | null
          cohort_initial_mrr: number | null
          cohort_month: string | null
          cohort_size: number | null
          m0_mrr: number | null
          m0_retention_pct: number | null
          m1_mrr: number | null
          m1_retention_pct: number | null
          m2_mrr: number | null
          m2_retention_pct: number | null
          m3_mrr: number | null
          m3_retention_pct: number | null
          m6_mrr: number | null
          m6_retention_pct: number | null
        }
        Relationships: []
      }
      revenue_metrics_daily: {
        Row: {
          active_subscriptions: number | null
          arr: number | null
          churn_rate_pct: number | null
          churned_mrr_today: number | null
          churned_subscriptions_today: number | null
          metric_date: string | null
          mrr: number | null
          mrr_growth_pct: number | null
          net_new_mrr: number | null
          new_mrr_today: number | null
          new_subscriptions_today: number | null
        }
        Relationships: []
      }
      support_performance_metrics: {
        Row: {
          ai_assisted_tickets: number | null
          auto_resolvable_tickets: number | null
          auto_resolved_tickets: number | null
          avg_csat_ai_assisted: number | null
          avg_csat_auto_resolved: number | null
          avg_csat_rating: number | null
          avg_resolution_hours: number | null
          issue_breakdown: Json | null
          metric_date: string | null
          resolved_tickets: number | null
          total_tickets: number | null
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
            referencedRelation: "admin_user_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_engagement_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      top_performing_queries: {
        Row: {
          avg_ctr: number | null
          avg_position: number | null
          last_seen_date: string | null
          platforms_count: number | null
          query: string | null
          total_clicks: number | null
          total_impressions: number | null
          user_id: string | null
        }
        Relationships: []
      }
      unified_daily_summary: {
        Row: {
          avg_bounce_rate: number | null
          avg_ctr: number | null
          avg_position: number | null
          avg_session_duration: number | null
          connected_platforms: number | null
          date: string | null
          total_clicks: number | null
          total_impressions: number | null
          total_new_users: number | null
          total_pageviews: number | null
          total_sessions: number | null
          total_users: number | null
          user_id: string | null
        }
        Relationships: []
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
            referencedRelation: "recipe_scaling_info"
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
      user_engagement_stats: {
        Row: {
          achievements_30d: number | null
          errors_7d: number | null
          features_adopted: number | null
          food_attempts_30d: number | null
          foods_30d: number | null
          last_activity: string | null
          last_login: string | null
          logins_30d: number | null
          logins_7d: number | null
          meal_plans_30d: number | null
          recipes_30d: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_subscription_dashboard: {
        Row: {
          billing_cycle: string | null
          cancel_at_period_end: boolean | null
          complementary_details: Json | null
          complementary_subscription_id: string | null
          current_period_end: string | null
          days_until_renewal: number | null
          is_complementary: boolean | null
          plan_id: string | null
          plan_name: string | null
          status: string | null
          trial_end: string | null
          unread_notifications_count: number | null
          user_id: string | null
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
        ]
      }
      user_ticket_summary: {
        Row: {
          avg_resolution_hours: number | null
          closed_count: number | null
          last_ticket_date: string | null
          open_count: number | null
          total_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_meal_suggestion: {
        Args: { p_kid_ids: string[]; p_suggestion_id: string }
        Returns: Json
      }
      apply_internal_link: {
        Args: { p_post_id: string; p_updated_content: string }
        Returns: boolean
      }
      auto_add_restock_items: {
        Args: { p_kid_id?: string; p_user_id: string }
        Returns: number
      }
      calculate_churn_probability: {
        Args: { p_user_id: string }
        Returns: number
      }
      calculate_enhanced_lead_score: {
        Args: { p_lead_id: string }
        Returns: number
      }
      calculate_food_similarity: {
        Args: { food1_id: string; food2_id: string }
        Returns: number
      }
      calculate_keyword_trend: {
        Args: { keyword_id_param: string }
        Returns: string
      }
      calculate_lead_score: { Args: { lead_id: string }; Returns: number }
      calculate_template_success_rate: {
        Args: { template_id_input: string }
        Returns: number
      }
      calculate_user_health_score: {
        Args: { p_user_id: string }
        Returns: number
      }
      can_add_child: { Args: { user_uuid: string }; Returns: boolean }
      check_admin_or_error: { Args: never; Returns: undefined }
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
      check_voting_achievements: {
        Args: { p_kid_id: string }
        Returns: undefined
      }
      cleanup_expired_backups: {
        Args: never
        Returns: {
          deleted_count: number
          freed_bytes: number
        }[]
      }
      cleanup_old_activity_logs: { Args: never; Returns: undefined }
      cleanup_rate_limits: { Args: never; Returns: number }
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
      create_order_from_grocery_list: {
        Args: {
          p_delivery_type?: string
          p_household_id: string
          p_provider_id: string
          p_user_id: string
        }
        Returns: Json
      }
      create_seo_alert: {
        Args: {
          p_alert_type: string
          p_details?: Json
          p_message: string
          p_rule_id: string
          p_severity: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      create_usage_alert: {
        Args: {
          p_feature_type: string
          p_threshold_percentage: number
          p_user_id: string
        }
        Returns: undefined
      }
      deduct_food_quantity: {
        Args: { _amount?: number; _food_id: string }
        Returns: undefined
      }
      detect_error_spike: { Args: never; Returns: undefined }
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
      detect_stale_content: {
        Args: never
        Returns: {
          days_since_update: number
          last_refresh: string
          organic_traffic_30d: number
          post_id: string
          post_title: string
        }[]
      }
      enroll_in_email_sequence: {
        Args: {
          p_lead_id?: string
          p_sequence_id?: string
          p_trigger_conditions?: Json
          p_trigger_event?: string
          p_user_id?: string
        }
        Returns: string
      }
      evaluate_feature_flag: {
        Args: { p_flag_key: string; p_user_id: string }
        Returns: boolean
      }
      extract_keywords: { Args: { text_content: string }; Returns: string[] }
      extract_user_backup_data: { Args: { p_user_id: string }; Returns: Json }
      find_similar_tickets: {
        Args: { p_limit?: number; p_ticket_id: string }
        Returns: {
          resolution_summary: string
          resolution_time_hours: number
          similar_ticket_id: string
          similarity_score: number
        }[]
      }
      format_quantity: { Args: { quantity: number }; Returns: string }
      gather_ticket_user_context: { Args: { p_user_id: string }; Returns: Json }
      generate_content_hash: { Args: { content_text: string }; Returns: string }
      generate_referral_code: { Args: never; Returns: string }
      get_active_alerts_count: { Args: { p_user_id: string }; Returns: number }
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
      get_admin_ai_usage: {
        Args: never
        Returns: {
          avg_requests_per_user: number
          description: string
          endpoint: string
          last_request_at: string
          peak_requests_per_minute: number
          requests_24h: number
          requests_7d: number
          total_requests: number
          unique_users: number
        }[]
      }
      get_admin_content_quality: {
        Args: never
        Returns: {
          added_30d: number
          added_7d: number
          avg_name_length: number
          content_type: string
          items_with_metadata: number
          quality_indicator: number
          total_items: number
        }[]
      }
      get_admin_daily_activity: {
        Args: never
        Returns: {
          achievements_earned: number
          active_users: number
          date: string
          food_attempts_created: number
          foods_added: number
          meals_logged: number
          plan_entries_created: number
          recipes_created: number
          successful_attempts: number
        }[]
      }
      get_admin_error_tracking: {
        Args: never
        Returns: {
          error_count: number
          error_type: string
          last_occurrence: string
          recent_errors: Json
        }[]
      }
      get_admin_platform_health: {
        Args: never
        Returns: {
          achievements_7d: number
          active_users_30d: number
          active_users_7d: number
          failed_backups_24h: number
          failed_emails_24h: number
          new_users_30d: number
          new_users_7d: number
          rate_limit_hits_1h: number
          snapshot_at: string
          successful_attempts_7d: number
          total_food_attempts: number
          total_foods: number
          total_kids: number
          total_plan_entries: number
          total_recipes: number
          total_users: number
        }[]
      }
      get_admin_user_engagement: {
        Args: never
        Returns: {
          engagement_score: number
          foods_count: number
          full_name: string
          joined_at: string
          kids_count: number
          last_attempt_date: string
          last_plan_date: string
          recipes_count: number
          total_food_attempts: number
          total_plan_entries: number
          user_id: string
          user_tier: string
        }[]
      }
      get_backlink_summary: {
        Args: never
        Returns: {
          active_backlinks: number
          avg_domain_authority: number
          lost_backlinks: number
          new_backlinks_30d: number
          total_backlinks: number
          toxic_backlinks: number
        }[]
      }
      get_blog_generation_insights: {
        Args: never
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
        Args: never
        Returns: {
          draft_posts: number
          published_posts: number
          scheduled_posts: number
          total_comments: number
          total_posts: number
          total_views: number
        }[]
      }
      get_broken_links_by_priority: {
        Args: never
        Returns: {
          avg_impact_score: number
          count: number
          priority: string
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
      get_complementary_subscription: {
        Args: { p_user_id: string }
        Returns: {
          end_date: string
          id: string
          is_permanent: boolean
          plan_id: string
          plan_name: string
          reason: string
        }[]
      }
      get_core_web_vitals_trend: {
        Args: { p_days?: number; p_page_url: string }
        Returns: {
          date: string
          desktop_performance_score: number
          lcp_status: string
          mobile_cls: number
          mobile_lcp: number
          mobile_performance_score: number
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
        Args: never
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
      get_kid_favorite_recipes: {
        Args: { p_household_id: string; p_min_approval?: number }
        Returns: {
          approval_score: number
          recipe_id: string
          vote_count: number
        }[]
      }
      get_lead_score_breakdown: { Args: { p_lead_id: string }; Returns: Json }
      get_metric_trend: {
        Args: {
          p_current_week: string
          p_household_id: string
          p_metric_name: string
          p_weeks_back?: number
        }
        Returns: {
          is_current: boolean
          metric_value: number
          week_label: string
          week_start_date: string
        }[]
      }
      get_next_blog_title: {
        Args: never
        Returns: {
          times_used: number
          title: string
        }[]
      }
      get_personalized_recommendations: {
        Args: { for_user_id: string; limit_count?: number }
        Returns: {
          post_id: string
          post_slug: string
          post_title: string
          reason: string
          relevance_score: number
        }[]
      }
      get_post_engagement_summary: {
        Args: never
        Returns: {
          avg_engagement_rate: number
          published_posts: number
          scheduled_posts: number
          total_engagement: number
          total_impressions: number
          total_posts: number
        }[]
      }
      get_primary_gsc_property: {
        Args: { user_id_param: string }
        Returns: string
      }
      get_recent_recipe_ids: {
        Args: { p_days_back?: number; p_household_id: string }
        Returns: string[]
      }
      get_seo_improvement_suggestions: {
        Args: never
        Returns: {
          category: string
          estimated_impact: number
          priority: string
          suggestion: string
        }[]
      }
      get_serp_position_changes: {
        Args: { p_days?: number }
        Returns: {
          current_position: number
          keyword: string
          position_change: number
          previous_position: number
          trend: string
        }[]
      }
      get_unread_notifications_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_usage_stats: { Args: { p_user_id: string }; Returns: Json }
      get_user_activity_timeline: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          activity_date: string
          activity_description: string
          activity_type: string
          metadata: Json
          severity: string
        }[]
      }
      get_user_feature_flags: {
        Args: { p_user_id: string }
        Returns: {
          enabled: boolean
          flag_key: string
        }[]
      }
      get_user_household_id: { Args: { _user_id: string }; Returns: string }
      get_user_subscription: {
        Args: { user_uuid: string }
        Returns: {
          cancel_at_period_end: boolean
          current_period_end: string
          plan_name: string
          status: string
        }[]
      }
      has_active_complementary_subscription: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_budget_referral_count: {
        Args: { referrer_email_param: string }
        Returns: undefined
      }
      increment_meal_plan_referral_count: {
        Args: { referrer_email_param: string }
        Returns: undefined
      }
      increment_usage: {
        Args: { p_feature_type: string; p_user_id: string }
        Returns: undefined
      }
      is_food_safe_for_kid: {
        Args: { _food_allergens: string[]; _kid_allergens: string[] }
        Returns: boolean
      }
      is_gsc_token_expired: {
        Args: { user_id_param: string }
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
      log_score_change: {
        Args: {
          p_lead_id: string
          p_metadata?: Json
          p_new_score: number
          p_old_score: number
          p_reason: string
        }
        Returns: undefined
      }
      mark_report_viewed: { Args: { p_report_id: string }; Returns: undefined }
      normalize_title: { Args: { title_text: string }; Returns: string }
      parse_quantity: { Args: { quantity_str: string }; Returns: number }
      populate_title_bank: { Args: { titles_json: Json }; Returns: number }
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
      recalculate_all_lead_scores: {
        Args: never
        Returns: {
          lead_id: string
          new_score: number
          old_score: number
        }[]
      }
      refresh_analytics_views: { Args: never; Returns: undefined }
      refresh_blog_materialized_views: { Args: never; Returns: undefined }
      refresh_revenue_metrics: { Args: never; Returns: undefined }
      refresh_user_engagement_stats: { Args: never; Returns: undefined }
      reject_meal_suggestion: {
        Args: {
          p_feedback_text?: string
          p_feedback_type: string
          p_suggestion_id: string
        }
        Returns: Json
      }
      replace_email_variables: {
        Args: { p_metadata: Json; p_text: string; p_user_name: string }
        Returns: string
      }
      save_report_trend: {
        Args: {
          p_household_id: string
          p_metric_name: string
          p_value: number
          p_week_start: string
        }
        Returns: undefined
      }
      scale_recipe_ingredients: {
        Args: { recipe_id_input: string; target_servings: number }
        Returns: {
          ingredient_id: string
          ingredient_name: string
          is_optional: boolean
          original_quantity: string
          preparation_notes: string
          scaled_quantity: string
          section: string
          unit: string
        }[]
      }
      schedule_next_backup: { Args: never; Returns: number }
      schedule_next_sequence_email: {
        Args: { p_enrollment_id: string }
        Returns: boolean
      }
      schedule_payment_retry: {
        Args: {
          p_failed_amount: number
          p_failure_reason: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: string
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
      schedule_weekly_summaries: { Args: never; Returns: number }
      scheduled_auto_restock: {
        Args: never
        Returns: {
          items_added: number
          user_id: string
        }[]
      }
      search_kb_articles: {
        Args: { p_category?: string; p_limit?: number; p_query: string }
        Returns: {
          article_id: string
          category: string
          relevance_rank: number
          summary: string
          title: string
        }[]
      }
      search_users_intelligence: {
        Args: { p_filter?: string; p_limit?: number; p_search_term: string }
        Returns: {
          email: string
          health_score: number
          health_status: string
          match_rank: number
          mrr: number
          name: string
          subscription_status: string
          user_id: string
          user_tier: string
        }[]
      }
      should_send_notification: {
        Args: {
          p_notification_type: string
          p_scheduled_time: string
          p_user_id: string
        }
        Returns: boolean
      }
      should_throttle_alert: {
        Args: { p_rule_id: string; p_throttle_minutes: number }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      suggest_internal_links: {
        Args: { for_post_id: string; limit_count?: number }
        Returns: {
          relevance_score: number
          suggested_anchor: string
          suggested_post_id: string
          suggested_title: string
        }[]
      }
      trigger_churn_interventions: { Args: never; Returns: number }
      update_all_churn_predictions: { Args: never; Returns: number }
      update_keyword_with_gsc_data: {
        Args: {
          clicks_param: number
          ctr_param: number
          impressions_param: number
          keyword_id_param: string
          position_param: number
        }
        Returns: undefined
      }
      update_order_status: {
        Args: {
          p_message?: string
          p_metadata?: Json
          p_order_id: string
          p_status: string
        }
        Returns: undefined
      }
      update_schedule_next_run: {
        Args: { p_schedule_id: string }
        Returns: undefined
      }
      user_belongs_to_household: {
        Args: { _household_id: string; _user_id: string }
        Returns: boolean
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
