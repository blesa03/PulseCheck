import {
  Navigate,
  Outlet,
} from 'react-router-dom'

import { useAuth } from './useAuth'


export function RequireAuth() {
  const {
    status,
  } = useAuth()

  if (status === 'initializing') {
    return (
      <main className="auth-loading">
        Restoring session…
      </main>
    )
  }

  if (status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
      />
    )
  }

  return <Outlet />
}


export function PublicOnly() {
  const {
    status,
  } = useAuth()

  if (status === 'initializing') {
    return (
      <main className="auth-loading">
        Restoring session…
      </main>
    )
  }

  if (status === 'authenticated') {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    )
  }

  return <Outlet />
}