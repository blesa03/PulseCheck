import type {
  AuthSession,
  LoginCredentials,
  RegisterCredentials,
} from '../auth/types'

const API_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:8000/api'

let accessToken: string | null = null

let sessionListener:
  | ((session: AuthSession | null) => void)
  | null = null

let refreshPromise:
  | Promise<AuthSession | null>
  | null = null


export class ApiError extends Error {
  status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)

    this.name = 'ApiError'
    this.status = status
  }
}


function publishSession(
  session: AuthSession | null,
) {
  accessToken = session?.access ?? null

  sessionListener?.(session)
}


export function subscribeToAuthSession(
  listener: (
    session: AuthSession | null,
  ) => void,
) {
  sessionListener = listener

  return () => {
    if (sessionListener === listener) {
      sessionListener = null
    }
  }
}


async function readErrorMessage(
  response: Response,
): Promise<string> {
  try {
    const data = await response.json()

    if (
      typeof data === 'object' &&
      data !== null
    ) {
      if (
        'detail' in data &&
        typeof data.detail === 'string'
      ) {
        return data.detail
      }

      for (
        const value of Object.values(data)
      ) {
        if (
          Array.isArray(value) &&
          typeof value[0] === 'string'
        ) {
          return value[0]
        }

        if (typeof value === 'string') {
          return value
        }
      }
    }
  } catch {
    // Fall through to the generic message.
  }

  return `Request failed with status ${response.status}.`
}


async function authRequest(
  path: string,
  body: object,
): Promise<AuthSession> {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    throw new ApiError(
      await readErrorMessage(response),
      response.status,
    )
  }

  const session =
    await response.json() as AuthSession

  publishSession(session)

  return session
}


export async function loginRequest(
  credentials: LoginCredentials,
) {
  return authRequest(
    '/auth/login/',
    credentials,
  )
}


export async function registerRequest(
  credentials: RegisterCredentials,
) {
  return authRequest(
    '/auth/register/',
    credentials,
  )
}


export function refreshSession():
  Promise<AuthSession | null> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (
    async () => {
      try {
        const response = await fetch(
          `${API_URL}/auth/refresh/`,
          {
            method: 'POST',
            credentials: 'include',
          },
        )

        if (!response.ok) {
          publishSession(null)

          return null
        }

        const session =
          await response.json() as AuthSession

        publishSession(session)

        return session
      } catch {
        publishSession(null)

        return null
      }
    }
  )().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}


export async function logoutRequest() {
  try {
    await fetch(
      `${API_URL}/auth/logout/`,
      {
        method: 'POST',
        credentials: 'include',
        headers: accessToken
          ? {
              Authorization:
                `Bearer ${accessToken}`,
            }
          : undefined,
      },
    )
  } finally {
    publishSession(null)
  }
}


async function sendAuthenticatedRequest(
  path: string,
  init: RequestInit,
) {
  const headers = new Headers(
    init.headers,
  )

  if (accessToken) {
    headers.set(
      'Authorization',
      `Bearer ${accessToken}`,
    )
  }

  return fetch(
    `${API_URL}${path}`,
    {
      ...init,
      headers,
      credentials: 'include',
    },
  )
}


export async function apiFetch(
  path: string,
  init: RequestInit = {},
) {
  let response =
    await sendAuthenticatedRequest(
      path,
      init,
    )

  if (response.status !== 401) {
    return response
  }

  const session = await refreshSession()

  if (!session) {
    return response
  }

  response =
    await sendAuthenticatedRequest(
      path,
      init,
    )

  return response
}