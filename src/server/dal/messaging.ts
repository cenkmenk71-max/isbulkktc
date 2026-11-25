import "server-only";

import {
  conversationIdSchema,
  sendMessageSchema,
  startConversationSchema,
  type SendMessageInput,
  type StartConversationInput,
} from "@/features/messaging/schemas";
import { requireAuthenticatedUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export async function startConversation(
  input: StartConversationInput,
): Promise<string> {
  const parsed = startConversationSchema.parse(input);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active" || !parsed.participantIds.includes(user.id)) {
    throw new Error("The conversation participants are not authorized.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_conversation", {
    _participant_ids: parsed.participantIds,
    _subject: parsed.subject,
  });
  if (error || !data) {
    throw new Error("The conversation could not be started.", { cause: error });
  }
  return data;
}

export async function sendConversationMessage(
  input: SendMessageInput,
): Promise<string> {
  const parsed = sendMessageSchema.parse(input);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to send a message.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("send_message", {
    _conversation_id: parsed.conversationId,
    _body: parsed.body,
    _message_type: "text",
    _metadata: {},
  });
  if (error || !data) {
    throw new Error("The message could not be sent.", { cause: error });
  }
  return data;
}

export async function archiveConversation(conversationId: string): Promise<void> {
  const id = conversationIdSchema.parse(conversationId);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to archive a conversation.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_conversation", {
    _conversation_id: id,
  });
  if (error) {
    throw new Error("The conversation could not be archived.", { cause: error });
  }
}
