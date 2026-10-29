import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Compass,
  Globe2,
  Mail,
  MapPin,
  Newspaper,
  Phone,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getLatestNews } from "@/features/blog/news-feed";

function getArticleImage(title: string): string {
  const normalized = title.toLocaleLowerCase("tr");
  if (/üniversite|eğitim|öğrenci|okul|akademi/.test(normalized)) {
    return "/images/news-education.webp";
  }
  if (/otel|turizm|konaklama|restoran|gastronomi/.test(normalized)) {
    return "/images/news-hospitality.webp";
  }
  if (/inşaat|yapı|müteahhit|şantiye/.test(normalized)) {
    return "/images/news-construction.webp";
  }
  if (/sağlık|doktor|hastane|hemşire/.test(normalized)) {
    return "/images/news-healthcare.webp";
  }
  if (/l[ıi]man|iskele|gemi|deniz taşımacılığı/.test(normalized)) {
    return "/images/news-construction.webp";
  }
  if (
    /k[ıi]b-tek|el-sen|k-pet|aksa|petrol|akaryakıt|kalecik|santral|enerji|fabrika|tarım|çiftçi|üretim|hayvancılık/.test(
      normalized,
    )
  ) {
    return "/images/news-industry.webp";
  }
  if (/grev|sendika|işçi|iş güvenliği|iş sağlığı|işten çıkar|bakanlık/.test(normalized)) {
    return "/images/news-team.webp";
  }
  return "/images/news-team.webp";
}

