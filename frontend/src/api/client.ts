import { getLanguage } from '../i18n'

import type {
  AuthSession,
  LoginCredentials,
  RegisterCredentials,
} from '../auth/types'

const API_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

let accessToken: string | null = null
let sessionListener: ((session: AuthSession | null) => void) | null = null
let refreshPromise: Promise<AuthSession | null> | null = null

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function publishSession(session: AuthSession | null) {
  accessToken = session?.access ?? null
  sessionListener?.(session)
}

export function subscribeToAuthSession(
  listener: (session: AuthSession | null) => void,
) {
  sessionListener = listener

  return () => {
    if (sessionListener === listener) sessionListener = null
  }
}

export async function readApiErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json()

    if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data)

      for (const [key, value] of entries) {
        if (key === 'detail' && typeof value === 'string') return value
      }

      for (const [, value] of entries) {
        if (typeof value === 'string') return value
        if (Array.isArray(value) && typeof value[0] === 'string') {
          return value[0]
        }
      }
    }
  } catch {
    // Fallback when a response has no JSON body.
  }

  return `Request failed with status ${response.status}.`
}

function requestHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers)
  result.set('Accept-Language', getLanguage())
  return result
}

async function authRequest(
  path: string,
  body: object,
): Promise<AuthSession> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: requestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new ApiError(
      await readApiErrorMessage(response),
      response.status,
    )
  }

  const session = await response.json() as AuthSession
  publishSession(session)
  return session
}

export function loginRequest(credentials: LoginCredentials) {
  return authRequest('/auth/login/', credentials)
}

export function registerRequest(credentials: RegisterCredentials) {
  return authRequest('/auth/register/', credentials)
}

export function refreshSession(): Promise<AuthSession | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh/`, {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders(),
      })

      if (!response.ok) {
        publishSession(null)
        return null
      }

      const session = await response.json() as AuthSession
      publishSession(session)
      return session
    } catch {
      publishSession(null)
      return null
    }
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export async function logoutRequest() {
  try {
    const headers = requestHeaders()
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

    await fetch(`${API_URL}/auth/logout/`, {
      method: 'POST',
      credentials: 'include',
      headers,
    })
  } finally {
    publishSession(null)
  }
}

async function sendAuthenticatedRequest(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers = requestHeaders(init.headers)

  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let response = await sendAuthenticatedRequest(path, init)
  if (response.status !== 401) return response

  const session = await refreshSession()
  if (!session) return response

  response = await sendAuthenticatedRequest(path, init)
  return response
}

export function publicApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'omit',
    headers: requestHeaders(init.headers),
  })
}