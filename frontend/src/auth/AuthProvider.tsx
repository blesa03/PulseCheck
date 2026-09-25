import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  loginRequest,
  logoutRequest,
  refreshSession,
  registerRequest,
  subscribeToAuthSession,
} from '../api/client'

import { AuthContext } from './AuthContext'

import type {
  AuthStatus,
  AuthUser,
  LoginCredentials,
  RegisterCredentials,
} from './types'

import type {
  ReactNode,
} from 'react'


interface AuthProviderProps {
  children: ReactNode
}


export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [user, setUser] =
    useState<AuthUser | null>(null)

  const [status, setStatus] =
    useState<AuthStatus>('initializing')

  useEffect(() => {
    const unsubscribe =
      subscribeToAuthSession(
        (session) => {
          setUser(
            session?.user ?? null,
          )

          setStatus(
            session
              ? 'authenticated'
              : 'unauthenticated',
          )
        },
      )

    void refreshSession()

    return unsubscribe
  }, [])

  const login = useCallback(
    async (
      credentials: LoginCredentials,
    ) => {
      await loginRequest(credentials)
    },
    [],
  )

  const register = useCallback(
    async (
      credentials: RegisterCredentials,
    ) => {
      await registerRequest(credentials)
    },
    [],
  )

  const logout = useCallback(
    async () => {
      await logoutRequest()
    },
    [],
  )

  const value = useMemo(
    () => ({
      user,
      status,
      login,
      register,
      logout,
    }),
    [
      user,
      status,
      login,
      register,
      logout,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}