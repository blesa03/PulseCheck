import {
  ApiError,
  apiFetch,
  readApiErrorMessage,
} from '../api/client'

import type {
  CheckResult,
  Incident,
  MetricsPeriod,
  Monitor,
  MonitorCheckResponse,
  MonitorMetrics,
  MonitorWritePayload,
} from './types'


async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(
    path,
    init,
  )

  if (!response.ok) {
    throw new ApiError(
      await readApiErrorMessage(
        response,
      ),
      response.status,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return await response.json() as T
}


export function listMonitors() {
  return request<Monitor[]>(
    '/monitors/',
  )
}


export function createMonitor(
  payload: MonitorWritePayload,
) {
  return request<Monitor>(
    '/monitors/',
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(
        payload,
      ),
    },
  )
}


export function updateMonitor(
  id: number,
  payload:
    Partial<MonitorWritePayload>,
) {
  return request<Monitor>(
    `/monitors/${id}/`,
    {
      method: 'PATCH',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(
        payload,
      ),
    },
  )
}


export function deleteMonitor(
  id: number,
) {
  return request<void>(
    `/monitors/${id}/`,
    {
      method: 'DELETE',
    },
  )
}


export function pauseMonitor(
  id: number,
) {
  return request<Monitor>(
    `/monitors/${id}/pause/`,
    {
      method: 'POST',
    },
  )
}


export function resumeMonitor(
  id: number,
) {
  return request<Monitor>(
    `/monitors/${id}/resume/`,
    {
      method: 'POST',
    },
  )
}


export function runMonitorCheck(
  id: number,
) {
  return request<MonitorCheckResponse>(
    `/monitors/${id}/check/`,
    {
      method: 'POST',
    },
  )
}

export function getMonitorMetrics(
  id: number,
  period: MetricsPeriod = '24h',
) {
  return request<MonitorMetrics>(
    `/monitors/${id}/metrics/?period=${period}`,
  )
}

export function getMonitor(
  id: number,
) {
  return request<Monitor>(
    `/monitors/${id}/`,
  )
}


export function getMonitorChecks(
  id: number,
  limit = 50,
) {
  return request<CheckResult[]>(
    `/monitors/${id}/checks/?limit=${limit}`,
  )
}


export function getMonitorIncidents(
  id: number,
) {
  return request<Incident[]>(
    `/monitors/${id}/incidents/`,
  )
}