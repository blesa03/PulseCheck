export interface StatusRange {
  min: number
  max: number
}


export type MonitorStatus =
  | 'UP'
  | 'DEGRADED'
  | 'DOWN'
  | 'PAUSED'
  | null


export type RetentionPolicy =
  | '48_HOURS'
  | '7_DAYS'
  | '14_DAYS'
  | '30_DAYS'
  | 'FOREVER'


export interface Monitor {
  id: number

  name: string
  url: string

  interval_seconds: number
  timeout_seconds: number

  failure_threshold: number
  recovery_threshold: number

  retention_policy: RetentionPolicy

  follow_redirects: boolean

  accepted_status_ranges:
    StatusRange[]

  status: MonitorStatus
  enabled: boolean

  consecutive_failures: number
  consecutive_successes: number

  last_checked_at: string | null
  next_check_at: string | null

  created_at: string
  updated_at: string
}


export interface MonitorWritePayload {
  name: string
  url: string

  interval_seconds: number
  timeout_seconds: number

  failure_threshold: number
  recovery_threshold: number

  retention_policy: RetentionPolicy

  follow_redirects: boolean

  accepted_status_ranges:
    StatusRange[]
}

export type CheckResultStatus =
  | 'SUCCESS'
  | 'FAILURE'


export type CheckErrorType =
  | 'TIMEOUT'
  | 'DNS_ERROR'
  | 'CONNECTION_ERROR'
  | 'SSL_ERROR'
  | 'TOO_MANY_REDIRECTS'


export interface CheckResult {
  id: number
  monitor: number

  result: CheckResultStatus

  http_status: number | null
  response_time_ms: number

  error_type:
    CheckErrorType | null

  checked_at: string
}

export interface MonitorCheckResponse {
  check_result: CheckResult
  monitor: Monitor
}