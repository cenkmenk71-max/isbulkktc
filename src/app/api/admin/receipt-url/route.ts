import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { requirePlatformRole } from "@/server/dal/user";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requirePlatformRole("billing_admin");
    const supabase = await createSupabaseServerClient();

    const body = await request.json();
    const { storagePath } = body as { storagePath: string };

    if (!storagePath || typeof storagePath !== "string") {
      return NextResponse.json(
        { error: "storagePath is required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.storage
      .from("private-payment-receipts")
      .createSignedUrl(storagePath, 60 * 15);

    if (error) {
      return NextResponse.json(
        { error: "Receipt signed URL could not be created" },
        { status: 500 },
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    if (error instanceof Error && error.message.includes("billing administrator required")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Receipt signed URL error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}