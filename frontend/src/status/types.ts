export type PublicMonitorStatus =
  | 'UP'
  | 'DEGRADED'
  | 'DOWN'
  | 'PAUSED'
  | 'PENDING'


export type PublicOverallStatus =
  | PublicMonitorStatus
  | 'NO_DATA'


export interface StatusPageConfig {
  id: number

  title: string
  description: string
  slug: string
  enabled: boolean

  monitor_ids: number[]

  created_at: string
  updated_at: string
}


export interface StatusPageUpdate {
  title?: string
  description?: string
  slug?: string
  enabled?: boolean
  monitor_ids?: number[]
}


export interface PublicStatusDailyMetric {
  date: string

  uptime_percentage:
    number | null
}


export interface PublicStatusMonitor {
  id: number

  name: string
  status: PublicMonitorStatus

  last_checked_at:
    string | null

  uptime_30d:
    number | null

  daily:
    PublicStatusDailyMetric[]
}


export interface PublicStatusIncident {
  id: number

  monitor_id: number
  monitor_name: string

  started_at: string
  resolved_at: string | null

  duration_seconds: number
}


export interface PublicStatusPayload {
  slug: string
  title: string
  description: string

  overall_status:
    PublicOverallStatus

  generated_at: string

  monitors:
    PublicStatusMonitor[]

  incidents:
    PublicStatusIncident[]
}