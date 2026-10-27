import { Building2, Check, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AccountAudience } from "@/features/identity/schemas";

type AccountAudiencePickerProps = {
  audience: AccountAudience;
  page: "/login" | "/register";
};

export async function AccountAudiencePicker({
  audience,
  page,
}: AccountAudiencePickerProps) {
  const copy = await getTranslations("AccountAudience");
  const options = [
    {
      value: "candidate" as const,
      icon: UserRound,
    },
    {
      value: "employer" as const,
      icon: Building2,
    },
  ];

  return (
    <nav
      aria-label={copy("chooseAudience")}
      className="account-audience-picker"
    >
      {options.map(({ value, icon: Icon }) => {
        const selected = audience === value;

        return (
          <Link
            aria-current={selected ? "page" : undefined}
            className="account-audience-option"
            data-selected={selected}
            href={`${page}?audience=${value}`}
            key={value}
          >
            <span className="account-audience-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <span className="account-audience-copy">
              <strong>{copy(`${value}.title`)}</strong>
              <small>{copy(`${value}.description`)}</small>
            </span>
            <span className="account-audience-selection" aria-hidden="true">
              {selected && <Check size={14} />}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
