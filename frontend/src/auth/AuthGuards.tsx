import { Navigate, Outlet } from 'react-router-dom'

import { t, useLanguage } from '../i18n'
import { useAuth } from './useAuth'

function SessionLoading() {
  useLanguage()

  return (
    <main className="auth-loading" role="status" aria-live="polite">
      {t('Restoring session…')}
    </main>
  )
}

export function RequireAuth() {
  const { status } = useAuth()

  if (status === 'initializing') return <SessionLoading />
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  return <Outlet />
}

export function PublicOnly() {
  const { status } = useAuth()

  if (status === 'initializing') return <SessionLoading />
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />
  return <Outlet />
}