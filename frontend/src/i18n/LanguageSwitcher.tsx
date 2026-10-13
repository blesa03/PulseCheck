import { useLanguage, setLanguage, t } from './index'
import './LanguageSwitcher.css'

export function LanguageSwitcher() {
  const language = useLanguage()

  return (
    <label className="language-switcher">
      <span>{t('Language')}</span>
      <select
        aria-label={t('Language')}
        value={language}
        onChange={(event) => {
          setLanguage(event.target.value === 'es' ? 'es' : 'en')
        }}
      >
        <option value="en">{t('English')}</option>
        <option value="es">{t('Spanish')}</option>
      </select>
    </label>
  )
}