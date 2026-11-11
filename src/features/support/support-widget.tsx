"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, Send, X } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Visitor-facing live-support chat.
 *
 * The launcher opens straight into the conversation — there is no gate form.
 * Each turn is answered by `/api/support/chat`, which resolves definite platform
 * facts deterministically from the published FAQ copy, so the reply is instant
 * and cannot hallucinate; an unplaceable question still gets grounded copy, never
 * a shrug. The visitor's message is also persisted best-effort through the frozen
 * anon-write RPC `submit_support_message`
 * (`supabase/migrations/20261111120000_v4_live_support.sql`), which is the
 * single write surface and carries its own per-address throttle, so the team
 * sees the thread in the console and can follow up.
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
const SUGGESTION_KEYS = ["suggestion1", "suggestion2", "suggestion3"] as const;

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
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHuman, setShowHuman] = useState(false);
  const [email, setEmail] = useState("");

  const listRef = useRef<HTMLUListElement | null>(null);
  // `submit_support_message` opens a *new* thread on every call, so only the
  // opening message is persisted: one conversation maps to one thread.
  const persistedRef = useRef(false);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open, sending]);

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

  const sendMessage = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
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
    [locale, persistOpeningMessage, sending, t],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void sendMessage(input);
    },
    [input, sendMessage],
  );

  const greeting: ChatMessage = {
    id: "greeting",
    role: "support",
    body: t("greeting"),
  };
  const visibleMessages = [greeting, ...messages];
  const showSuggestions = messages.length === 0 && !sending;

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
          <div className="support-widget__header">
            <div className="support-widget__identity">
              <span className="support-widget__avatar" aria-hidden="true">
                <MessageCircle size={18} />
              </span>
              <span className="support-widget__heading">
                <span className="support-widget__title">{t("panelTitle")}</span>
                <span className="support-widget__subtitle">
                  {t("panelSubtitle")}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="support-widget__icon-button"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

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
                <span className="support-widget__bubble">{message.body}</span>
              </li>
            ))}
            {sending ? (
              <li
                className="support-widget__message support-widget__message--support"
                aria-label={t("thinking")}
              >
                <span className="support-widget__bubble support-widget__bubble--typing">
                  <span className="support-widget__dot" />
                  <span className="support-widget__dot" />
                  <span className="support-widget__dot" />
                </span>
              </li>
            ) : null}
          </ul>

          {showSuggestions ? (
            <div
              className="support-widget__suggestions"
              aria-label={t("suggestionsLabel")}
            >
              {SUGGESTION_KEYS.map((key) => {
                const label = t(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className="support-widget__chip"
                    onClick={() => void sendMessage(label)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {showHuman ? (
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
              <span className="support-widget__hint">{t("emailHint")}</span>
            </label>
          ) : null}

          {error ? (
            <p className="support-widget__error" role="alert">
              {error}
            </p>
          ) : null}

          <form className="support-widget__form" onSubmit={handleSubmit}>
            <label className="support-widget__composer">
              <span className="support-widget__sr-only">
                {t("composerLabel")}
              </span>
              <textarea
                name="message"
                rows={1}
                maxLength={MAX_BODY_LENGTH}
                placeholder={t("composerPlaceholder")}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
              />
              <button
                type="submit"
                className="support-widget__submit"
                aria-label={t("send")}
                disabled={sending || input.trim().length === 0}
              >
                <Send aria-hidden="true" size={16} />
              </button>
            </label>
          </form>

          <div className="support-widget__footer">
            <button
              type="button"
              className="support-widget__human"
              onClick={() => setShowHuman((value) => !value)}
            >
              {t("humanCta")}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default SupportWidget;
