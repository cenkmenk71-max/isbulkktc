"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getCurrentUser } from "@/server/dal/user";
import { redirectLocalized } from "@/i18n/redirect";

const createOrderSchema = z.object({
  companyId: z.string().uuid(),
  packageId: z.string().uuid(),
});

const submitPaymentSchema = z.object({
  orderId: z.string().uuid(),
  senderName: z.string().min(2).max(120).trim(),
  transferReference: z.string().min(4).max(60).trim().toUpperCase(),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3).toUpperCase(),
  transferredAt: z.string().datetime(),
  receiptStoragePath: z.string().max(500).optional().nullable(),
});

export async function createOrderAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return redirectLocalized("/login?audience=employer");
  if (user.status !== "active") {
    redirectLocalized(`/login?audience=employer&error=account`);
  }

  const parsed = createOrderSchema.safeParse({
    companyId: formData.get("companyId"),
    packageId: formData.get("packageId"),
  });

  if (!parsed.success) {
    redirectLocalized(`/company/dashboard/orders/new?company=${formData.get("companyId")}&error=invalid_data`);
  }

  const companyId = parsed.data!.companyId;
  const packageId = parsed.data!.packageId;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_order", {
    _company_id: companyId,
    _package_id: packageId,
  });

  if (error) {
    console.error("Create order error:", error);
    redirectLocalized(`/company/dashboard/orders/new?company=${formData.get("companyId")}&error=create_failed`);
  }

  redirectLocalized(`/company/dashboard/orders?company=${formData.get("companyId")}&created=1`);
}

export async function submitPaymentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return redirectLocalized("/login?audience=employer");
  if (user.status !== "active") {
    redirectLocalized(`/login?audience=employer&error=account`);
  }

  const parsed = submitPaymentSchema.safeParse({
    orderId: formData.get("orderId"),
    senderName: formData.get("senderName"),
    transferReference: formData.get("transferReference"),
    amountMinor: Number(formData.get("amountMinor")),
    currency: formData.get("currency"),
    transferredAt: formData.get("transferredAt"),
    receiptStoragePath: formData.get("receiptStoragePath") || null,
  });

  if (!parsed.success) {
    redirectLocalized(`/company/dashboard/orders?company=${formData.get("companyId")}&error=invalid_data`);
  }

  const orderId = parsed.data!.orderId;
  const senderName = parsed.data!.senderName;
  const transferReference = parsed.data!.transferReference;
  const amountMinor = parsed.data!.amountMinor;
  const currency = parsed.data!.currency;
  const transferredAt = parsed.data!.transferredAt;
  const receiptStoragePath = parsed.data!.receiptStoragePath ?? null;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_payment", {
    _order_id: orderId,
    _sender_name: senderName,
    _transfer_reference: transferReference,
    _amount_minor: amountMinor,
    _currency: currency,
    _transferred_at: transferredAt,
    _receipt_storage_path: receiptStoragePath,
  });

  if (error) {
    console.error("Submit payment error:", error);
    redirectLocalized(`/company/dashboard/orders?company=${formData.get("companyId")}&error=submit_failed`);
  }

  redirectLocalized(`/company/dashboard/orders?company=${formData.get("companyId")}&submitted=1`);
}

export async function uploadPaymentReceiptAction(file: File, orderId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Oturum gerekli." };

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(file.type)) {
    return { error: "Dosya türü desteklenmiyor. JPEG, PNG, WebP veya PDF yükleyin." };
  }
  if (file.size > maxSize) {
    return { error: "Dosya boyutu 5 MB'ı geçemez." };
  }

  const supabase = await createSupabaseServerClient();
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
  const fileName = `${orderId}/${crypto.randomUUID()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("private-payment-receipts")
    .upload(fileName, file, { upsert: false });

  if (error) {
    console.error("Upload receipt error:", error);
    return { error: "Dosya yüklenemedi. Lütfen tekrar deneyin." };
  }

  return { path: data.path };
}

export async function deletePaymentReceiptAction(path: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Oturum gerekli." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from("private-payment-receipts").remove([path]);

  if (error) {
    console.error("Delete receipt error:", error);
    return { error: "Dosya silinemedi." };
  }

  return { success: true };
}