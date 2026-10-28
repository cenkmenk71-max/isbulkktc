'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowRight, BookOpenText, BriefcaseBusiness, Building2, ChevronDown, Compass, Globe, Mail, Menu, Package, UserRound, X } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Link, usePathname } from '@/i18n/navigation'
import { localeNames, routing } from '@/i18n/routing'

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const locale = useLocale()
  const pathname = usePathname()
  const navCopy = useTranslations('Nav')
  const languageCopy = useTranslations('LanguageMenu')

  function closeMenu() { setOpen(false) }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function isCurrentNavigationItem(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const navigation = [
    { href: '/jobs' as const, label: navCopy('jobs'), icon: BriefcaseBusiness },
    { href: '/freelance' as const, label: navCopy('freelance'), icon: BriefcaseBusiness },
    { href: '/companies' as const, label: navCopy('employer'), icon: Building2 },
    { href: '/packages' as const, label: navCopy('packages'), icon: Package },
    { href: '/about' as const, label: navCopy('about'), icon: Compass },
    { href: '/blog' as const, label: navCopy('blog'), icon: BookOpenText },
    { href: '/contact' as const, label: navCopy('contact'), icon: Mail },
  ]

  return (
    <>
      <a className="skip-link" href="#main">{navCopy('skipToContent')}</a>
      <header className="site-header">
        <div className="page-container header-inner">
          <Link href="/#top" aria-label={navCopy('homeLabel')} className="header-brand" onClick={closeMenu}>
            <Logo tone="dark" />
          </Link>
          <nav className="desktop-nav" aria-label={navCopy('primaryNavigation')}>
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = isCurrentNavigationItem(href)
              return <Link
                href={href}
                key={label}
                onClick={closeMenu}
                className={active ? 'is-active' : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={16} aria-hidden="true" />{label}
              </Link>
            })}
          </nav>
          <div className="header-actions">
            <details className="language-picker">
              {/* The locale code is the visible label, so the accessible name
                  must contain it; a bare "Interface language" fails WCAG 2.5.3. */}
              <summary className="language-switch" aria-label={`${languageCopy('title')}: ${locale.toUpperCase()}`}>
                <Globe size={15} aria-hidden="true" /><span>{locale.toUpperCase()}</span><ChevronDown size={12} aria-hidden="true" />
              </summary>
              <div className="language-menu" aria-label={languageCopy('title')}>
                <div className="language-menu-heading"><strong>{languageCopy('title')}</strong></div>
                {routing.locales.map((code) => (
                  <Link key={code} href={pathname} locale={code} lang={code} className={`language-option ${locale === code ? 'is-current' : ''}`} aria-current={locale === code ? 'page' : undefined}><span className="language-code">{code.toUpperCase()}</span><span className="language-name">{localeNames[code]}</span>{locale === code && <span className="language-current-mark" aria-label={navCopy('currentLanguage')}>✓</span>}</Link>
                ))}
                <p className="language-menu-note">{languageCopy('notice')}</p>
              </div>
            </details>
            <Link href="/login" className="header-login">{navCopy('login')}</Link>
            <Link href="/register" className="button button-dark header-post">
              <UserRound size={16} aria-hidden="true"/><span>{navCopy('register')}</span>
            </Link>
            <button
              ref={menuButtonRef}
              className="mobile-menu-button"
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-label={open ? navCopy('closeMenu') : navCopy('openMenu')}
              aria-expanded={open}
              aria-controls="mobile-primary-navigation"
            >
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>
        <nav
          id="mobile-primary-navigation"
          className="mobile-nav page-container"
          aria-label={navCopy('primaryNavigation')}
          hidden={!open}
        >
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = isCurrentNavigationItem(href)
              return <Link
                href={href}
                key={label}
                onClick={closeMenu}
                className={active ? 'is-active' : undefined}
                aria-current={active ? 'page' : undefined}
              ><span><Icon size={17} aria-hidden="true"/>{label}</span><ArrowRight size={15} aria-hidden="true"/></Link>
            })}
            <Link href="/login" onClick={closeMenu}>{navCopy('login')}<ArrowRight size={15} aria-hidden="true"/></Link>
            <Link href="/register" className="mobile-nav-primary" onClick={closeMenu}>{navCopy('register')}<ArrowRight size={15} aria-hidden="true"/></Link>
        </nav>
      </header>
    </>
  )
}
