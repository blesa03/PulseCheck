export interface AuthUser {
  id: number
  email: string
  date_joined: string
}

export interface AuthSession {
  access: string
  user: AuthUser
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  password_confirm: string
}

export type AuthStatus =
  | 'initializing'
  | 'authenticated'
  | 'unauthenticated'

export interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus

  login: (
    credentials: LoginCredentials,
  ) => Promise<void>

  register: (
    credentials: RegisterCredentials,
  ) => Promise<void>

  logout: () => Promise<void>
}