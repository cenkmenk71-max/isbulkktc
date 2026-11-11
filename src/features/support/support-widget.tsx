"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, Send, X } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Visitor-facing live-support chat.
 *
 * A turn is answered by `/api/support/chat`, which resolves it deterministically
 * from the platform's published facts, so the common question is answered
 * instantly and cannot hallucinate. The opening visitor message is also
 * persisted through the frozen anon-write RPC `submit_support_message`
 * (`supabase/migrations/20261111120000_v4_live_support.sql`), which is the single
 * write surface and carries its own per-address throttle, so the team sees the
 * thread in the console and can follow up.
 *
 * Message bodies are always rendered as React text nodes; nothing here ever
 * touches `dangerouslySetInnerHTML`.
 */

type ChatRole = "visitor" | "support";

interface ChatMessage {
  id: string;
  role: ChatRole;
  body: string;
}

const MAX_BODY_LENGTH = 1000;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SupportWidget({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
} = {}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const panelId = useId();

  const [open, setOpen] = useState(defaultOpen);
  const [email, setEmail] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLUListElement | null>(null);
  const persistedRef = useRef(false);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  const persistOpeningMessage = useCallback(
    (body: string) => {
      if (persistedRef.current) return;
      persistedRef.current = true;
      try {
        const supabase = createSupabaseBrowserClient();
        void supabase
          .rpc("submit_support_message", {
            _name: null,
            _email: email.trim() || null,
            _subject: null,
            _body: body,
            _locale: locale,
          })
          .then(
            () => undefined,
            () => undefined,
          );
      } catch {
        // Persistence is best-effort; the chat reply must still be delivered.
      }
    },
    [email, locale],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = input.trim();
      if (sending || trimmed.length === 0) return;

      setSending(true);
      setError(null);
      setInput("");
      setMessages((current) => [
        ...current,
        { id: newId(), role: "visitor", body: trimmed },
      ]);
      persistOpeningMessage(trimmed);

      try {
        const response = await fetch("/api/support/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, locale }),
        });
        if (!response.ok) throw new Error("chat_failed");
        const data = (await response.json()) as { reply?: unknown };
        if (typeof data.reply !== "string" || data.reply.length === 0) {
          throw new Error("chat_empty");
        }
        setMessages((current) => [
          ...current,
          { id: newId(), role: "support", body: data.reply as string },
        ]);
      } catch {
        setError(t("sendFailed"));
      } finally {
        setSending(false);
      }
    },
    [input, locale, persistOpeningMessage, sending, t],
  );

  const greeting: ChatMessage = {
    id: "greeting",
    role: "support",
    body: t("greeting"),
  };
  const visibleMessages = [greeting, ...messages];

  return (
    <div className="support-widget" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="support-widget__launcher"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X aria-hidden="true" size={20} />
        ) : (
          <MessageCircle aria-hidden="true" size={20} />
        )}
        <span>{open ? t("close") : t("launcherLabel")}</span>
      </button>

      {open ? (
        <section
          id={panelId}
          className="support-widget__panel"
          role="dialog"
          aria-label={t("panelTitle")}
        >
          <header className="support-widget__header">
            <h2 className="support-widget__title">{t("panelTitle")}</h2>
            <p className="support-widget__subtitle">{t("panelSubtitle")}</p>
          </header>

          <ul
            ref={listRef}
            className="support-widget__messages"
            aria-live="polite"
          >
            {visibleMessages.map((message) => (
              <li
                key={message.id}
                className={`support-widget__message support-widget__message--${message.role}`}
              >
                <span className="support-widget__message-role">
                  {message.role === "visitor" ? t("youLabel") : t("botLabel")}
                </span>
                <span className="support-widget__message-body">
                  {message.body}
                </span>
              </li>
            ))}
          </ul>

          <form className="support-widget__form" onSubmit={handleSubmit}>
            <label className="support-widget__field">
              <span>{t("emailLabel")}</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <p className="support-widget__hint">{t("emailHint")}</p>

            <label className="support-widget__field">
              <span>{t("composerLabel")}</span>
              <textarea
                name="message"
                rows={2}
                maxLength={MAX_BODY_LENGTH}
                placeholder={t("composerPlaceholder")}
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>

            {error ? (
              <p className="support-widget__error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="support-widget__submit"
              disabled={sending || input.trim().length === 0}
            >
              <Send aria-hidden="true" size={16} />
              <span>{sending ? t("sending") : t("send")}</span>
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

export default SupportWidget;
