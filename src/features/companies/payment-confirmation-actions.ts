"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getCurrentUser } from "@/server/dal/user";
import { getEmployerWorkspace } from "@/server/dal/companies";
import { getPackageByCode } from "@/server/dal/admin-packages";
import type { CreatePaymentConfirmationFormState } from "./schemas";

const packagePrices: Record<string, Record<number, number>> = {
  "singleListing": { 1: 290, 7: 690, 30: 1290 },
  "growth": { 1: 590, 7: 1390, 30: 2790 },
  "professional": { 1: 890, 7: 2090, 30: 3990 },
};

async function createPaymentConfirmationInternal(
  formData: FormData,
): Promise<CreatePaymentConfirmationFormState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "unauthorized" };
  if (user.status !== "active") return { status: "error", message: "inactive" };

  const packageCode = formData.get("packageCode") as string;
  const durationDays = formData.get("durationDays");
  const channel = formData.get("channel") as "whatsapp" | "email";

  if (!packageCode || (channel !== "whatsapp" && channel !== "email")) {
    return { status: "error", message: "invalid" };
  }

  const workspace = await getEmployerWorkspace();
  const company = workspace.company;

  if (company.verification_status !== "verified") {
    return { status: "error", message: "companyNotVerified" };
  }

  const jobPackage = await getPackageByCode(packageCode);
  if (!jobPackage || !jobPackage.is_active) {
    return { status: "error", message: "packageUnavailable" };
  }

  const duration = durationDays ? parseInt(durationDays as string, 10) : 30;
  if (![1, 7, 30].includes(duration)) {
    return { status: "error", message: "invalidDuration" };
  }

  const price = packagePrices[packageCode]?.[duration];
  if (price === undefined) {
    return { status: "error", message: "packageUnavailable" };
  }

  const supabase = await createSupabaseServerClient();

  const { data: existingConfirmation, error: lookupError } = await supabase
    .from("payment_confirmations")
    .select("id")
    .eq("company_id", company.id)
    .eq("package_id", jobPackage.id)
    .maybeSingle();

  if (lookupError) {
    console.error("Payment confirmation lookup failed.", { code: lookupError.code });
    return { status: "error", message: "failed" };
  }

  if (!existingConfirmation) {
    const { error: insertError } = await supabase.rpc(
      // @ts-expect-error - RPC not yet in generated types
      "create_payment_confirmation",
      {
        _company_id: company.id,
        _package_id: jobPackage.id,
        _amount: price,
        _currency: "TRY",
      },
    );

    if (insertError) {
      console.error("Payment confirmation creation failed.", { code: insertError.code });
      return { status: "error", message: "failed" };
    }
  }

  const whatsappUrl = `https://wa.me/905391316421?text=${encodeURIComponent(
    `Merhaba İşBul KKTC, ${company.name} adına ${jobPackage.display_name} ilan paketini satın almak istiyorum. IBAN ödeme bilgilerini paylaşabilir misiniz?`,
  )}`;

  const emailSubject = `Paket siparişi: ${company.name} - ${jobPackage.display_name}`;
  const emailBody = `Merhaba İşBul KKTC ekibi,\n\n${company.name} adına ${jobPackage.display_name} ilan paketini satın almak istiyorum. IBAN ödeme bilgilerini paylaşabilir misiniz?\n\nŞirket: ${company.name}\nPaket: ${jobPackage.display_name}\nSüre: ${duration} gün\nTutar: ${price} TRY`;

  const emailUrl = `mailto:info@isbulkktc.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  const redirectUrl = channel === "whatsapp" ? whatsappUrl : emailUrl;

  redirect(redirectUrl);
}

/** Form action wrapper that only accepts FormData (for use with <form action={...}>). */
export async function createPaymentConfirmationAction(
  formData: FormData,
): Promise<void> {
  await createPaymentConfirmationInternal(formData);
}

/** For use with useActionState (takes previousState + formData). */
export async function createPaymentConfirmation(
  _previousState: CreatePaymentConfirmationFormState,
  formData: FormData,
): Promise<CreatePaymentConfirmationFormState> {
  return createPaymentConfirmationInternal(formData);
}