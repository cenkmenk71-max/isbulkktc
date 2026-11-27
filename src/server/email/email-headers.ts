/**
 * Deliverability headers for outbound mail.
 *
 * Two headers that bulk-mail receivers require and that a plain `from/to/
 * subject/html/text` send omits (#196):
 *
 *  - `List-Unsubscribe` + `List-Unsubscribe-Post`: Gmail and Yahoo require
 *    one-click unsubscribe on promotional mail. Without them a digest is
 *    throttled or filed as spam, and the recipient's "unsubscribe" affordance
 *    only appears as a link the client has to parse out of the body.
 *  - `Reply-To`: the default `from` is `info@…`, so without a `Reply-To` a
 *    reply disappears. Pointing it at a monitored inbox is what makes replies
 *    reachable.
 *
 * Pure (no `server-only`, no env, no I/O) so the rules are unit-testable and
 * the caller decides where the addresses come from.
 */

export type EmailHeaders = {
  headers?: Record<string, string>;
  replyTo?: string;
};

/** Loose shape check for a mailbox we are willing to put in a header. */
function isEmailLike(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * The RFC 8058 one-click pair for a promotional message.
 *
 * `List-Unsubscribe` carries the HTTPS one-click URI — the part a client POSTs
 * to — and, when a monitored unsubscribe mailbox is known, a `mailto:` fallback
 * for clients that only speak that. `List-Unsubscribe-Post:
 * List-Unsubscribe=One-Click` is what permits the POST without further
 * confirmation. A non-absolute or non-`https:` URL yields no header rather than
 * a broken one; the caller already validated it before rendering the body link.
 */
export function listUnsubscribeHeaders(
  unsubscribeUrl: string,
  mailtoInbox?: string | null,
): Record<string, string> {
  let parsed: URL;
  try {
    parsed = new URL(unsubscribeUrl);
  } catch {
    return {};
  }
  if (parsed.protocol !== "https:") return {};

  const mailto = isEmailLike(mailtoInbox)
    ? `, <mailto:${mailtoInbox.trim()}?subject=unsubscribe>`
    : "";
  return {
    "List-Unsubscribe": `<${parsed.toString()}>${mailto}`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Builds the extra send options for one message. `replyToInbox` is the
 * monitored mailbox a reply should reach; `unsubscribeUrl` is set only for the
 * promotional family. Returns `{}` when neither applies, so the caller can
 * spread it unconditionally.
 */
export function buildEmailHeaders(input: {
  replyToInbox?: string | null;
  unsubscribeUrl?: string | null;
}): EmailHeaders {
  const result: EmailHeaders = {};

  if (isEmailLike(input.replyToInbox)) {
    result.replyTo = input.replyToInbox.trim();
  }

  if (input.unsubscribeUrl) {
    const oneClick = listUnsubscribeHeaders(
      input.unsubscribeUrl,
      input.replyToInbox,
    );
    if (Object.keys(oneClick).length > 0) {
      result.headers = oneClick;
    }
  }

  return result;
}
