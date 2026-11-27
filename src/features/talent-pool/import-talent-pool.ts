"use server";

import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { getCurrentUser } from "@/server/dal/user";
import { hasAssignedPlatformRole } from "@/server/dal/user";
import type { Json } from "@/types/database";

export type TalentPoolEntryInput = {
  full_name: string;
  email: string;
  phone?: string;
  headline?: string;
  location?: string;
  summary?: string;
  skills?: string[];
  experience?: unknown;
  education?: unknown;
  languages?: unknown;
  certifications?: unknown;
  links?: unknown;
  source?: string;
  source_ref?: string;
  is_searchable?: boolean;
};

export type ImportTalentPoolState = {
  status: "idle" | "error" | "success";
  message: string;
  count?: number;
  imported?: number;
  updated?: number;
};

const TALENT_POOL_TEMPLATE: TalentPoolEntryInput[] = [
  {
    full_name: "Ayşe Demir",
    email: "ayse.demir@example.com",
    phone: "+90 539 111 22 33",
    headline: "Yazılım Mühendisi",
    location: "Lefkoşa",
    summary: "React ve TypeScript ile web uygulamaları geliştiren full-stack yazılım mühendisi.",
    skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    links: [],
    source: "bulk_import",
    is_searchable: true,
  },
];

export async function importTalentPool(
  _previousState: ImportTalentPoolState | null,
  formData: FormData,
): Promise<ImportTalentPoolState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "error", message: "Oturum açmış bir kullanıcı olmalısınız." };
  }
  if (!(await hasAssignedPlatformRole("platform_admin"))) {
    return { status: "error", message: "Yalnızca platform yöneticileri aday içe aktarabilir." };
  }

  const rawJson = formData.get("jsonData");
  if (typeof rawJson !== "string" || !rawJson.trim()) {
    return { status: "error", message: "Lütfen içe aktarılacak JSON verilerini giriniz." };
  }

  let entries: TalentPoolEntryInput[];
  try {
    entries = JSON.parse(rawJson);
  } catch {
    return {
      status: "error",
      message: "Geçersiz JSON formatı. Lütfen bir JSON dizisi giriniz.",
    };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      status: "error",
      message: "JSON bir dizi olmalı ve en az bir aday kaydı içermelidir.",
    };
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return { status: "error", message: "Sunucu istemcisi yapılandırılamadı." };
  }

  const { error } = await supabase.rpc("admin_bulk_import_talent_pool", {
    _entries: entries as unknown as Json,
  });

  if (error) {
    return {
      status: "error",
      message: error.message || "İçe aktarma sırasında bir hata oluştu.",
    };
  }

  return { status: "success", message: "İçe aktarma tamamlandı.", count: entries.length };
}
