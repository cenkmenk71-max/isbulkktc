import { z } from "zod";

export const startConversationSchema = z
  .object({
    participantIds: z.array(z.string().uuid()).length(2).refine(
      (ids) => ids[0] !== ids[1],
    ),
    subject: z.string().trim().max(200).nullable().default(null),
  })
  .strict();

export const sendMessageSchema = z
  .object({
    conversationId: z.string().uuid(),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict();

export const conversationIdSchema = z.string().uuid();

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
