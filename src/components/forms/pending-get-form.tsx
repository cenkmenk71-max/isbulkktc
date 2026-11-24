"use client";

import { useEffect, useRef } from "react";
import type { FormEvent, ReactNode } from "react";

export function PendingGetForm({
  ariaLabel,
  children,
  className,
}: {
  ariaLabel?: string;
  children: ReactNode;
  className: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    function restoreSubmitButtons() {
      const form = formRef.current;
      if (!form) return;
      form.removeAttribute("aria-busy");
      for (const button of form.querySelectorAll<
        HTMLButtonElement | HTMLInputElement
      >('button[type="submit"], input[type="submit"]')) {
        button.disabled = false;
      }
    }

    window.addEventListener("pageshow", restoreSubmitButtons);
    return () => window.removeEventListener("pageshow", restoreSubmitButtons);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    form.setAttribute("aria-busy", "true");
    for (const button of form.querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >('button[type="submit"], input[type="submit"]')) {
      button.disabled = true;
    }
  }

  return (
    <form
      ref={formRef}
      aria-label={ariaLabel}
      className={className}
      method="get"
      onSubmit={handleSubmit}
    >
      {children}
    </form>
  );
}
