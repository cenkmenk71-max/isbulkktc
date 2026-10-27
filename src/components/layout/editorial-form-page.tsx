import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AccountSceneMedia } from "@/components/layout/account-scene-media";

type EditorialFormPageProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  backHref: "/" | "/login" | "/profile/dashboard";
  backLabel: string;
  storyEyebrow: string;
  storyTitle: string;
  storyBody: string;
  sceneMediaLabel?: string;
  sceneVideoUnavailable?: string;
  variant?: "account" | "company";
};

export function EditorialFormPage({
  children,
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  storyEyebrow,
  storyTitle,
  storyBody,
  sceneMediaLabel,
  sceneVideoUnavailable,
  variant = "account",
}: EditorialFormPageProps) {
  return (
    <div className={`editorial-page editorial-page--${variant} page-container`}>
      <div className="editorial-page-layout">
        <section className="editorial-page-content" aria-labelledby="editorial-page-title">
          <Link className="editorial-back-link" href={backHref}>
            <ArrowLeft size={16} aria-hidden="true" />
            {backLabel}
          </Link>
          <div className="editorial-page-heading">
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {eyebrow}
            </p>
            <h1 id="editorial-page-title">{title}</h1>
            <p>{description}</p>
          </div>
          {children}
        </section>

        <aside className="editorial-page-scene" aria-label={storyTitle}>
          <div className="editorial-page-scene-topline">
            <span>İşBul KKTC</span>
            <span>NORTHERN CYPRUS</span>
          </div>
          <div className="editorial-page-scene-copy">
            <span>{storyEyebrow}</span>
            <h2>{storyTitle}</h2>
            <p>{storyBody}</p>
          </div>
          {sceneMediaLabel && sceneVideoUnavailable ? (
            <AccountSceneMedia
              label={sceneMediaLabel}
              videoUnavailable={sceneVideoUnavailable}
            />
          ) : null}
          <span className="editorial-page-scene-index" aria-hidden="true">
            NORTH CYPRUS&nbsp; / &nbsp;ISB
          </span>
        </aside>
      </div>
    </div>
  );
}
