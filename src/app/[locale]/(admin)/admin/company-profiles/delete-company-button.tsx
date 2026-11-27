"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function DeleteCompanyButton({
  companyName,
}: {
  companyName: string;
}) {
  const t = useTranslations("CompanyReview");

  return (
    <button
      type="submit"
      className="button button-outline button-delete"
      aria-label={t("deleteCompany", { name: companyName })}
      onClick={(event) => {
        if (!window.confirm(t("confirmDelete", { name: companyName }))) {
          event.preventDefault();
        }
      }}
    >
      <Trash2 size={16} aria-hidden="true" />
      {t("delete")}
    </button>
  );
}
