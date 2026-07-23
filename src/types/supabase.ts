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
      abuse_reports: {
        Row: {
          created_at: string | null
          description: string | null
          evidence_urls: string[] | null
          id: string
          report_type: string
          reported_user_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          report_type: string
          reported_user_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          report_type?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abuse_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_pins: {
        Row: {
          created_at: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          pin_salt: string
          profile_id: string
          reset_code_hash: string | null
          reset_expires_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          pin_salt: string
          profile_id: string
          reset_code_hash?: string | null
          reset_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          pin_salt?: string
          profile_id?: string
          reset_code_hash?: string | null
          reset_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_pins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_removals: {
        Row: {
          additional_message: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          reason: string
          reinstated_at: string | null
          reinstated_by: string | null
          removed_at: string | null
          user_id: string
        }
        Insert: {
          additional_message?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          reason?: string
          reinstated_at?: string | null
          reinstated_by?: string | null
          removed_at?: string | null
          user_id: string
        }
        Update: {
          additional_message?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          reason?: string
          reinstated_at?: string | null
          reinstated_by?: string | null
          removed_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_estimate_usage: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          profile_id: string
          used_photos: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          profile_id: string
          used_photos?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          profile_id?: string
          used_photos?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_estimate_usage_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_estimate_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      availability_slots: {
        Row: {
          booked_by: string | null
          calendar_event_id: string | null
          created_at: string | null
          end_time: string
          id: string
          start_time: string
          status: string | null
          tradie_id: string
        }
        Insert: {
          booked_by?: string | null
          calendar_event_id?: string | null
          created_at?: string | null
          end_time: string
          id?: string
          start_time: string
          status?: string | null
          tradie_id: string
        }
        Update: {
          booked_by?: string | null
          calendar_event_id?: string | null
          created_at?: string | null
          end_time?: string
          id?: string
          start_time?: string
          status?: string | null
          tradie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_join_requests: {
        Row: {
          business_name: string
          business_owner_id: string
          created_at: string | null
          id: string
          message: string | null
          requester_email: string
          requester_id: string
          requester_name: string
          role: string
          status: string
          trade_specialty: string | null
          updated_at: string | null
        }
        Insert: {
          business_name?: string
          business_owner_id: string
          created_at?: string | null
          id?: string
          message?: string | null
          requester_email?: string
          requester_id: string
          requester_name?: string
          role?: string
          status?: string
          trade_specialty?: string | null
          updated_at?: string | null
        }
        Update: {
          business_name?: string
          business_owner_id?: string
          created_at?: string | null
          id?: string
          message?: string | null
          requester_email?: string
          requester_id?: string
          requester_name?: string
          role?: string
          status?: string
          trade_specialty?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_join_requests_business_owner_id_fkey"
            columns: ["business_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_join_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_team_members: {
        Row: {
          business_owner_id: string
          color: string | null
          created_at: string | null
          hourly_rate: number | null
          id: string
          invite_email: string | null
          invite_name: string
          invite_phone: string | null
          invited_at: string | null
          joined_at: string | null
          member_profile_id: string | null
          notes: string | null
          role: string
          status: string
          trade_specialty: string | null
          updated_at: string | null
        }
        Insert: {
          business_owner_id: string
          color?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          invite_email?: string | null
          invite_name?: string
          invite_phone?: string | null
          invited_at?: string | null
          joined_at?: string | null
          member_profile_id?: string | null
          notes?: string | null
          role?: string
          status?: string
          trade_specialty?: string | null
          updated_at?: string | null
        }
        Update: {
          business_owner_id?: string
          color?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          invite_email?: string | null
          invite_name?: string
          invite_phone?: string | null
          invited_at?: string | null
          joined_at?: string | null
          member_profile_id?: string | null
          notes?: string | null
          role?: string
          status?: string
          trade_specialty?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_team_members_business_owner_id_fkey"
            columns: ["business_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_team_members_member_profile_id_fkey"
            columns: ["member_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_integrations: {
        Row: {
          access_token: string
          calendar_id: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          sync_enabled: boolean | null
          token_expires_at: string
          tradie_id: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          calendar_id?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          refresh_token?: string | null
          sync_enabled?: boolean | null
          token_expires_at: string
          tradie_id: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          calendar_id?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          sync_enabled?: boolean | null
          token_expires_at?: string
          tradie_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_integrations_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          latitude: number | null
          linked_profile_id: string | null
          longitude: number | null
          notes: string | null
          owner_id: string
          payment_method: string
          phone: string | null
          postcode: string | null
          state: string | null
          suburb: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          latitude?: number | null
          linked_profile_id?: string | null
          longitude?: number | null
          notes?: string | null
          owner_id: string
          payment_method?: string
          phone?: string | null
          postcode?: string | null
          state?: string | null
          suburb?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          latitude?: number | null
          linked_profile_id?: string | null
          longitude?: number | null
          notes?: string | null
          owner_id?: string
          payment_method?: string
          phone?: string | null
          postcode?: string | null
          state?: string | null
          suburb?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_errors: {
        Row: {
          component_stack: string | null
          created_at: string | null
          id: string
          message: string
          stack: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string | null
          id?: string
          message: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string | null
          id?: string
          message?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      client_sites: {
        Row: {
          access_instructions: string | null
          address: string | null
          client_contact_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_default: boolean
          latitude: number | null
          longitude: number | null
          notes: string | null
          site_name: string
          updated_at: string
        }
        Insert: {
          access_instructions?: string | null
          address?: string | null
          client_contact_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          site_name: string
          updated_at?: string
        }
        Update: {
          access_instructions?: string | null
          address?: string | null
          client_contact_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          site_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sites_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_dismissals: {
        Row: {
          created_at: string
          id: string
          pair_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pair_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pair_key?: string
          user_id?: string
        }
        Relationships: []
      }
      connections: {
        Row: {
          amount_paid: number | null
          client_id: string
          created_at: string | null
          id: string
          tradie_id: string
          unlocked_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          client_id: string
          created_at?: string | null
          id?: string
          tradie_id: string
          unlocked_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          client_id?: string
          created_at?: string | null
          id?: string
          tradie_id?: string
          unlocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
          read: boolean | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
          read?: boolean | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
          read?: boolean | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          archived_at: string | null
          conversation_id: string
          id: string
          is_admin: boolean
          joined_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          conversation_id: string
          id?: string
          is_admin?: boolean
          joined_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string
          id?: string
          is_admin?: boolean
          joined_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_permissions: {
        Row: {
          blocked_by: string
          can_see_address: boolean
          can_see_email: boolean
          can_see_phone: boolean
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          blocked_by: string
          can_see_address?: boolean
          can_see_email?: boolean
          can_see_phone?: boolean
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          blocked_by?: string
          can_see_address?: boolean
          can_see_email?: boolean
          can_see_phone?: boolean
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_permissions_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_permissions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_group: boolean
          job_id: string | null
          recurring_job_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_group?: boolean
          job_id?: string | null
          recurring_job_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_group?: boolean
          job_id?: string | null
          recurring_job_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            isOneToOne: false
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_task_suggestions: {
        Row: {
          approved_as_category: string | null
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          task_name: string
          task_name_normalized: string
          times_submitted: number
          trade_context: string | null
          updated_at: string
        }
        Insert: {
          approved_as_category?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          task_name: string
          task_name_normalized: string
          times_submitted?: number
          trade_context?: string | null
          updated_at?: string
        }
        Update: {
          approved_as_category?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          task_name?: string
          task_name_normalized?: string
          times_submitted?: number
          trade_context?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_task_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_task_suggestions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      date_change_requests: {
        Row: {
          created_at: string | null
          field_name: string
          id: string
          project_id: string
          reason: string
          requested_date: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          field_name: string
          id?: string
          project_id: string
          reason?: string
          requested_date: string
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          field_name?: string
          id?: string
          project_id?: string
          reason?: string
          requested_date?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_change_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      device_geofence_tokens: {
        Row: {
          created_at: string
          last_used_at: string | null
          token: string
          tradie_id: string
        }
        Insert: {
          created_at?: string
          last_used_at?: string | null
          token: string
          tradie_id: string
        }
        Update: {
          created_at?: string
          last_used_at?: string | null
          token?: string
          tradie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_geofence_tokens_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          admin_notes: string | null
          against_user: string
          created_at: string
          description: string
          evidence_urls: string[] | null
          id: string
          job_id: string
          opened_by: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          against_user: string
          created_at?: string
          description: string
          evidence_urls?: string[] | null
          id?: string
          job_id: string
          opened_by: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          against_user?: string
          created_at?: string
          description?: string
          evidence_urls?: string[] | null
          id?: string
          job_id?: string
          opened_by?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_against_user_fkey"
            columns: ["against_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_preferences: {
        Row: {
          category: string
          created_at: string | null
          email_enabled: boolean | null
          id: string
          push_enabled: boolean | null
          sms_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_packs: {
        Row: {
          amount_cents: number
          created_at: string
          credits_purchased: number
          credits_remaining: number
          id: string
          profile_id: string
          purchased_at: string
          status: string
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          credits_purchased?: number
          credits_remaining?: number
          id?: string
          profile_id: string
          purchased_at?: string
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credits_purchased?: number
          credits_remaining?: number
          id?: string
          profile_id?: string
          purchased_at?: string
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_packs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hint_tracking: {
        Row: {
          created_at: string | null
          dismissed_at: string | null
          hint_key: string
          id: string
          user_id: string
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          dismissed_at?: string | null
          hint_key: string
          id?: string
          user_id: string
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          dismissed_at?: string | null
          hint_key?: string
          id?: string
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hint_tracking_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_calendar_visits: {
        Row: {
          all_day: boolean
          business_owner_id: string
          color: string | null
          created_at: string | null
          description: string | null
          ends_at: string | null
          google_calendar_id: string
          google_event_id: string
          id: string
          location: string | null
          source_calendar: string | null
          starts_at: string
          team_member_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean
          business_owner_id: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          google_calendar_id: string
          google_event_id: string
          id?: string
          location?: string | null
          source_calendar?: string | null
          starts_at: string
          team_member_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean
          business_owner_id?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          google_calendar_id?: string
          google_event_id?: string
          id?: string
          location?: string | null
          source_calendar?: string | null
          starts_at?: string
          team_member_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imported_calendar_visits_business_owner_id_fkey"
            columns: ["business_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_calendar_visits_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "business_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string | null
          description?: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bill_to_address: string | null
          bill_to_name: string | null
          billed_to_user_id: string | null
          business_abn: string | null
          business_address: string | null
          business_email: string | null
          business_name: string
          business_phone: string | null
          created_at: string | null
          created_by: string
          due_date: string | null
          gst_amount: number
          id: string
          invoice_date: string
          invoice_number: string
          job_id: string | null
          milestone_id: string | null
          milestone_subcontractor_id: string | null
          notes: string | null
          payment_account_name: string | null
          payment_account_number: string | null
          payment_bsb: string | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          bill_to_address?: string | null
          bill_to_name?: string | null
          billed_to_user_id?: string | null
          business_abn?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          created_at?: string | null
          created_by: string
          due_date?: string | null
          gst_amount?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          job_id?: string | null
          milestone_id?: string | null
          milestone_subcontractor_id?: string | null
          notes?: string | null
          payment_account_name?: string | null
          payment_account_number?: string | null
          payment_bsb?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          bill_to_address?: string | null
          bill_to_name?: string | null
          billed_to_user_id?: string | null
          business_abn?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          created_at?: string | null
          created_by?: string
          due_date?: string | null
          gst_amount?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          job_id?: string | null
          milestone_id?: string | null
          milestone_subcontractor_id?: string | null
          notes?: string | null
          payment_account_name?: string | null
          payment_account_number?: string | null
          payment_bsb?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billed_to_user_id_fkey"
            columns: ["billed_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "job_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_milestone_subcontractor_id_fkey"
            columns: ["milestone_subcontractor_id"]
            isOneToOne: false
            referencedRelation: "milestone_subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      job_access_details: {
        Row: {
          access_instructions: string | null
          created_at: string
          job_id: string
          updated_at: string
        }
        Insert: {
          access_instructions?: string | null
          created_at?: string
          job_id: string
          updated_at?: string
        }
        Update: {
          access_instructions?: string | null
          created_at?: string
          job_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_access_details_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_contact_details: {
        Row: {
          access_notes: string | null
          address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          job_id: string
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          job_id: string
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          job_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_contact_details_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_milestones: {
        Row: {
          amount: number
          approved_at: string | null
          created_at: string | null
          created_by: string
          due_date: string | null
          id: string
          invoice_number: string | null
          job_id: string
          paid_at: string | null
          payment_type: string
          proof_images: string[] | null
          stage_number: number
          status: string
          subcontractor_business_name: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          created_at?: string | null
          created_by: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          job_id: string
          paid_at?: string | null
          payment_type?: string
          proof_images?: string[] | null
          stage_number?: number
          status?: string
          subcontractor_business_name?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          created_at?: string | null
          created_by?: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          job_id?: string
          paid_at?: string | null
          payment_type?: string
          proof_images?: string[] | null
          stage_number?: number
          status?: string
          subcontractor_business_name?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_milestones_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          add_to_portfolio: boolean | null
          caption: string | null
          created_at: string | null
          id: string
          job_id: string
          photo_url: string
          stage: string
          uploaded_by: string
        }
        Insert: {
          add_to_portfolio?: boolean | null
          caption?: string | null
          created_at?: string | null
          id?: string
          job_id: string
          photo_url: string
          stage: string
          uploaded_by: string
        }
        Update: {
          add_to_portfolio?: boolean | null
          caption?: string | null
          created_at?: string | null
          id?: string
          job_id?: string
          photo_url?: string
          stage?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_team_assignments: {
        Row: {
          business_owner_id: string
          created_at: string | null
          end_time: string | null
          id: string
          job_id: string
          notes: string | null
          role_on_job: string | null
          scheduled_date: string | null
          start_time: string | null
          status: string
          team_member_id: string
          updated_at: string | null
        }
        Insert: {
          business_owner_id: string
          created_at?: string | null
          end_time?: string | null
          id?: string
          job_id: string
          notes?: string | null
          role_on_job?: string | null
          scheduled_date?: string | null
          start_time?: string | null
          status?: string
          team_member_id: string
          updated_at?: string | null
        }
        Update: {
          business_owner_id?: string
          created_at?: string | null
          end_time?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          role_on_job?: string | null
          scheduled_date?: string | null
          start_time?: string | null
          status?: string
          team_member_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_team_assignments_business_owner_id_fkey"
            columns: ["business_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_team_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_team_assignments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "business_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      job_unlocks: {
        Row: {
          amount_paid: number | null
          created_at: string | null
          id: string
          job_id: string
          tradie_id: string
          unlocked_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string | null
          id?: string
          job_id: string
          tradie_id: string
          unlocked_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          created_at?: string | null
          id?: string
          job_id?: string
          tradie_id?: string
          unlocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_unlocks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_unlocks_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_variations: {
        Row: {
          additional_amount: number
          created_at: string | null
          description: string
          id: string
          job_id: string
          photo_urls: string[] | null
          reason_category: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          additional_amount: number
          created_at?: string | null
          description: string
          id?: string
          job_id: string
          photo_urls?: string[] | null
          reason_category?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          additional_amount?: number
          created_at?: string | null
          description?: string
          id?: string
          job_id?: string
          photo_urls?: string[] | null
          reason_category?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_variations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          access_instructions: string | null
          allows_site_inspection: boolean
          archived_at: string | null
          budget_amount: number | null
          budget_type: string | null
          calendar_event_id: string | null
          client_contact_id: string | null
          client_id: string | null
          completed_at: string | null
          completion_notes: string | null
          completion_photo_url: string | null
          contact_flag_reason: string | null
          contact_flagged: boolean | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          day_before_notification_sent: string | null
          decline_reason: string | null
          declined_at: string | null
          delayed_until: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          emergency_fee_applied: boolean | null
          end_time: string | null
          estimated_duration: string | null
          flash_expiry: string | null
          flow_version: number
          geofence_radius_m: number
          id: string
          images_url: string[] | null
          is_delayed: boolean | null
          is_emergency: boolean | null
          is_flash_boost: boolean
          job_complexity: string | null
          latitude: number | null
          location_address: string | null
          longitude: number | null
          max_quotes: number
          notes: string | null
          parking_available: boolean | null
          preferred_time_slot: string | null
          priority: string | null
          project_id: string | null
          quote_count: number
          quoting_status: string
          recurring_job_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          slot_id: string | null
          start_time: string | null
          status: string | null
          time_confirmed: boolean
          title: string | null
          tradie_id: string | null
          two_hour_notification_sent: string | null
          updated_at: string | null
        }
        Insert: {
          access_instructions?: string | null
          allows_site_inspection?: boolean
          archived_at?: string | null
          budget_amount?: number | null
          budget_type?: string | null
          calendar_event_id?: string | null
          client_contact_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photo_url?: string | null
          contact_flag_reason?: string | null
          contact_flagged?: boolean | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          day_before_notification_sent?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          delayed_until?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          emergency_fee_applied?: boolean | null
          end_time?: string | null
          estimated_duration?: string | null
          flash_expiry?: string | null
          flow_version?: number
          geofence_radius_m?: number
          id?: string
          images_url?: string[] | null
          is_delayed?: boolean | null
          is_emergency?: boolean | null
          is_flash_boost?: boolean
          job_complexity?: string | null
          latitude?: number | null
          location_address?: string | null
          longitude?: number | null
          max_quotes?: number
          notes?: string | null
          parking_available?: boolean | null
          preferred_time_slot?: string | null
          priority?: string | null
          project_id?: string | null
          quote_count?: number
          quoting_status?: string
          recurring_job_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          slot_id?: string | null
          start_time?: string | null
          status?: string | null
          time_confirmed?: boolean
          title?: string | null
          tradie_id?: string | null
          two_hour_notification_sent?: string | null
          updated_at?: string | null
        }
        Update: {
          access_instructions?: string | null
          allows_site_inspection?: boolean
          archived_at?: string | null
          budget_amount?: number | null
          budget_type?: string | null
          calendar_event_id?: string | null
          client_contact_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photo_url?: string | null
          contact_flag_reason?: string | null
          contact_flagged?: boolean | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          day_before_notification_sent?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          delayed_until?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          emergency_fee_applied?: boolean | null
          end_time?: string | null
          estimated_duration?: string | null
          flash_expiry?: string | null
          flow_version?: number
          geofence_radius_m?: number
          id?: string
          images_url?: string[] | null
          is_delayed?: boolean | null
          is_emergency?: boolean | null
          is_flash_boost?: boolean
          job_complexity?: string | null
          latitude?: number | null
          location_address?: string | null
          longitude?: number | null
          max_quotes?: number
          notes?: string | null
          parking_available?: boolean | null
          preferred_time_slot?: string | null
          priority?: string | null
          project_id?: string | null
          quote_count?: number
          quoting_status?: string
          recurring_job_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          slot_id?: string | null
          start_time?: string | null
          status?: string | null
          time_confirmed?: boolean
          title?: string | null
          tradie_id?: string | null
          two_hour_notification_sent?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            isOneToOne: false
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_impressions: {
        Row: {
          id: string
          job_id: string
          pass_reason: string | null
          passed_at: string | null
          reminder_24h_sent_at: string | null
          reminder_48h_sent_at: string | null
          shown_at: string
          tradie_id: string
        }
        Insert: {
          id?: string
          job_id: string
          pass_reason?: string | null
          passed_at?: string | null
          reminder_24h_sent_at?: string | null
          reminder_48h_sent_at?: string | null
          shown_at?: string
          tradie_id: string
        }
        Update: {
          id?: string
          job_id?: string
          pass_reason?: string | null
          passed_at?: string | null
          reminder_24h_sent_at?: string | null
          reminder_48h_sent_at?: string | null
          shown_at?: string
          tradie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_impressions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_impressions_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_flags: {
        Row: {
          conversation_id: string | null
          created_at: string
          flag_type: string
          id: string
          job_id: string | null
          matched_text: string | null
          message_id: string | null
          sender_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          flag_type?: string
          id?: string
          job_id?: string | null
          matched_text?: string | null
          message_id?: string | null
          sender_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          flag_type?: string
          id?: string
          job_id?: string | null
          matched_text?: string | null
          message_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_flags_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_flags_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_flags_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_size: number | null
          attachment_type: string | null
          attachment_url: string | null
          content: string
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          image_url: string | null
          is_booking_request: boolean | null
          job_id: string | null
          read_at: string | null
          read_by: string[] | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_booking_request?: boolean | null
          job_id?: string | null
          read_at?: string | null
          read_by?: string[] | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_booking_request?: boolean | null
          job_id?: string | null
          read_at?: string | null
          read_by?: string[] | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_subcontractors: {
        Row: {
          amount: number
          business_name: string
          created_at: string | null
          id: string
          invoice_id: string | null
          invoice_number: string | null
          milestone_id: string
        }
        Insert: {
          amount?: number
          business_name?: string
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          milestone_id: string
        }
        Update: {
          amount?: number
          business_name?: string
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          milestone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_subcontractors_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_subcontractors_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "job_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      my_trades: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          tradie_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          tradie_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          tradie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "my_trades_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "my_trades_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string | null
          email_sent_at: string | null
          id: string
          job_id: string | null
          link: string | null
          message: string
          metadata: Json | null
          notification_type: string | null
          read: boolean
          read_at: string | null
          sms_sent_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string | null
          email_sent_at?: string | null
          id?: string
          job_id?: string | null
          link?: string | null
          message?: string
          metadata?: Json | null
          notification_type?: string | null
          read?: boolean
          read_at?: string | null
          sms_sent_at?: string | null
          title?: string
          type?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string | null
          email_sent_at?: string | null
          id?: string
          job_id?: string | null
          link?: string | null
          message?: string
          metadata?: Json | null
          notification_type?: string | null
          read?: boolean
          read_at?: string | null
          sms_sent_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          availability_set: boolean | null
          avatar_complete: boolean | null
          completed_at: string | null
          created_at: string | null
          first_job_viewed: boolean | null
          id: string
          profile_complete: boolean | null
          trades_added: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          availability_set?: boolean | null
          avatar_complete?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          first_job_viewed?: boolean | null
          id?: string
          profile_complete?: boolean | null
          trades_added?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          availability_set?: boolean | null
          avatar_complete?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          first_job_viewed?: boolean | null
          id?: string
          profile_complete?: boolean | null
          trades_added?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reconciliation_log: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          mismatches_fixed: number
          mismatches_found: number
          payments_checked: number
          run_at: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          mismatches_fixed?: number
          mismatches_found?: number
          payments_checked?: number
          run_at?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          mismatches_fixed?: number
          mismatches_found?: number
          payments_checked?: number
          run_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          commission_cents: number | null
          completed_at: string | null
          created_at: string
          currency: string
          fee_calculated_at: string | null
          fee_floor_applied: boolean
          fee_rate_bps: number | null
          fee_rate_type: string | null
          fee_tier: string | null
          gst_on_fee_cents: number | null
          id: string
          invoice_number: number
          invoice_ref: string | null
          job_id: string | null
          labour_cents: number | null
          materials_cents: number | null
          materials_processing_bps: number | null
          materials_processing_cents: number | null
          metadata: Json | null
          original_amount: number | null
          parent_payment_id: string | null
          payment_type: string
          platform_fee_cents: number | null
          processing_fee: number
          profile_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount: number
          commission_cents?: number | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          fee_calculated_at?: string | null
          fee_floor_applied?: boolean
          fee_rate_bps?: number | null
          fee_rate_type?: string | null
          fee_tier?: string | null
          gst_on_fee_cents?: number | null
          id?: string
          invoice_number?: number
          invoice_ref?: string | null
          job_id?: string | null
          labour_cents?: number | null
          materials_cents?: number | null
          materials_processing_bps?: number | null
          materials_processing_cents?: number | null
          metadata?: Json | null
          original_amount?: number | null
          parent_payment_id?: string | null
          payment_type: string
          platform_fee_cents?: number | null
          processing_fee?: number
          profile_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number
          commission_cents?: number | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          fee_calculated_at?: string | null
          fee_floor_applied?: boolean
          fee_rate_bps?: number | null
          fee_rate_type?: string | null
          fee_tier?: string | null
          gst_on_fee_cents?: number | null
          id?: string
          invoice_number?: number
          invoice_ref?: string | null
          job_id?: string | null
          labour_cents?: number | null
          materials_cents?: number | null
          materials_processing_bps?: number | null
          materials_processing_cents?: number | null
          metadata?: Json | null
          original_amount?: number | null
          parent_payment_id?: string | null
          payment_type?: string
          platform_fee_cents?: number | null
          processing_fee?: number
          profile_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_team_assignments: {
        Row: {
          business_owner_id: string
          created_at: string | null
          id: string
          lead_person: boolean | null
          notes: string | null
          phase_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          team_member_id: string
        }
        Insert: {
          business_owner_id: string
          created_at?: string | null
          id?: string
          lead_person?: boolean | null
          notes?: string | null
          phase_id: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          team_member_id: string
        }
        Update: {
          business_owner_id?: string
          created_at?: string | null
          id?: string
          lead_person?: boolean | null
          notes?: string | null
          phase_id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_team_assignments_business_owner_id_fkey"
            columns: ["business_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_team_assignments_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_team_assignments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "business_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          key: string
          updated_at: string
          value_int: number | null
        }
        Insert: {
          key: string
          updated_at?: string
          value_int?: number | null
        }
        Update: {
          key?: string
          updated_at?: string
          value_int?: number | null
        }
        Relationships: []
      }
      platform_recommendations: {
        Row: {
          action_url: string | null
          category: string
          created_at: string
          data_snapshot: Json | null
          description: string
          generated_at: string
          id: string
          priority: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
        }
        Insert: {
          action_url?: string | null
          category: string
          created_at?: string
          data_snapshot?: Json | null
          description: string
          generated_at?: string
          id?: string
          priority: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
        }
        Update: {
          action_url?: string | null
          category?: string
          created_at?: string
          data_snapshot?: Json | null
          description?: string
          generated_at?: string
          id?: string
          priority?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_recommendations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_updates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          priority: string
          published_at: string
          requires_acknowledgment: boolean
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string
          requires_acknowledgment?: boolean
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string
          requires_acknowledgment?: boolean
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_images: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          image_url: string
          sort_order: number | null
          tradie_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url: string
          sort_order?: number | null
          tradie_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url?: string
          sort_order?: number | null
          tradie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_images_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_tiers: {
        Row: {
          ai_estimates_monthly_limit: number | null
          annual_monthly_price_cents: number | null
          cap_floor_bps: number
          created_at: string
          direct_pay_allowed: boolean
          fee_cap_cents: number
          id: string
          instant_payout_bps: number
          instant_payout_min_cents: number
          is_active: boolean
          min_fee_cents: number
          monthly_price_cents: number
          name: string
          rate_bps: number
          reduced_rate_bps: number
          reduced_threshold_cents: number
          repeat_rate_bps: number
          sort_order: number
          stripe_price_id_annual: string | null
          stripe_price_id_monthly: string | null
          team_seats: number | null
          updated_at: string
        }
        Insert: {
          ai_estimates_monthly_limit?: number | null
          annual_monthly_price_cents?: number | null
          cap_floor_bps?: number
          created_at?: string
          direct_pay_allowed?: boolean
          fee_cap_cents: number
          id: string
          instant_payout_bps?: number
          instant_payout_min_cents?: number
          is_active?: boolean
          min_fee_cents?: number
          monthly_price_cents?: number
          name: string
          rate_bps: number
          reduced_rate_bps: number
          reduced_threshold_cents?: number
          repeat_rate_bps: number
          sort_order?: number
          stripe_price_id_annual?: string | null
          stripe_price_id_monthly?: string | null
          team_seats?: number | null
          updated_at?: string
        }
        Update: {
          ai_estimates_monthly_limit?: number | null
          annual_monthly_price_cents?: number | null
          cap_floor_bps?: number
          created_at?: string
          direct_pay_allowed?: boolean
          fee_cap_cents?: number
          id?: string
          instant_payout_bps?: number
          instant_payout_min_cents?: number
          is_active?: boolean
          min_fee_cents?: number
          monthly_price_cents?: number
          name?: string
          rate_bps?: number
          reduced_rate_bps?: number
          reduced_threshold_cents?: number
          repeat_rate_bps?: number
          sort_order?: number
          stripe_price_id_annual?: string | null
          stripe_price_id_monthly?: string | null
          team_seats?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profile_views: {
        Row: {
          id: string
          tradie_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          tradie_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          tradie_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          abn_entity_name: string | null
          abn_number: string | null
          abn_verified: boolean | null
          address: string | null
          auto_complete_sessions: boolean
          avatar_url: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_bsb: string | null
          bank_name: string | null
          base_latitude: number | null
          base_longitude: number | null
          bio: string | null
          call_out_fee: number | null
          callout_fee_waived_on_proceed: boolean | null
          cover_photo_url: string | null
          created_at: string | null
          declared_trades: string[] | null
          documents_url: string[] | null
          email: string
          employer_id: string | null
          employer_status: string
          employment_type: string
          external_pay_allowed: boolean
          full_name: string
          id: string
          insurance_policy: boolean | null
          is_admin: boolean
          is_emergency_available: boolean | null
          is_gst_registered: boolean
          is_identity_verified: boolean | null
          is_premium: boolean | null
          last_invoice_reminder_email_at: string | null
          last_license_check: string | null
          license_api_verified: boolean | null
          license_check_count: number | null
          license_class: string | null
          license_expiry: string | null
          license_holder_name: string | null
          license_number: string | null
          license_state: string | null
          license_trades: string[] | null
          license_verified: boolean | null
          notify_site_arrival: boolean
          onboarding_completed: boolean | null
          onboarding_stage: number
          phone: string | null
          platform_fee_override_bps: number | null
          postcode: string | null
          push_enabled: boolean | null
          push_subscription: Json | null
          rejection_reason: string | null
          role: string | null
          service_radius_km: number | null
          show_callout_fee: boolean | null
          sms_alerts_enabled: boolean | null
          stripe_connect_account_id: string | null
          stripe_connect_onboarding_complete: boolean | null
          stripe_customer_id: string | null
          stripe_identity_session_id: string | null
          subscription_expires_at: string | null
          subscription_expiry: string | null
          subscription_started_at: string | null
          subscription_tier: string | null
          suburb: string | null
          team_size: string | null
          terms_accepted_at: string | null
          timezone: string
          tos_version: string | null
          verification_status: string | null
          verified_trades: string[] | null
        }
        Insert: {
          abn_entity_name?: string | null
          abn_number?: string | null
          abn_verified?: boolean | null
          address?: string | null
          auto_complete_sessions?: boolean
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          bank_name?: string | null
          base_latitude?: number | null
          base_longitude?: number | null
          bio?: string | null
          call_out_fee?: number | null
          callout_fee_waived_on_proceed?: boolean | null
          cover_photo_url?: string | null
          created_at?: string | null
          declared_trades?: string[] | null
          documents_url?: string[] | null
          email: string
          employer_id?: string | null
          employer_status?: string
          employment_type?: string
          external_pay_allowed?: boolean
          full_name?: string
          id: string
          insurance_policy?: boolean | null
          is_admin?: boolean
          is_emergency_available?: boolean | null
          is_gst_registered?: boolean
          is_identity_verified?: boolean | null
          is_premium?: boolean | null
          last_invoice_reminder_email_at?: string | null
          last_license_check?: string | null
          license_api_verified?: boolean | null
          license_check_count?: number | null
          license_class?: string | null
          license_expiry?: string | null
          license_holder_name?: string | null
          license_number?: string | null
          license_state?: string | null
          license_trades?: string[] | null
          license_verified?: boolean | null
          notify_site_arrival?: boolean
          onboarding_completed?: boolean | null
          onboarding_stage?: number
          phone?: string | null
          platform_fee_override_bps?: number | null
          postcode?: string | null
          push_enabled?: boolean | null
          push_subscription?: Json | null
          rejection_reason?: string | null
          role?: string | null
          service_radius_km?: number | null
          show_callout_fee?: boolean | null
          sms_alerts_enabled?: boolean | null
          stripe_connect_account_id?: string | null
          stripe_connect_onboarding_complete?: boolean | null
          stripe_customer_id?: string | null
          stripe_identity_session_id?: string | null
          subscription_expires_at?: string | null
          subscription_expiry?: string | null
          subscription_started_at?: string | null
          subscription_tier?: string | null
          suburb?: string | null
          team_size?: string | null
          terms_accepted_at?: string | null
          timezone?: string
          tos_version?: string | null
          verification_status?: string | null
          verified_trades?: string[] | null
        }
        Update: {
          abn_entity_name?: string | null
          abn_number?: string | null
          abn_verified?: boolean | null
          address?: string | null
          auto_complete_sessions?: boolean
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          bank_name?: string | null
          base_latitude?: number | null
          base_longitude?: number | null
          bio?: string | null
          call_out_fee?: number | null
          callout_fee_waived_on_proceed?: boolean | null
          cover_photo_url?: string | null
          created_at?: string | null
          declared_trades?: string[] | null
          documents_url?: string[] | null
          email?: string
          employer_id?: string | null
          employer_status?: string
          employment_type?: string
          external_pay_allowed?: boolean
          full_name?: string
          id?: string
          insurance_policy?: boolean | null
          is_admin?: boolean
          is_emergency_available?: boolean | null
          is_gst_registered?: boolean
          is_identity_verified?: boolean | null
          is_premium?: boolean | null
          last_invoice_reminder_email_at?: string | null
          last_license_check?: string | null
          license_api_verified?: boolean | null
          license_check_count?: number | null
          license_class?: string | null
          license_expiry?: string | null
          license_holder_name?: string | null
          license_number?: string | null
          license_state?: string | null
          license_trades?: string[] | null
          license_verified?: boolean | null
          notify_site_arrival?: boolean
          onboarding_completed?: boolean | null
          onboarding_stage?: number
          phone?: string | null
          platform_fee_override_bps?: number | null
          postcode?: string | null
          push_enabled?: boolean | null
          push_subscription?: Json | null
          rejection_reason?: string | null
          role?: string | null
          service_radius_km?: number | null
          show_callout_fee?: boolean | null
          sms_alerts_enabled?: boolean | null
          stripe_connect_account_id?: string | null
          stripe_connect_onboarding_complete?: boolean | null
          stripe_customer_id?: string | null
          stripe_identity_session_id?: string | null
          subscription_expires_at?: string | null
          subscription_expiry?: string | null
          subscription_started_at?: string | null
          subscription_tier?: string | null
          suburb?: string | null
          team_size?: string | null
          terms_accepted_at?: string | null
          timezone?: string
          tos_version?: string | null
          verification_status?: string | null
          verified_trades?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_phases: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          business_owner_id: string
          color: string | null
          created_at: string | null
          description: string | null
          estimated_hours: number | null
          id: string
          planned_end_date: string | null
          planned_start_date: string | null
          project_id: string
          stage_order: number
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          business_owner_id: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: string
          planned_end_date?: string | null
          planned_start_date?: string | null
          project_id: string
          stage_order?: number
          status?: string
          title?: string
          updated_at?: string | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          business_owner_id?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: string
          planned_end_date?: string | null
          planned_start_date?: string | null
          project_id?: string
          stage_order?: number
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_business_owner_id_fkey"
            columns: ["business_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          client_status: string | null
          client_status_updated_at: string | null
          created_at: string | null
          description: string | null
          end_reason: string | null
          estimated_end_date: string | null
          id: string
          is_ongoing: boolean | null
          start_date: string | null
          status: string | null
          status_agreed: boolean | null
          title: string
          tradie_status: string | null
          tradie_status_updated_at: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          client_status?: string | null
          client_status_updated_at?: string | null
          created_at?: string | null
          description?: string | null
          end_reason?: string | null
          estimated_end_date?: string | null
          id?: string
          is_ongoing?: boolean | null
          start_date?: string | null
          status?: string | null
          status_agreed?: boolean | null
          title: string
          tradie_status?: string | null
          tradie_status_updated_at?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          client_status?: string | null
          client_status_updated_at?: string | null
          created_at?: string | null
          description?: string | null
          end_reason?: string | null
          estimated_end_date?: string | null
          id?: string
          is_ongoing?: boolean | null
          start_date?: string | null
          status?: string | null
          status_agreed?: boolean | null
          title?: string
          tradie_status?: string | null
          tradie_status_updated_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quote_templates: {
        Row: {
          conditions: string | null
          created_at: string | null
          default_duration: string | null
          id: string
          includes_materials: boolean | null
          internal_notes: string | null
          message: string
          name: string
          price: number | null
          property_type: string | null
          scope: string | null
          title: string | null
          trade_category: string | null
          tradie_id: string
          updated_at: string | null
        }
        Insert: {
          conditions?: string | null
          created_at?: string | null
          default_duration?: string | null
          id?: string
          includes_materials?: boolean | null
          internal_notes?: string | null
          message: string
          name: string
          price?: number | null
          property_type?: string | null
          scope?: string | null
          title?: string | null
          trade_category?: string | null
          tradie_id: string
          updated_at?: string | null
        }
        Update: {
          conditions?: string | null
          created_at?: string | null
          default_duration?: string | null
          id?: string
          includes_materials?: boolean | null
          internal_notes?: string | null
          message?: string
          name?: string
          price?: number | null
          property_type?: string | null
          scope?: string | null
          title?: string | null
          trade_category?: string | null
          tradie_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_templates_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          call_out_fee_cents: number | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          estimated_duration: string | null
          final_price: number | null
          final_submitted_at: string | null
          final_valid_until: string | null
          firm_price: number | null
          id: string
          includes_materials: boolean
          job_id: string
          labour_cents: number | null
          materials_cents: number
          materials_description: string | null
          message: string
          price_max: number
          price_min: number
          property_type: string | null
          proposed_start_date: string | null
          public_token: string | null
          requires_site_inspection: boolean
          sent_to_email: string | null
          site_visit_completed_at: string | null
          site_visit_ends_at: string | null
          site_visit_fee_paid_at: string | null
          site_visit_fee_payment_intent_id: string | null
          site_visit_fee_status: string | null
          site_visit_scheduled_at: string | null
          site_visit_time_confirmed: boolean
          status: string
          trade_category: string | null
          tradie_id: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          call_out_fee_cents?: number | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          estimated_duration?: string | null
          final_price?: number | null
          final_submitted_at?: string | null
          final_valid_until?: string | null
          firm_price?: number | null
          id?: string
          includes_materials?: boolean
          job_id: string
          labour_cents?: number | null
          materials_cents?: number
          materials_description?: string | null
          message?: string
          price_max: number
          price_min: number
          property_type?: string | null
          proposed_start_date?: string | null
          public_token?: string | null
          requires_site_inspection?: boolean
          sent_to_email?: string | null
          site_visit_completed_at?: string | null
          site_visit_ends_at?: string | null
          site_visit_fee_paid_at?: string | null
          site_visit_fee_payment_intent_id?: string | null
          site_visit_fee_status?: string | null
          site_visit_scheduled_at?: string | null
          site_visit_time_confirmed?: boolean
          status?: string
          trade_category?: string | null
          tradie_id: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          call_out_fee_cents?: number | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          estimated_duration?: string | null
          final_price?: number | null
          final_submitted_at?: string | null
          final_valid_until?: string | null
          firm_price?: number | null
          id?: string
          includes_materials?: boolean
          job_id?: string
          labour_cents?: number | null
          materials_cents?: number
          materials_description?: string | null
          message?: string
          price_max?: number
          price_min?: number
          property_type?: string | null
          proposed_start_date?: string | null
          public_token?: string | null
          requires_site_inspection?: boolean
          sent_to_email?: string | null
          site_visit_completed_at?: string | null
          site_visit_ends_at?: string | null
          site_visit_fee_paid_at?: string | null
          site_visit_fee_payment_intent_id?: string | null
          site_visit_fee_status?: string | null
          site_visit_scheduled_at?: string | null
          site_visit_time_confirmed?: boolean
          status?: string
          trade_category?: string | null
          tradie_id?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          approval_reminder_sent_at: string | null
          approval_requested_at: string | null
          approved_at: string | null
          approved_by: string | null
          becs_charge_status: string | null
          becs_failed_at: string | null
          billing_period_end: string
          billing_period_start: string
          client_contact_id: string | null
          created_at: string | null
          dispute_reason: string | null
          disputed_at: string | null
          disputed_by: string | null
          due_date: string | null
          escalated_at: string | null
          external_payment_method: string | null
          external_reference: string | null
          extra_sessions_count: number | null
          extras_total: number | null
          homeowner_id: string | null
          id: string
          marked_paid_by: string | null
          paid_at: string | null
          payment_method: string | null
          payout_error_message: string | null
          payout_status: string | null
          recurring_job_id: string | null
          regular_sessions_count: number | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          scheduled_charge_at: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_url: string | null
          subtotal: number
          supplies_total: number | null
          total: number
          tradie_id: string | null
          tradie_responded_at: string | null
          tradie_response: string | null
          transferred_at: string | null
          updated_at: string | null
        }
        Insert: {
          approval_reminder_sent_at?: string | null
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          becs_charge_status?: string | null
          becs_failed_at?: string | null
          billing_period_end: string
          billing_period_start: string
          client_contact_id?: string | null
          created_at?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          disputed_by?: string | null
          due_date?: string | null
          escalated_at?: string | null
          external_payment_method?: string | null
          external_reference?: string | null
          extra_sessions_count?: number | null
          extras_total?: number | null
          homeowner_id?: string | null
          id?: string
          marked_paid_by?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payout_error_message?: string | null
          payout_status?: string | null
          recurring_job_id?: string | null
          regular_sessions_count?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scheduled_charge_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_url?: string | null
          subtotal: number
          supplies_total?: number | null
          total: number
          tradie_id?: string | null
          tradie_responded_at?: string | null
          tradie_response?: string | null
          transferred_at?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_reminder_sent_at?: string | null
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          becs_charge_status?: string | null
          becs_failed_at?: string | null
          billing_period_end?: string
          billing_period_start?: string
          client_contact_id?: string | null
          created_at?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          disputed_by?: string | null
          due_date?: string | null
          escalated_at?: string | null
          external_payment_method?: string | null
          external_reference?: string | null
          extra_sessions_count?: number | null
          extras_total?: number | null
          homeowner_id?: string | null
          id?: string
          marked_paid_by?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payout_error_message?: string | null
          payout_status?: string | null
          recurring_job_id?: string | null
          regular_sessions_count?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scheduled_charge_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_url?: string | null
          subtotal?: number
          supplies_total?: number | null
          total?: number
          tradie_id?: string | null
          tradie_responded_at?: string | null
          tradie_response?: string | null
          transferred_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_disputed_by_fkey"
            columns: ["disputed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_homeowner_id_fkey"
            columns: ["homeowner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_marked_paid_by_fkey"
            columns: ["marked_paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            isOneToOne: false
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_jobs: {
        Row: {
          agreed_price: number | null
          assigned_team_member_id: string | null
          auto_accept: boolean | null
          auto_invoice: boolean | null
          auto_remind: boolean | null
          billing_cycle: string | null
          cancellation_reason: string | null
          cancellation_reason_category: string | null
          cancelled_at: string | null
          client_contact_id: string | null
          client_id: string | null
          consumables_provider: string
          created_at: string | null
          day_of_week: number | null
          description: string | null
          end_date: string | null
          frequency_months: number
          id: string
          invoice_send_day: number | null
          invoice_send_time: string | null
          is_active: boolean | null
          last_completed_at: string | null
          last_invoiced_at: string | null
          location: string | null
          next_due_date: string | null
          original_job_id: string | null
          preferred_payment_method: string | null
          preferred_time: string | null
          reminder_days_before: number | null
          service_subtype: string | null
          supplies: Json | null
          times_completed: number | null
          trade_category: string
          tradie_id: string | null
          updated_at: string | null
        }
        Insert: {
          agreed_price?: number | null
          assigned_team_member_id?: string | null
          auto_accept?: boolean | null
          auto_invoice?: boolean | null
          auto_remind?: boolean | null
          billing_cycle?: string | null
          cancellation_reason?: string | null
          cancellation_reason_category?: string | null
          cancelled_at?: string | null
          client_contact_id?: string | null
          client_id?: string | null
          consumables_provider?: string
          created_at?: string | null
          day_of_week?: number | null
          description?: string | null
          end_date?: string | null
          frequency_months?: number
          id?: string
          invoice_send_day?: number | null
          invoice_send_time?: string | null
          is_active?: boolean | null
          last_completed_at?: string | null
          last_invoiced_at?: string | null
          location?: string | null
          next_due_date?: string | null
          original_job_id?: string | null
          preferred_payment_method?: string | null
          preferred_time?: string | null
          reminder_days_before?: number | null
          service_subtype?: string | null
          supplies?: Json | null
          times_completed?: number | null
          trade_category: string
          tradie_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agreed_price?: number | null
          assigned_team_member_id?: string | null
          auto_accept?: boolean | null
          auto_invoice?: boolean | null
          auto_remind?: boolean | null
          billing_cycle?: string | null
          cancellation_reason?: string | null
          cancellation_reason_category?: string | null
          cancelled_at?: string | null
          client_contact_id?: string | null
          client_id?: string | null
          consumables_provider?: string
          created_at?: string | null
          day_of_week?: number | null
          description?: string | null
          end_date?: string | null
          frequency_months?: number
          id?: string
          invoice_send_day?: number | null
          invoice_send_time?: string | null
          is_active?: boolean | null
          last_completed_at?: string | null
          last_invoiced_at?: string | null
          location?: string | null
          next_due_date?: string | null
          original_job_id?: string | null
          preferred_payment_method?: string | null
          preferred_time?: string | null
          reminder_days_before?: number | null
          service_subtype?: string | null
          supplies?: Json | null
          times_completed?: number | null
          trade_category?: string
          tradie_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_jobs_assigned_team_member_id_fkey"
            columns: ["assigned_team_member_id"]
            isOneToOne: false
            referencedRelation: "business_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_original_job_id_fkey"
            columns: ["original_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_sessions: {
        Row: {
          actual_date: string | null
          confirmation_deadline: string | null
          created_at: string | null
          end_time: string | null
          extra_cost: number | null
          extra_hours: number | null
          id: string
          notes: string | null
          proposed_end_time: string | null
          proposed_start_time: string | null
          recurring_job_id: string
          reschedule_by: string | null
          reschedule_reason: string | null
          scheduled_date: string
          start_time: string | null
          status: string
          supplies_used: Json | null
          supply_cost: number | null
          time_proposal_by: string | null
          updated_at: string | null
        }
        Insert: {
          actual_date?: string | null
          confirmation_deadline?: string | null
          created_at?: string | null
          end_time?: string | null
          extra_cost?: number | null
          extra_hours?: number | null
          id?: string
          notes?: string | null
          proposed_end_time?: string | null
          proposed_start_time?: string | null
          recurring_job_id: string
          reschedule_by?: string | null
          reschedule_reason?: string | null
          scheduled_date: string
          start_time?: string | null
          status?: string
          supplies_used?: Json | null
          supply_cost?: number | null
          time_proposal_by?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_date?: string | null
          confirmation_deadline?: string | null
          created_at?: string | null
          end_time?: string | null
          extra_cost?: number | null
          extra_hours?: number | null
          id?: string
          notes?: string | null
          proposed_end_time?: string | null
          proposed_start_time?: string | null
          recurring_job_id?: string
          reschedule_by?: string | null
          reschedule_reason?: string | null
          scheduled_date?: string
          start_time?: string | null
          status?: string
          supplies_used?: Json | null
          supply_cost?: number | null
          time_proposal_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_sessions_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            isOneToOne: false
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          client_id: string
          comment: string | null
          created_at: string | null
          id: string
          job_id: string | null
          rating: number
          recurring_job_id: string | null
          tradie_id: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          rating: number
          recurring_job_id?: string | null
          tradie_id: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          rating?: number
          recurring_job_id?: string | null
          tradie_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            isOneToOne: false
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_payment_methods: {
        Row: {
          account_last4: string | null
          bank_name: string | null
          bsb_last4: string | null
          client_id: string
          created_at: string
          id: string
          mandate_status: string
          payment_method_type: string
          recurring_job_id: string
          stripe_customer_id: string
          stripe_mandate_id: string | null
          stripe_payment_method_id: string
          tradie_id: string
          updated_at: string
        }
        Insert: {
          account_last4?: string | null
          bank_name?: string | null
          bsb_last4?: string | null
          client_id: string
          created_at?: string
          id?: string
          mandate_status?: string
          payment_method_type?: string
          recurring_job_id: string
          stripe_customer_id: string
          stripe_mandate_id?: string | null
          stripe_payment_method_id: string
          tradie_id: string
          updated_at?: string
        }
        Update: {
          account_last4?: string | null
          bank_name?: string | null
          bsb_last4?: string | null
          client_id?: string
          created_at?: string
          id?: string
          mandate_status?: string
          payment_method_type?: string
          recurring_job_id?: string
          stripe_customer_id?: string
          stripe_mandate_id?: string | null
          stripe_payment_method_id?: string
          tradie_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_payment_methods_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_payment_methods_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            isOneToOne: true
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_payment_methods_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          alert_enabled: boolean | null
          created_at: string | null
          filters: Json
          id: string
          last_alerted_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          alert_enabled?: boolean | null
          created_at?: string | null
          filters?: Json
          id?: string
          last_alerted_at?: string | null
          name: string
          user_id: string
        }
        Update: {
          alert_enabled?: boolean | null
          created_at?: string | null
          filters?: Json
          id?: string
          last_alerted_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_agreements: {
        Row: {
          address: string
          billing_cycle: string | null
          client_id: string
          created_at: string | null
          description: string | null
          ended_at: string | null
          id: string
          notes: string | null
          original_job_id: string | null
          original_quote_id: string | null
          postcode: string | null
          rate_includes_gst: boolean | null
          rate_per_visit: number
          started_at: string | null
          state: string | null
          status: string | null
          suburb: string | null
          title: string
          trade_category: string
          tradie_id: string
          typical_day: string | null
          typical_frequency: string | null
          typical_time: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          billing_cycle?: string | null
          client_id: string
          created_at?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          original_job_id?: string | null
          original_quote_id?: string | null
          postcode?: string | null
          rate_includes_gst?: boolean | null
          rate_per_visit: number
          started_at?: string | null
          state?: string | null
          status?: string | null
          suburb?: string | null
          title: string
          trade_category: string
          tradie_id: string
          typical_day?: string | null
          typical_frequency?: string | null
          typical_time?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          billing_cycle?: string | null
          client_id?: string
          created_at?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          original_job_id?: string | null
          original_quote_id?: string | null
          postcode?: string | null
          rate_includes_gst?: boolean | null
          rate_per_visit?: number
          started_at?: string | null
          state?: string | null
          status?: string | null
          suburb?: string | null
          title?: string
          trade_category?: string
          tradie_id?: string
          typical_day?: string | null
          typical_frequency?: string | null
          typical_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_original_job_id_fkey"
            columns: ["original_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_original_quote_id_fkey"
            columns: ["original_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_decline_tokens: {
        Row: {
          action: string | null
          action_taken_at: string | null
          agreed_price: number | null
          client_contact_id: string | null
          client_id: string | null
          created_at: string
          expires_at: string
          location: string | null
          new_job_id: string | null
          original_job_id: string | null
          recurring_job_id: string | null
          service_label: string | null
          token: string
          trade_category: string | null
          tradie_id: string | null
        }
        Insert: {
          action?: string | null
          action_taken_at?: string | null
          agreed_price?: number | null
          client_contact_id?: string | null
          client_id?: string | null
          created_at?: string
          expires_at?: string
          location?: string | null
          new_job_id?: string | null
          original_job_id?: string | null
          recurring_job_id?: string | null
          service_label?: string | null
          token?: string
          trade_category?: string | null
          tradie_id?: string | null
        }
        Update: {
          action?: string | null
          action_taken_at?: string | null
          agreed_price?: number | null
          client_contact_id?: string | null
          client_id?: string | null
          created_at?: string
          expires_at?: string
          location?: string | null
          new_job_id?: string | null
          original_job_id?: string | null
          recurring_job_id?: string | null
          service_label?: string | null
          token?: string
          trade_category?: string | null
          tradie_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_decline_tokens_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            isOneToOne: false
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_description_keywords: {
        Row: {
          created_at: string
          detail: string | null
          frequency: number
          id: string
          keyword: string
          last_seen_at: string
          service_type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          frequency?: number
          id?: string
          keyword: string
          last_seen_at?: string
          service_type: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          frequency?: number
          id?: string
          keyword?: string
          last_seen_at?: string
          service_type?: string
        }
        Relationships: []
      }
      service_description_raw: {
        Row: {
          client_id: string | null
          created_at: string
          description: string
          id: string
          service_type: string
          trade_category: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description: string
          id?: string
          service_type: string
          trade_category: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string
          id?: string
          service_type?: string
          trade_category?: string
        }
        Relationships: []
      }
      service_invoices: {
        Row: {
          agreement_id: string
          created_at: string | null
          due_date: string | null
          gst_amount: number
          id: string
          invoice_number: string
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          period_end: string
          period_start: string
          sent_at: string | null
          status: string | null
          subtotal: number
          total: number
          updated_at: string | null
          visit_count: number
        }
        Insert: {
          agreement_id: string
          created_at?: string | null
          due_date?: string | null
          gst_amount?: number
          id?: string
          invoice_number: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          period_end: string
          period_start: string
          sent_at?: string | null
          status?: string | null
          subtotal: number
          total: number
          updated_at?: string | null
          visit_count?: number
        }
        Update: {
          agreement_id?: string
          created_at?: string | null
          due_date?: string | null
          gst_amount?: number
          id?: string
          invoice_number?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          period_end?: string
          period_start?: string
          sent_at?: string | null
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string | null
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_invoices_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reminders: {
        Row: {
          category_name: string
          client_id: string
          created_at: string | null
          due_date: string
          id: string
          job_id: string
          location_address: string | null
          status: string
          tradie_id: string
        }
        Insert: {
          category_name?: string
          client_id: string
          created_at?: string | null
          due_date: string
          id?: string
          job_id: string
          location_address?: string | null
          status?: string
          tradie_id: string
        }
        Update: {
          category_name?: string
          client_id?: string
          created_at?: string | null
          due_date?: string
          id?: string
          job_id?: string
          location_address?: string | null
          status?: string
          tradie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visits: {
        Row: {
          agreement_id: string
          amount: number
          amount_includes_gst: boolean | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          status: string | null
          updated_at: string | null
          visit_date: string
          visit_type: string | null
        }
        Insert: {
          agreement_id: string
          amount: number
          amount_includes_gst?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          status?: string | null
          updated_at?: string | null
          visit_date: string
          visit_type?: string | null
        }
        Update: {
          agreement_id?: string
          amount?: number
          amount_includes_gst?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          status?: string | null
          updated_at?: string | null
          visit_date?: string
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_visit_invoice"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "service_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visit_events: {
        Row: {
          action: string
          created_at: string
          distance_m: number | null
          id: string
          job_id: string
          latitude: number | null
          longitude: number | null
          occurred_at: string
          quote_id: string | null
          tradie_id: string
        }
        Insert: {
          action: string
          created_at?: string
          distance_m?: number | null
          id?: string
          job_id: string
          latitude?: number | null
          longitude?: number | null
          occurred_at?: string
          quote_id?: string | null
          tradie_id: string
        }
        Update: {
          action?: string
          created_at?: string
          distance_m?: number | null
          id?: string
          job_id?: string
          latitude?: number | null
          longitude?: number | null
          occurred_at?: string
          quote_id?: string | null
          tradie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visit_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visit_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visit_events_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_send_log: {
        Row: {
          id: string
          notification_type: string | null
          phone_number: string
          sent_at: string
        }
        Insert: {
          id?: string
          notification_type?: string | null
          phone_number: string
          sent_at?: string
        }
        Update: {
          id?: string
          notification_type?: string | null
          phone_number?: string
          sent_at?: string
        }
        Relationships: []
      }
      standard_rates: {
        Row: {
          created_at: string | null
          description: string | null
          flat_rate: number | null
          id: string
          includes_materials: boolean | null
          is_active: boolean | null
          price_per_hour: number | null
          service_name: string
          tradie_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          flat_rate?: number | null
          id?: string
          includes_materials?: boolean | null
          is_active?: boolean | null
          price_per_hour?: number | null
          service_name: string
          tradie_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          flat_rate?: number | null
          id?: string
          includes_materials?: boolean | null
          is_active?: boolean | null
          price_per_hour?: number | null
          service_name?: string
          tradie_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "standard_rates_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          created_at: string | null
          customer_id: string
          deleted_at: string | null
          id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: never
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: never
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stripe_orders: {
        Row: {
          amount_subtotal: number
          amount_total: number
          checkout_session_id: string
          created_at: string | null
          currency: string
          customer_id: string
          deleted_at: string | null
          id: number
          payment_intent_id: string
          payment_status: string
          status: Database["public"]["Enums"]["stripe_order_status"]
          updated_at: string | null
        }
        Insert: {
          amount_subtotal: number
          amount_total: number
          checkout_session_id: string
          created_at?: string | null
          currency: string
          customer_id: string
          deleted_at?: string | null
          id?: never
          payment_intent_id: string
          payment_status: string
          status?: Database["public"]["Enums"]["stripe_order_status"]
          updated_at?: string | null
        }
        Update: {
          amount_subtotal?: number
          amount_total?: number
          checkout_session_id?: string
          created_at?: string | null
          currency?: string
          customer_id?: string
          deleted_at?: string | null
          id?: never
          payment_intent_id?: string
          payment_status?: string
          status?: Database["public"]["Enums"]["stripe_order_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      stripe_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          profile_id: string
          status: string
          stripe_customer_id: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          profile_id: string
          status?: string
          stripe_customer_id: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          profile_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_price_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: number
          is_training_mode_active: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          is_training_mode_active?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          is_training_mode_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          arrived_at: string | null
          business_owner_id: string
          created_at: string
          date: string
          departed_at: string | null
          description: string | null
          hours: number
          id: string
          job_id: string | null
          source: string
          status: string
          team_member_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          arrived_at?: string | null
          business_owner_id: string
          created_at?: string
          date: string
          departed_at?: string | null
          description?: string | null
          hours: number
          id?: string
          job_id?: string | null
          source?: string
          status?: string
          team_member_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          arrived_at?: string | null
          business_owner_id?: string
          created_at?: string
          date?: string
          departed_at?: string | null
          description?: string | null
          hours?: number
          id?: string
          job_id?: string | null
          source?: string
          status?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_business_owner_id_fkey"
            columns: ["business_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_categories: {
        Row: {
          created_at: string | null
          default_reminder_months: number
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          default_reminder_months?: number
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          default_reminder_months?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      trade_vacancies: {
        Row: {
          closing_date: string | null
          created_at: string
          description: string
          employer_business_name: string | null
          employer_id: string
          employer_name: string | null
          employer_verified: boolean
          employment_type: string | null
          experience_level: string | null
          hours: string | null
          id: string
          location: string
          pay_max: number | null
          pay_min: number | null
          pay_note: string | null
          pay_period: string | null
          required_tickets: string[]
          role_type: string
          start_date: string | null
          status: string
          title: string
          trade_category: string
          updated_at: string
        }
        Insert: {
          closing_date?: string | null
          created_at?: string
          description?: string
          employer_business_name?: string | null
          employer_id: string
          employer_name?: string | null
          employer_verified?: boolean
          employment_type?: string | null
          experience_level?: string | null
          hours?: string | null
          id?: string
          location?: string
          pay_max?: number | null
          pay_min?: number | null
          pay_note?: string | null
          pay_period?: string | null
          required_tickets?: string[]
          role_type?: string
          start_date?: string | null
          status?: string
          title: string
          trade_category?: string
          updated_at?: string
        }
        Update: {
          closing_date?: string | null
          created_at?: string
          description?: string
          employer_business_name?: string | null
          employer_id?: string
          employer_name?: string | null
          employer_verified?: boolean
          employment_type?: string | null
          experience_level?: string | null
          hours?: string | null
          id?: string
          location?: string
          pay_max?: number | null
          pay_min?: number | null
          pay_note?: string | null
          pay_period?: string | null
          required_tickets?: string[]
          role_type?: string
          start_date?: string | null
          status?: string
          title?: string
          trade_category?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_vacancies_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tradie_availability: {
        Row: {
          created_at: string | null
          date: string
          end_time: string
          id: string
          is_blocked: boolean | null
          reason: string | null
          source_job_id: string | null
          start_time: string
          tradie_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time: string
          id?: string
          is_blocked?: boolean | null
          reason?: string | null
          source_job_id?: string | null
          start_time: string
          tradie_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string
          id?: string
          is_blocked?: boolean | null
          reason?: string | null
          source_job_id?: string | null
          start_time?: string
          tradie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradie_availability_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tradie_details: {
        Row: {
          abn: string | null
          bio: string | null
          business_name: string
          contractor_type: string | null
          cookery_cert: string | null
          created_at: string | null
          default_call_out_fee_cents: number | null
          emergency_available: boolean | null
          food_safety_cert: string | null
          hourly_rate: number | null
          id: string
          insurance_document_url: string | null
          insurance_provider: string | null
          is_insured: boolean | null
          is_licensed: boolean | null
          is_verified: boolean | null
          license_number: string | null
          payout_speed_preference: string
          policy_number: string | null
          profile_id: string
          qualifications: string[] | null
          service_radius_km: number | null
          subscription_tier: string | null
          trade_category: string
          trade_type: string | null
          white_card: string | null
        }
        Insert: {
          abn?: string | null
          bio?: string | null
          business_name?: string
          contractor_type?: string | null
          cookery_cert?: string | null
          created_at?: string | null
          default_call_out_fee_cents?: number | null
          emergency_available?: boolean | null
          food_safety_cert?: string | null
          hourly_rate?: number | null
          id?: string
          insurance_document_url?: string | null
          insurance_provider?: string | null
          is_insured?: boolean | null
          is_licensed?: boolean | null
          is_verified?: boolean | null
          license_number?: string | null
          payout_speed_preference?: string
          policy_number?: string | null
          profile_id: string
          qualifications?: string[] | null
          service_radius_km?: number | null
          subscription_tier?: string | null
          trade_category?: string
          trade_type?: string | null
          white_card?: string | null
        }
        Update: {
          abn?: string | null
          bio?: string | null
          business_name?: string
          contractor_type?: string | null
          cookery_cert?: string | null
          created_at?: string | null
          default_call_out_fee_cents?: number | null
          emergency_available?: boolean | null
          food_safety_cert?: string | null
          hourly_rate?: number | null
          id?: string
          insurance_document_url?: string | null
          insurance_provider?: string | null
          is_insured?: boolean | null
          is_licensed?: boolean | null
          is_verified?: boolean | null
          license_number?: string | null
          payout_speed_preference?: string
          policy_number?: string | null
          profile_id?: string
          qualifications?: string[] | null
          service_radius_km?: number | null
          subscription_tier?: string | null
          trade_category?: string
          trade_type?: string | null
          white_card?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tradie_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tradie_subscriptions: {
        Row: {
          billing_cycle: string | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          grace_until: string | null
          id: string
          profile_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier_id: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          grace_until?: string | null
          id?: string
          profile_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier_id: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          grace_until?: string | null
          id?: string
          profile_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradie_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradie_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      typing_indicators: {
        Row: {
          conversation_id: string
          id: string
          is_typing: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_typing?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_typing?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_indicators_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_update_reads: {
        Row: {
          acknowledged_at: string | null
          id: string
          read_at: string
          update_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          id?: string
          read_at?: string
          update_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          id?: string
          read_at?: string
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_update_reads_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "platform_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_update_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vacancy_applications: {
        Row: {
          applicant_id: string
          cover_letter: string
          created_at: string
          id: string
          status: string
          vacancy_id: string
        }
        Insert: {
          applicant_id: string
          cover_letter?: string
          created_at?: string
          id?: string
          status?: string
          vacancy_id: string
        }
        Update: {
          applicant_id?: string
          cover_letter?: string
          created_at?: string
          id?: string
          status?: string
          vacancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacancy_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacancy_applications_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "public_vacancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacancy_applications_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "trade_vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_vacancies: {
        Row: {
          closing_date: string | null
          created_at: string | null
          description: string | null
          employer_business_name: string | null
          employer_name: string | null
          employer_verified: boolean | null
          employment_type: string | null
          experience_level: string | null
          hours: string | null
          id: string | null
          location: string | null
          pay_max: number | null
          pay_min: number | null
          pay_note: string | null
          pay_period: string | null
          required_tickets: string[] | null
          role_type: string | null
          start_date: string | null
          title: string | null
          trade_category: string | null
        }
        Insert: {
          closing_date?: string | null
          created_at?: string | null
          description?: string | null
          employer_business_name?: string | null
          employer_name?: string | null
          employer_verified?: boolean | null
          employment_type?: string | null
          experience_level?: string | null
          hours?: string | null
          id?: string | null
          location?: string | null
          pay_max?: number | null
          pay_min?: number | null
          pay_note?: string | null
          pay_period?: string | null
          required_tickets?: string[] | null
          role_type?: string | null
          start_date?: string | null
          title?: string | null
          trade_category?: string | null
        }
        Update: {
          closing_date?: string | null
          created_at?: string | null
          description?: string | null
          employer_business_name?: string | null
          employer_name?: string | null
          employer_verified?: boolean | null
          employment_type?: string | null
          experience_level?: string | null
          hours?: string | null
          id?: string | null
          location?: string | null
          pay_max?: number | null
          pay_min?: number | null
          pay_note?: string | null
          pay_period?: string | null
          required_tickets?: string[] | null
          role_type?: string | null
          start_date?: string | null
          title?: string | null
          trade_category?: string | null
        }
        Relationships: []
      }
      stripe_user_orders: {
        Row: {
          amount_subtotal: number | null
          amount_total: number | null
          checkout_session_id: string | null
          currency: string | null
          customer_id: string | null
          order_date: string | null
          order_id: number | null
          order_status:
            | Database["public"]["Enums"]["stripe_order_status"]
            | null
          payment_intent_id: string | null
          payment_status: string | null
        }
        Relationships: []
      }
      stripe_user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          current_period_end: string | null
          current_period_start: string | null
          customer_id: string | null
          price_id: string | null
          subscription_id: string | null
          subscription_status: string | null
        }
        Relationships: []
      }
      tradie_ratings: {
        Row: {
          average_rating: number | null
          five_star_count: number | null
          four_star_count: number | null
          one_star_count: number | null
          three_star_count: number | null
          total_reviews: number | null
          tradie_id: string | null
          two_star_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_tradie_id_fkey"
            columns: ["tradie_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_complete_ended_projects: { Args: never; Returns: undefined }
      can_read_job_attachment: { Args: { path: string }; Returns: boolean }
      can_view_job_tracking: {
        Args: { p_job_id: string; p_uid: string }
        Returns: boolean
      }
      consume_estimate_pack_credit: {
        Args: { p_profile_id: string }
        Returns: string
      }
      create_notification: {
        Args: {
          p_channel?: string
          p_job_id?: string
          p_link?: string
          p_message: string
          p_metadata?: Json
          p_read?: boolean
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_payment_request:
        | { Args: { p_amount?: number; p_job_id: string }; Returns: string }
        | { Args: { p_amount?: number; p_job_id: string }; Returns: string }
      delete_old_declined_jobs: { Args: never; Returns: undefined }
      delete_user_account: { Args: never; Returns: undefined }
      employer_approve_member: {
        Args: { member_id: string }
        Returns: undefined
      }
      employer_decline_member: {
        Args: { member_id: string }
        Returns: undefined
      }
      employer_remove_member: {
        Args: { member_id: string }
        Returns: undefined
      }
      get_area_price_range: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_property?: string
          p_trade: string
        }
        Returns: {
          price_high: number
          price_low: number
          price_mid: number
          sample_size: number
        }[]
      }
      get_daily_profile_view_count: {
        Args: { viewer_uuid: string }
        Returns: number
      }
      get_job_site_visits: {
        Args: { p_job_id: string }
        Returns: {
          action: string
          latitude: number
          longitude: number
          occurred_at: string
          tradie_id: string
          tradie_name: string
        }[]
      }
      get_job_tracking_meta: {
        Args: { p_job_id: string }
        Returns: {
          address: string
          client_id: string
          latitude: number
          longitude: number
          owner_id: string
          radius_m: number
          title: string
        }[]
      }
      get_my_time_entries: {
        Args: { p_since: string; p_until: string }
        Returns: {
          arrived_at: string
          departed_at: string
          employer_name: string
          entry_date: string
          hours: number
          id: string
          job_id: string
          job_title: string
          source: string
          status: string
        }[]
      }
      get_platform_stats: { Args: never; Returns: Json }
      get_service_worker_details: {
        Args: { p_recurring_job_id: string }
        Returns: {
          abn_verified: boolean
          business_name: string
          declared_trades: string[]
          employment_type: string
          identity_verified: boolean
          license_verified: boolean
          qualifications: string[]
          trade_specialty: string
          verified_trades: string[]
          white_card: string
          worker_name: string
        }[]
      }
      get_team_site_activity: {
        Args: { p_since?: string }
        Returns: {
          action: string
          distance_m: number
          employment_type: string
          job_address: string
          job_id: string
          job_title: string
          latitude: number
          longitude: number
          occurred_at: string
          tradie_id: string
          tradie_name: string
        }[]
      }
      get_user_conversation_ids: { Args: { uid: string }; Returns: string[] }
      has_user_engagement: { Args: { user_uuid: string }; Returns: boolean }
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_creator: {
        Args: { conv_id: string; user_id: string }
        Returns: boolean
      }
      is_tradie_verified: { Args: { p_user_id: string }; Returns: boolean }
      notify_approaching_reminders: { Args: never; Returns: undefined }
      refresh_open_vacancy_employer_snapshot: {
        Args: { p_employer: string }
        Returns: undefined
      }
      search_businesses_by_name: {
        Args: { search_term: string }
        Returns: {
          business_name: string
          full_name: string
          profile_id: string
          trade_category: string
        }[]
      }
      submit_custom_task: {
        Args: { p_task_name: string; p_trade_context?: string }
        Returns: undefined
      }
    }
    Enums: {
      stripe_order_status: "pending" | "completed" | "canceled"
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
      stripe_order_status: ["pending", "completed", "canceled"],
    },
  },
} as const
