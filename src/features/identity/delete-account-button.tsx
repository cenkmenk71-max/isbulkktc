"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount } from "./actions";
import { Trash2 } from "lucide-react";

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

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount();
      if (result.status === "success") {
        router.push("/");
        router.refresh();
      } else if (result.message === "rateLimited") {
        setError("Çok fazla deneme. Lütfen daha sonra tekrar deneyin.");
      } else {
        setError("Hesap silinemedi. Lütfen tekrar deneyin.");
      }
    });
  }

  if (!showConfirm) {
    return (
      <button
        className="button button-danger"
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
      >
        <Trash2 size={16} aria-hidden="true" />
        {buttonLabel}
      </button>
    );
  }

  return (
    <div className="delete-account-confirm" role="alertdialog" aria-live="assertive">
      <p className="delete-account-warning">{warningText}</p>
      <div className="delete-account-actions">
        <button
          className="button button-danger"
          type="button"
          onClick={handleDelete}
          disabled={isPending}
        >
          {isPending ? "Siliniyor..." : confirmLabel}
        </button>
        <button
          className="button button-outline"
          type="button"
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
        >
          İptal
        </button>
      </div>
      {error && <p className="delete-account-error">{error}</p>}
    </div>
  );
}
