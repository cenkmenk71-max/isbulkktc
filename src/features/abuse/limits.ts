import { createRateLimiter } from "./rate-limit";

/**
 * Budgets for the two anonymous, mail-sending actions.
 *
 * Ten minutes is short enough to bound a mail flood and long enough that a
 * visitor whose first submission failed is not locked out; five attempts
 * comfortably covers a human and stops a loop. The limit is applied per client
 * address and per submitted address, so neither a single origin nor a single
 * victim mailbox can be driven without limit.
 */
const windowMs = 10 * 60 * 1000;
const limit = 5;

export const feedbackRateLimiter = createRateLimiter({ limit, windowMs });
export const salesLeadRateLimiter = createRateLimiter({ limit, windowMs });

/**
 * Budget for the live-support chat turn.
 *
 * A conversation is many short turns rather than one submission, so the mail
 * budget would cut a genuine visitor off mid-thread; the window stays the same
 * and the ceiling is raised to a level that still bounds a scripted caller
 * driving the optional AI fallback. Keyed on the client address alone — a chat
 * turn carries no address to throttle against.
 */
export const supportChatRateLimiter = createRateLimiter({
  limit: 30,
  windowMs,
});
