import { Link } from 'react-router-dom'

import { t, useLanguage } from '../i18n'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'

export function NotFoundPage() {
  useLanguage()

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="not-found-heading">
        <div className="brand">PulseCheck</div>
        <h1 id="not-found-heading">{t('Page not found')}</h1>
        <p className="auth-description">
          {t('The address you requested does not exist.')}
        </p>
        <p>
          <Link to="/dashboard">{t('Return to dashboard')}</Link>
        </p>
        <LanguageSwitcher />
      </section>
    </main>
  )
}