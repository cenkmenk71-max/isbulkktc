"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteAccount } from "./actions";
import { Trash2, X } from "lucide-react";

type DeleteAccountButtonProps = {
  confirmLabel: string;
  buttonLabel: string;
  warningText: string;
};

export function DeleteAccountButton({
  confirmLabel,
  buttonLabel,
  warningText,
}: DeleteAccountButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const copy = useTranslations("CandidateDashboard.deleteAccount");
  const warningId = useId();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showConfirm) return;

    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [showConfirm]);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteAccount();
        if (result.status === "success") {
          router.push("/");
          router.refresh();
        } else if (result.message === "rateLimited") {
          setError(copy("rateLimited"));
        } else {
          setError(copy("failed"));
        }
      } catch {
        setError(copy("failed"));
      }
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isPending) setShowConfirm(false);
      return;
    }

    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (activeElement === last || !dialog.contains(activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="button button-danger"
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
        aria-haspopup="dialog"
        aria-expanded={showConfirm}
      >
        <Trash2 size={16} aria-hidden="true" />
        {buttonLabel}
      </button>

      {showConfirm ? (
        <div
          className="delete-account-dialog-backdrop"
          onMouseDown={(event) => {
            if (!isPending && event.target === event.currentTarget) {
              setShowConfirm(false);
            }
          }}
        >
          <div
            ref={dialogRef}
            className="delete-account-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={warningId}
            aria-busy={isPending}
            onKeyDown={handleKeyDown}
            tabIndex={-1}
          >
            <h2 id={titleId}>{buttonLabel}</h2>
            <p className="delete-account-warning" id={warningId}>
              {warningText}
            </p>
            <div className="delete-account-actions">
              <button
                className="button button-danger"
                type="button"
                onClick={handleDelete}
                disabled={isPending}
              >
                {isPending ? copy("pending") : confirmLabel}
              </button>
              <button
                ref={cancelRef}
                className="button button-outline"
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
              >
                <X size={16} aria-hidden="true" />
                {copy("cancel")}
              </button>
            </div>
            {error ? (
              <p className="delete-account-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}