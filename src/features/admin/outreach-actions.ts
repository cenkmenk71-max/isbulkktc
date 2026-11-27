"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { requirePlatformRole } from "@/server/dal/user";
import { sendMarketingEmail } from "@/server/email/mailer";
import { unsubscribeUrlFor, isUnsubscribeSigningConfigured } from "@/server/email/unsubscribe-token-core";
import { getAppBaseUrl } from "@/server/config/app-url";

const MAX_BATCH_SIZE = 25;

const RecipientSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  email: z.string().email(),
  locale: z.enum(["tr", "en"]).default("tr"),
});

const OutreachInputSchema = z.object({
  recipients: z.array(RecipientSchema).min(1).max(MAX_BATCH_SIZE),
  testMode: z.boolean().default(false),
  testEmail: z.string().email().optional(),
});

type Recipient = z.infer<typeof RecipientSchema>;
type OutreachInput = z.infer<typeof OutreachInputSchema>;

type SendResult = {
  email: string;
  status: "sent" | "unsubscribed_skipped" | "invalid_email" | "error";
  message?: string;
};

type OutreachResponse = {
  success: boolean;
  results: SendResult[];
  summary: {
    sent: number;
    skipped: number;
    invalid: number;
    errors: number;
  };
};

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function deduplicateRecipients(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const norm = normaliseEmail(r.email);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

export async function sendOutreachEmails(input: OutreachInput): Promise<OutreachResponse> {
  await requirePlatformRole("platform_admin");

  const parsed = OutreachInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      results: [],
      summary: { sent: 0, skipped: 0, invalid: 0, errors: 0 },
    };
  }

  const { recipients, testMode, testEmail } = parsed.data;

  if (!isUnsubscribeSigningConfigured()) {
    return {
      success: false,
      results: recipients.map((r) => ({
        email: r.email,
        status: "error" as const,
        message: "Unsubscribe signing is not configured",
      })),
      summary: { sent: 0, skipped: 0, invalid: 0, errors: recipients.length },
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      results: recipients.map((r) => ({
        email: r.email,
        status: "error" as const,
        message: "Database not configured",
      })),
      summary: { sent: 0, skipped: 0, invalid: 0, errors: recipients.length },
    };
  }

  const uniqueRecipients = deduplicateRecipients(recipients);
  const invalidEmails = recipients.length - uniqueRecipients.length;

  const results: SendResult[] = [];
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  if (testMode && testEmail) {
    const unsubscribeUrl = unsubscribeUrlFor(testEmail, getAppBaseUrl(), "tr");
    if (!unsubscribeUrl) {
      return {
        success: false,
        results: [{ email: testEmail, status: "error", message: "Could not generate unsubscribe URL" }],
        summary: { sent: 0, skipped: 0, invalid: 0, errors: 1 },
      };
    }

    try {
      const accepted = await sendMarketingEmail({
        to: testEmail,
        locale: "tr",
        unsubscribeUrl,
        campaignId: `outreach-${Date.now()}-0`,
      });

      if (accepted) {
        results.push({ email: testEmail, status: "sent", message: "Test email sent" });
        sent = 1;
      } else {
        results.push({ email: testEmail, status: "error", message: "Resend rejected the email" });
        errors = 1;
      }
    } catch (error) {
      results.push({
        email: testEmail,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      errors = 1;
    }

    return {
      success: sent > 0,
      results,
      summary: { sent, skipped: 0, invalid: invalidEmails, errors },
    };
  }

  if (uniqueRecipients.length === 0) {
    return {
      success: false,
      results: [{ email: "", status: "error", message: "No valid recipients after deduplication" }],
      summary: { sent: 0, skipped: 0, invalid: invalidEmails, errors: 1 },
    };
  }

  const emailsToCheck = uniqueRecipients.map((r) => normaliseEmail(r.email));

  type OptoutRow = { email: string };
  const { data: unsubscribedRows, error: unsubError } = await supabase
    .from("email_engagement_optouts")
    .select("email")
    .in("email", emailsToCheck);

  if (unsubError) {
    console.error("Failed to check unsubscribe status", { error: unsubError });
  }

  const unsubscribedEmails = new Set(
    ((unsubscribedRows ?? []) as OptoutRow[]).map((row) => normaliseEmail(row.email)),
  );

  const siteUrl = getAppBaseUrl();

  for (let index = 0; index < uniqueRecipients.length; index += 1) {
    const recipient = uniqueRecipients[index];
    const normEmail = normaliseEmail(recipient.email);

    if (unsubscribedEmails.has(normEmail)) {
      results.push({
        email: recipient.email,
        status: "unsubscribed_skipped",
        message: "Alıcı pazarlama e-postalarından abonelikten çıkmış",
      });
      skipped += 1;
      continue;
    }

    const unsubscribeUrl = unsubscribeUrlFor(recipient.email, siteUrl, recipient.locale);
    if (!unsubscribeUrl) {
      results.push({
        email: recipient.email,
        status: "error",
        message: "Abonelikten çıkış bağlantısı oluşturulamadı",
      });
      errors += 1;
      continue;
    }

    const campaignId = `outreach-${Date.now()}-${index}`;
    const accepted = await sendMarketingEmail({
      to: recipient.email,
      locale: recipient.locale,
      unsubscribeUrl,
      campaignId,
    });

    if (accepted) {
      results.push({ email: recipient.email, status: "sent", message: "E-posta başarıyla gönderildi" });
      sent += 1;
    } else {
      results.push({ email: recipient.email, status: "error", message: "Resend e-postayı reddetti" });
      errors += 1;
    }
  }

  return {
    success: sent > 0,
    results,
    summary: { sent, skipped, invalid: invalidEmails, errors },
  };
}

export async function getCompaniesWithEmail(): Promise<
  Array<{ name: string; email: string }>
> {
  await requirePlatformRole("platform_admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("companies")
    .select("name, public_email")
    .not("public_email", "is", null)
    .eq("verification_status", "verified")
    .order("name");

  if (error) {
    console.error("Failed to fetch companies", { error });
    return [];
  }

  return (data ?? []).map((c) => ({ name: c.name, email: c.public_email! }));
}

export async function getSalesLeadsWithEmail(): Promise<
  Array<{ name: string | null; email: string }>
> {
  await requirePlatformRole("platform_admin");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("sales_leads")
    .select("company_name, contact_name, email")
    .not("email", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to fetch sales leads", { error });
    return [];
  }

  type SalesLeadRow = { company_name: string | null; contact_name: string | null; email: string };
  return ((data ?? []) as SalesLeadRow[]).map((l) => ({
    name: l.company_name ?? l.contact_name,
    email: l.email,
  }));
}