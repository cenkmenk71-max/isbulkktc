"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

type AdminConsoleTab = {
  href: string;
  labelKey: string;
};

const TABS: AdminConsoleTab[] = [
  { href: "/admin/company-profiles", labelKey: "companyManagement" },
  { href: "/admin/talent-pool", labelKey: "talentPool" },
  { href: "/admin/jobs", labelKey: "jobModeration" },
  { href: "/admin/packages", labelKey: "packagesPayments" },
  { href: "/admin/outreach", labelKey: "outreachEmails" },
];

export function AdminConsoleNav() {
  const t = useTranslations("AdminConsole");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("ariaLabel")}
      className="admin-console-nav"
    >
      <div className="admin-console-nav-inner">
        <ul className="admin-console-nav-list">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <li key={tab.href} className="admin-console-nav-item">
                <Link
                  href={tab.href}
                  className={`admin-console-nav-link${isActive ? " admin-console-nav-link--active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t(tab.labelKey as Parameters<typeof t>[0])}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/"
          className="admin-console-nav-return button button-outline"
        >
          ← {t("returnToSite")}
        </Link>
      </div>
    </nav>
  );
}
