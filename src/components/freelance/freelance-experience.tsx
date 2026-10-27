import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import freelanceWorkspaceImage from "../../../assets-src/freelance-photos/unsplash-1498050108023-c5249f4df085.jpg";

export async function FreelanceExperience({ locale }: { locale: AppLocale }) {
  const copy = await getTranslations({ locale, namespace: "Freelance" });

  return (
    <div className="freelance-page">
      <section className="freelance-hero">
        <div className="freelance-hero-glow" aria-hidden="true" />
        <div className="page-container freelance-hero-inner">
          <div className="freelance-hero-copy">
            <div className="eyebrow eyebrow-light">
              <span className="eyebrow-rule" />
              {copy("eyebrow")}
            </div>
            <h1>{copy("title")}</h1>
            <p>{copy("description")}</p>
            <div className="freelance-hero-actions">
              <Link className="button button-light" href="/register">
                {copy("createProfile")}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="freelance-back-link" href="/login">
                {copy("signIn")}
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="freelance-hero-media" aria-hidden="true">
            <Image
              src={freelanceWorkspaceImage}
              alt=""
              fill
              preload
              sizes="100vw"
              className="freelance-hero-image"
            />
          </div>
        </div>
      </section>

      <section className="freelance-profile-section section-pad">
        <div className="page-container">
          <div className="section-heading-copy">
            <div className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("benefitsEyebrow")}
            </div>
            <h2>{copy("benefitsTitle")}</h2>
            <p>{copy("benefitsDescription")}</p>
          </div>
          <div className="freelance-profile-points">
            {(["headline", "location", "skills"] as const).map((item) => (
              <article key={item}>
                <Check size={17} aria-hidden="true" />
                <div>
                  <h3>{copy(`points.${item}.title`)}</h3>
                  <p>{copy(`points.${item}.body`)}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="freelance-bottom-cta">
            <div>
              <span className="eyebrow">
                <span className="eyebrow-rule" />
                {copy("ctaEyebrow")}
              </span>
              <h2>{copy("ctaTitle")}</h2>
            </div>
            <Link href="/register" className="button button-dark">
              {copy("createProfile")}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