export async function AboutPageContent({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "AboutPage" });
  const values = [
    {
      icon: MapPin,
      title: t("values.localTitle"),
      description: t("values.localBody"),
    },
    {
      icon: ShieldCheck,
      title: t("values.clearTitle"),
      description: t("values.clearBody"),
    },
    {
      icon: Sparkles,
      title: t("values.careTitle"),
      description: t("values.careBody"),
    },
  ];

  return (
    <div className="editorial-page about-page">
      <div className="page-container">
        <section className="editorial-hero about-hero" aria-labelledby="about-title">
          <Image
            src="/images/about-hero.webp"
            alt=""
            fill
            preload
            sizes="100vw"
            quality={85}
            className="editorial-hero-background-image editorial-hero-aside-image"
          />
          <div className="editorial-hero-orbit" aria-hidden="true" />
          <div className="editorial-hero-copy">
            <p className="editorial-eyebrow">
              <span aria-hidden="true" />
              {t("eyebrow")}
            </p>
            <h1 id="about-title">{t("title")}</h1>
            <p className="editorial-hero-description">{t("lead")}</p>
            <Link className="editorial-primary-link" href="/companies">
              {t("directoryLink")}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="about-hero-aside">
            <span className="about-hero-mark" aria-hidden="true">
              <Compass size={25} />
            </span>
            <span>{t("heroAsideLabel")}</span>
            <strong>{t("heroAsideTitle")}</strong>
            <p>{t("heroAsideBody")}</p>
          </div>
        </section>

        <section className="editorial-intro" aria-labelledby="about-belief-title">
          <div className="editorial-section-index">
            <span>01</span>
            <span>{t("beliefLabel")}</span>
          </div>
          <div className="editorial-intro-copy">
            <h2 id="about-belief-title">{t("beliefTitle")}</h2>
            <p>{t("beliefBody")}</p>
          </div>
        </section>

        <section className="about-values" aria-label={t("valuesLabel")}>
          {values.map(({ icon: Icon, title, description }, index) => (
            <article className="about-value-card" key={title}>
              <div className="about-value-top">
                <span className="about-value-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="about-value-number">
                  0{index + 1}
                </span>
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </section>

        <section className="about-reality" aria-labelledby="about-reality-title">
          <div className="about-reality-icon">
            <Globe2 size={20} aria-hidden="true" />
          </div>
          <div>
            <p className="editorial-kicker">{t("realityKicker")}</p>
            <h2 id="about-reality-title">{t("realityTitle")}</h2>
            <p>{t("realityBody")}</p>
            <Link href="/packages" className="editorial-text-link">
              {t("packagesLink")}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="editorial-bottom-cta">
          <div>
            <p className="editorial-kicker">{t("closingKicker")}</p>
            <h2>{t("closingTitle")}</h2>
          </div>
          <Link className="editorial-outline-link" href="/contact">
            {t("contactLink")}
            <ArrowDownRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}

export async function ContactPageContent({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "ContactPage" });
  const channels = [
    {
      icon: Mail,
      label: t("emailLabel"),
      value: "info@isbulkktc.com",
      href: `mailto:info@isbulkktc.com?subject=${encodeURIComponent(t("emailSubject"))}&body=${encodeURIComponent(t("emailBody"))}`,
    },
    {
      icon: Phone,
      label: t("phoneLabel"),
      value: "0539 131 64 21",
      href: "tel:+905391316421",
      actionLabel: t("whatsappAction"),
      actionHref: "https://wa.me/905391316421",
    },
    {
      icon: MapPin,
      label: t("locationLabel"),
      value: t("regionValue"),
    },
  ];

  return (
    <div className="editorial-page contact-page">
      <div className="page-container">
        <section className="editorial-hero contact-hero" aria-labelledby="contact-title">
          <Image
            src="/images/contact-hero.webp"
            alt=""
            fill
            preload
            sizes="100vw"
            quality={85}
            className="editorial-hero-background-image editorial-hero-aside-image"
          />
          <div className="editorial-hero-orbit" aria-hidden="true" />
          <div className="editorial-hero-copy">
            <p className="editorial-eyebrow">
              <span aria-hidden="true" />
              {t("eyebrow")}
            </p>
            <h1 id="contact-title">{t("title")}</h1>
            <p className="editorial-hero-description">{t("lead")}</p>
          </div>
          <div className="contact-hero-aside">
            <span className="contact-hero-mark" aria-hidden="true">
              <Mail size={24} />
            </span>
            <span>{t("promiseLabel")}</span>
            <strong>{t("promiseTitle")}</strong>
            <p>{t("promiseBody")}</p>
          </div>
        </section>

        <section className="contact-panel" aria-labelledby="contact-channels-title">
          <div className="contact-panel-heading">
            <div>
              <p className="editorial-kicker">{t("channelsKicker")}</p>
              <h2 id="contact-channels-title">{t("channelsTitle")}</h2>
            </div>
            <span className="contact-status contact-status-available">
              <span aria-hidden="true" />
              {t("contactStatus")}
            </span>
          </div>
          <p className="contact-panel-intro">{t("channelsBody")}</p>
          <div className="contact-channel-grid">
            {channels.map(({
              icon: Icon,
              label,
              value,
              href,
              actionLabel,
              actionHref,
            }) => (
              <article className="contact-channel-card" key={label}>
                <span className="contact-channel-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="contact-channel-label">{label}</span>
                {href ? (
                  <a className="contact-channel-value" href={href}>
                    {value}
                  </a>
                ) : (
                  <strong>{value}</strong>
                )}
                {actionLabel && actionHref ? (
                  <a
                    className="contact-channel-action"
                    href={actionHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {actionLabel}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
          <div className="contact-honesty-note">
            <Mail size={18} aria-hidden="true" />
            <p>{t("messageGuidance")}</p>
          </div>
        </section>

        <section className="contact-next-step">
          <div className="contact-next-icon">
            <UsersRound size={21} aria-hidden="true" />
          </div>
          <div>
            <p className="editorial-kicker">{t("nextKicker")}</p>
            <h2>{t("nextTitle")}</h2>
            <p>{t("nextBody")}</p>
          </div>
          <Link className="editorial-outline-link" href="/companies">
            {t("directoryLink")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}

export async function BlogPageContent({ locale }: { locale: AppLocale }) {
  const [t, feed] = await Promise.all([
    getTranslations({ locale, namespace: "BlogPage" }),
    getLatestNews(),
  ]);

  return (
    <div className="editorial-page blog-page">
      <div className="page-container">
        <section className="editorial-hero blog-hero" aria-labelledby="blog-title">
          <Image
            src="/images/blog-hero.webp"
            alt=""
            fill
            preload
            sizes="100vw"
            quality={85}
            className="editorial-hero-background-image editorial-hero-aside-image"
          />
          <div className="editorial-hero-orbit" aria-hidden="true" />
          <div className="editorial-hero-copy">
            <p className="editorial-eyebrow">
              <span aria-hidden="true" />
              {t("eyebrow")}
            </p>
            <h1 id="blog-title">{t("title")}</h1>
            <p className="editorial-hero-description">{t("lead")}</p>
          </div>
          <div className="blog-hero-aside">
            <span className="blog-hero-mark" aria-hidden="true">
              <Newspaper size={24} />
            </span>
            <span>{t("feedAsideLabel")}</span>
            <strong>{feed.articles.length.toString().padStart(2, "0")}</strong>
            <p>{t("feedAsideBody")}</p>
          </div>
        </section>

        <section className="blog-feed-section" aria-labelledby="blog-feed-title">
          <div className="blog-feed-heading">
            <div>
              <p className="editorial-kicker">{t("feedKicker")}</p>
              <h2 id="blog-feed-title">{t("feedTitle")}</h2>
            </div>
          </div>

          {feed.articles.length > 0 ? (
            <div className="blog-article-grid">
              {feed.articles.map((article) => {
                const publishedAt = new Date(article.publishedAt);
                const publishedDate = new Intl.DateTimeFormat(
                  {
                    tr: "tr-TR",
                    en: "en-GB",
                    ru: "ru-RU",
                    el: "el-GR",
                    fa: "fa-IR",
                    de: "de-DE",
                  }[locale],
                  { dateStyle: "medium", timeZone: "Europe/Nicosia" },
                ).format(publishedAt);

                return (
                  <article className="blog-article-card" key={article.id}>
                    <div className="blog-article-image" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={article.imageUrl ?? getArticleImage(article.title)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div className="blog-article-meta">
                      <time dateTime={article.publishedAt}>{publishedDate}</time>
                    </div>
                    <h3>
                      <a href={article.url} target="_blank" rel="noreferrer">
                        {article.title}
                      </a>
                    </h3>
                    <div className="blog-article-footer">
                      <a
                        className="blog-article-link"
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t("readSource", { source: article.source })}
                      >
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="blog-feed-empty">
              <span>
                <Newspaper size={21} aria-hidden="true" />
              </span>
              <h3>{t("emptyTitle")}</h3>
              <p>{t("emptyBody")}</p>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
