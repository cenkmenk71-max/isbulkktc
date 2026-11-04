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
