export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlatformRole = "platform_admin" | "billing_admin";
export type CompanyRole = "owner" | "recruiter" | "billing" | "viewer";
export type CompanyVerificationStatus = "pending" | "verified" | "rejected" | "suspended";
export type MembershipStatus = "active" | "pending" | "suspended";
export type CompanyProfileSubmissionStatus = "pending" | "approved" | "rejected";

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5.0";
  };
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          display_name: string;
          locale: string;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          display_name?: string;
          locale?: string;
          status?: never;
          created_at?: never;
          updated_at?: never;
        },
        {
          display_name?: string;
          locale?: string;
          id?: never;
          status?: never;
          created_at?: never;
          updated_at?: never;
        }
      >;
      user_roles: Table<
        {
          user_id: string;
          role: PlatformRole;
          granted_by: string | null;
          created_at: string;
        },
        {
          user_id: string;
          role: PlatformRole;
          granted_by?: string | null;
          created_at?: never;
        },
        never
      >;
      candidate_profiles: Table<
        {
          user_id: string;
          headline: string | null;
          location: string | null;
          skills: string[];
          experience: Json;
          education: Json;
          languages: Json;
          certifications: Json;
          visibility: string;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          headline?: string | null;
          location?: string | null;
          skills?: string[];
          experience?: Json;
          education?: Json;
          languages?: Json;
          certifications?: Json;
          visibility?: string;
          created_at?: never;
          updated_at?: never;
        },
        {
          headline?: string | null;
          location?: string | null;
          skills?: string[];
          experience?: Json;
          education?: Json;
          languages?: Json;
          certifications?: Json;
          visibility?: string;
          user_id?: never;
          created_at?: never;
          updated_at?: never;
        }
      >;
      companies: Table<
        {
          id: string;
          name: string;
          slug: string;
          verification_status: CompanyVerificationStatus;
          profile_description: string;
          categories: string[];
          website: string | null;
          phone: string | null;
          public_email: string | null;
          address: string | null;
          municipality: string | null;
          directory_entry_id: string | null;
          directory_location_index: number | null;
          source_profile_url: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name: string;
          slug: string;
          verification_status?: never;
          created_at?: never;
          updated_at?: never;
        },
        never
      >;
      company_members: Table<
        {
          company_id: string;
          user_id: string;
          membership_role: CompanyRole;
          status: MembershipStatus;
          invited_by: string | null;
          created_at: string;
        },
        {
          company_id: string;
          user_id: string;
          membership_role: CompanyRole;
          status?: never;
          invited_by?: string | null;
          created_at?: never;
        },
        never
      >;
      audit_logs: Table<
        {
          id: string;
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata_redacted: Json;
          created_at: string;
        },
        never,
        never
      >;
      company_profile_submissions: Table<
        {
          id: string;
          company_id: string;
          submitted_by: string;
          company_name: string;
          profile_description: string;
          categories: string[];
          website: string | null;
          phone: string | null;
          public_email: string | null;
          address: string | null;
          municipality: string | null;
          directory_entry_id: string | null;
          directory_location_index: number | null;
          status: CompanyProfileSubmissionStatus;
          review_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          company_id: string;
          submitted_by: string;
          company_name: string;
          profile_description?: string;
          categories?: string[];
          website?: string | null;
          phone?: string | null;
          public_email?: string | null;
          address?: string | null;
          municipality?: string | null;
          directory_entry_id?: string | null;
          directory_location_index?: number | null;
          status?: never;
          review_note?: never;
          reviewed_by?: never;
          reviewed_at?: never;
          created_at?: never;
          updated_at?: never;
        },
        {
          company_name?: string;
          profile_description?: string;
          categories?: string[];
          website?: string | null;
          phone?: string | null;
          public_email?: string | null;
          address?: string | null;
          municipality?: string | null;
          directory_entry_id?: string | null;
          directory_location_index?: number | null;
          id?: never;
          company_id?: never;
          submitted_by?: never;
          status?: never;
          review_note?: never;
          reviewed_by?: never;
          reviewed_at?: never;
          created_at?: never;
          updated_at?: never;
        }
      >;
      company_directory_overrides: Table<
        {
          directory_entry_id: string;
          directory_location_index: number;
          company_name: string;
          profile_description: string;
          categories: string[];
          website: string | null;
          phone: string | null;
          public_email: string | null;
          address: string | null;
          municipality: string | null;
          updated_at: string;
        },
        never,
        never
      >;
      job_packages: Table<
        {
          id: string;
          code: string;
          display_name: string;
          description: string;
          max_active_jobs: number;
          job_duration_days: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        never,
        never
      >;
      company_job_package_assignments: Table<
        {
          id: string;
          company_id: string;
          package_id: string;
          max_active_jobs_snapshot: number;
          job_duration_days_snapshot: number;
          assigned_by: string;
          starts_at: string;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        },
        never,
        never
      >;
      jobs: Table<
        {
          id: string;
          company_id: string;
          created_by: string;
          title: string;
          slug: string;
          summary: string;
          description: string;
          requirements: string;
          responsibilities: string;
          job_type: string;
          workplace_mode: string;
          district: string | null;
          status: string;
          moderation_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          published_at: string | null;
          expires_at: string | null;
          publication_source: string;
          search_vector: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          company_id: string;
          created_by?: string;
          title: string;
          slug: string;
          summary: string;
          description: string;
          requirements?: string;
          responsibilities?: string;
          job_type: string;
          workplace_mode: string;
          district?: string | null;
          status?: never;
          moderation_note?: never;
          reviewed_by?: never;
          reviewed_at?: never;
          published_at?: never;
          expires_at?: never;
          publication_source?: never;
          search_vector?: never;
          created_at?: never;
          updated_at?: never;
        },
        {
          title?: string;
          slug?: string;
          summary?: string;
          description?: string;
          requirements?: string;
          responsibilities?: string;
          job_type?: string;
          workplace_mode?: string;
          district?: string | null;
          id?: never;
          company_id?: never;
          created_by?: never;
          status?: never;
          moderation_note?: never;
          reviewed_by?: never;
          reviewed_at?: never;
          published_at?: never;
          expires_at?: never;
          publication_source?: never;
          search_vector?: never;
          created_at?: never;
          updated_at?: never;
        }
      >;
      applications: Table<
        {
          id: string;
          job_id: string;
          candidate_id: string;
          cover_letter: string;
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          first_viewed_at: string | null;
          first_viewed_by: string | null;
          created_at: string;
          updated_at: string;
        },
        never,
        never
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_company: {
        Args: { company_name: string; company_slug: string };
        Returns: string;
      };
      has_platform_role: {
        Args: { _role: PlatformRole };
        Returns: boolean;
      };
      admin_list_job_packages: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          code: string;
          display_name: string;
          description: string;
          max_active_jobs: number;
          job_duration_days: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }[];
      };
      admin_list_verified_companies: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          slug: string;
          package_id: string | null;
          package_code: string | null;
          package_name: string | null;
          max_active_jobs: number | null;
          job_duration_days: number | null;
          active_jobs: number;
          assignment_expires_at: string | null;
        }[];
      };
      is_active_company_member: {
        Args: { _company_id: string; _allowed_roles?: CompanyRole[] | null };
        Returns: boolean;
      };
      review_company_profile_submission: {
        Args: { _submission_id: string; _decision: string; _review_note?: string | null };
        Returns: undefined;
      };
      submit_job_for_review: {
        Args: { _job_id: string };
        Returns: undefined;
      };
      review_job: {
        Args: { _job_id: string; _decision: string; _review_note?: string | null };
        Returns: undefined;
      };
      apply_to_job: {
        Args: {
          _job_id: string;
          _cover_letter?: string;
          _share_contact_email?: boolean;
        };
        Returns: string;
      };
      mark_application_viewed: {
        Args: { _application_id: string };
        Returns: string;
      };
      get_application_contact_email: {
        Args: { _application_id: string };
        Returns: string;
      };
      list_my_applications: {
        Args: Record<PropertyKey, never>;
        Returns: {
          application_id: string;
          job_id: string;
          job_title: string;
          job_slug: string;
          application_status: string;
          submitted_at: string;
          first_viewed_at: string | null;
        }[];
      };
      list_company_applications: {
        Args: { _company_id: string };
        Returns: {
          application_id: string;
          job_id: string;
          job_title: string;
          candidate_name: string;
          application_status: string;
          submitted_at: string;
          first_viewed_at: string | null;
        }[];
      };
      get_company_application_detail: {
        Args: { _application_id: string };
        Returns: {
          application_id: string;
          job_id: string;
          job_title: string;
          candidate_name: string;
          cover_letter: string;
          application_status: string;
          submitted_at: string;
          first_viewed_at: string | null;
          contact_email: string | null;
        }[];
      };
      list_my_application_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: {
          notification_id: string;
          event_type: string;
          application_id: string;
          job_title: string;
          application_status: string | null;
          created_at: string;
          read_at: string | null;
        }[];
      };
      transition_application: {
        Args: { _application_id: string; _next_status: string };
        Returns: undefined;
      };
      admin_save_job_package: {
        Args: {
          _package_id: string | null;
          _code: string;
          _display_name: string;
          _description: string;
          _max_active_jobs: number;
          _job_duration_days: number;
          _is_active: boolean;
        };
        Returns: string;
      };
      admin_assign_company_job_package: {
        Args: {
          _company_id: string;
          _package_id: string;
          _expires_at: string | null;
        };
        Returns: string;
      };
      publish_approved_job: {
        Args: { _job_id: string };
        Returns: undefined;
      };
      get_company_job_entitlements: {
        Args: { _company_id: string };
        Returns: {
          package_id: string;
          package_code: string;
          package_name: string;
          max_active_jobs: number;
          job_duration_days: number;
          active_jobs: number;
          assignment_expires_at: string | null;
        }[];
      };
      search_public_job_previews: {
        Args: {
          _query?: string;
          _district?: string | null;
          _job_type?: string | null;
          _workplace_mode?: string | null;
          _page?: number;
        };
        Returns: {
          job_title: string | null;
          company_name: string | null;
          total_count: number;
        }[];
      };
      search_public_job_companies: {
        Args: Record<PropertyKey, never>;
        Returns: {
          company_name: string;
          company_slug: string;
          active_job_count: number;
          profile_description: string | null;
          categories: string[];
          website: string | null;
          municipality: string | null;
          source_profile_url: string | null;
          logo_url: string | null;
          source_sites: string[];
          source_listing_url: string | null;
        }[];
      };
      search_public_jobs: {
        Args: {
          _query?: string;
          _district?: string | null;
          _job_type?: string | null;
          _workplace_mode?: string | null;
          _page?: number;
        };
        Returns: Json;
      };
      get_public_job_details: {
        Args: { _slug: string };
        Returns: Json;
      };
      submit_feedback: {
        Args: {
          _name: string | null;
          _email: string | null;
          _category: string;
          _rating: number | null;
          _message: string;
          _locale: string;
        };
        Returns: string;
      };
      submit_sales_lead: {
        Args: {
          _company_name: string | null;
          _contact_name: string | null;
          _email: string;
          _phone: string | null;
          _plan: string | null;
          _duration_days: number | null;
          _note: string | null;
          _locale: string;
        };
        Returns: string;
      };
      opt_out_engagement: {
        Args: { _email: string; _reason: string | null };
        Returns: undefined;
      };
      list_engagement_recipients: {
        Args: { _after: string | null; _batch_size: number };
        Returns: {
          user_id: string;
          email: string;
          display_name: string | null;
          locale: string | null;
        }[];
      };
      get_public_site_content: {
        Args: { _locale: string; _keys?: string[] | null };
        Returns: {
          content_key: string;
          locale: string;
          document: Json;
          updated_at: string;
        }[];
      };
      get_public_faq: {
        Args: { _locale: string };
        Returns: {
          id: string;
          question: string;
          answer: string;
          sort_order: number;
        }[];
      };
      get_public_listing_plans: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          audience: string;
          name: string;
          blurb: string;
          features: string[];
          color: string;
          listing_count: number | null;
          price_1: number;
          price_7: number;
          price_30: number;
          sort_order: number;
        }[];
      };
      get_public_directory: {
        Args: Record<PropertyKey, never>;
        Returns: {
          directory_entry_id: string;
          name: string;
          categories: string[];
          logo_file: string | null;
          logo_width: number | null;
          logo_height: number | null;
          locations: Json;
        }[];
      };
      admin_list_faq_entries: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          locale: string;
          question: string;
          answer: string;
          sort_order: number;
          is_published: boolean;
        }[];
      };
      admin_list_site_content: {
        Args: Record<PropertyKey, never>;
        Returns: {
          content_key: string;
          locale: string;
          document: Json;
          updated_at: string;
        }[];
      };
      admin_list_listing_plans: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          audience: string;
          name: string;
          blurb: string;
          features: string[];
          color: string;
          listing_count: number | null;
          price_1: number;
          price_7: number;
          price_30: number;
          is_active: boolean;
          sort_order: number;
          updated_at: string;
        }[];
      };
      admin_upsert_site_content: {
        Args: { _content_key: string; _locale: string; _document: Json };
        Returns: undefined;
      };
      admin_upsert_faq_entry: {
        Args: {
          _id: string | null;
          _locale: string;
          _question: string;
          _answer: string;
          _sort_order: number;
          _is_published: boolean;
        };
        Returns: string;
      };
      admin_delete_faq_entry: {
        Args: { _id: string };
        Returns: undefined;
      };
      admin_upsert_listing_plan: {
        Args: {
          _code: string;
          _audience: string;
          _name: string;
          _blurb: string;
          _features: string[];
          _color: string;
          _listing_count: number | null;
          _price_1: number;
          _price_7: number;
          _price_30: number;
          _is_active: boolean;
          _sort_order: number;
        };
        Returns: undefined;
      };
      admin_upsert_directory_company: {
        Args: {
          _directory_entry_id: string;
          _name: string;
          _categories: string[];
          _logo_file: string | null;
          _logo_domain: string | null;
          _logo_width: number | null;
          _logo_height: number | null;
          _locations: Json;
        };
        Returns: undefined;
      };
      admin_delete_directory_company: {
        Args: { _directory_entry_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      platform_role: PlatformRole;
      company_role: CompanyRole;
      company_verification_status: CompanyVerificationStatus;
      membership_status: MembershipStatus;
      company_profile_submission_status: CompanyProfileSubmissionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
