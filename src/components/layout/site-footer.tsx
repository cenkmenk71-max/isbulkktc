import { getTranslations } from 'next-intl/server'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Link } from '@/i18n/navigation'

export async function SiteFooter() {
  const t = await getTranslations('Footer')

  return (
    <footer className="site-footer" aria-label={t('siteFooterLabel')}>
      <div className="page-container footer-main">
        <div className="footer-brand">
          <Link href="/#top" aria-label={t('homeLinkLabel')}><Logo tone="dark" /></Link>
          <p>{t('tagline')}</p>
          <span className="footer-location"><MapPin size={12} aria-hidden="true" />{t('location')}</span>
        </div>
        <nav className="footer-links" aria-label={t('footerNavigation')}>
          <div>
            <span className="footer-label">{t('candidates')}</span>
            <Link href="/jobs">{t('links.jobs')}</Link>
            <Link href="/register">{t('links.register')} <ArrowUpRight size={12} aria-hidden="true" /></Link>
            <Link href="/freelance">{t('links.freelance')}</Link>
          </div>
          <div>
            <span className="footer-label">{t('employers')}</span>
            <Link href="/companies">{t('links.directory')}</Link>
            <Link href={{ pathname: "/register", query: { audience: "employer" } }}>{t('links.createCompany')} <ArrowUpRight size={12} aria-hidden="true" /></Link>
          </div>
          <div>
            <span className="footer-label">{t('account')}</span>
            <Link href="/login">{t('links.login')}</Link>
            <Link href="/profile/dashboard">{t('links.profile')}</Link>
          </div>
          <div>
            <span className="footer-label">{t('information')}</span>
            <Link href="/about">{t('links.about')}</Link>
            <Link href="/blog">{t('links.blog')}</Link>
            <Link href="/contact">{t('links.contact')}</Link>
          </div>
        </nav>
      </div>
      <div className="page-container footer-bottom">
        <span>{t('rights', { year: new Date().getFullYear() })}</span>
        <nav className="footer-legal" aria-label={t('legalNavigation')}>
          <Link href="/privacy">{t('links.privacy')}</Link>
          <Link href="/cookies">{t('links.cookies')}</Link>
          <Link href="/terms">{t('links.terms')}</Link>
        </nav>
        <span>{t('madeIn')}</span>
      </div>
    </footer>
  )
}
