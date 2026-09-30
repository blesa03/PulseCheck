import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  MemoryRouter,
} from 'react-router-dom'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  useAuth,
} from '../auth/useAuth'

import {
  createMonitor,
  deleteMonitor,
  getMonitorMetrics,
  listMonitors,
  pauseMonitor,
  resumeMonitor,
  runMonitorCheck,
  updateMonitor,
} from '../monitors/api'

import {
  DashboardPage,
} from './DashboardPage'

import type {
  Monitor,
  MonitorMetrics,
} from '../monitors/types'


vi.mock(
  '../auth/useAuth',
  () => ({
    useAuth: vi.fn(),
  }),
)


vi.mock(
  '../monitors/api',
  () => ({
    createMonitor: vi.fn(),
    updateMonitor: vi.fn(),
    deleteMonitor: vi.fn(),
    getMonitorMetrics: vi.fn(),
    listMonitors: vi.fn(),
    pauseMonitor: vi.fn(),
    resumeMonitor: vi.fn(),
    runMonitorCheck: vi.fn(),
  }),
)


const monitor: Monitor = {
  id: 1,

  name: 'Example Production',
  url: 'https://example.com',

  interval_seconds: 60,
  timeout_seconds: 10,

  failure_threshold: 2,
  recovery_threshold: 1,

  retention_policy: '30_DAYS',

  follow_redirects: true,

  accepted_status_ranges: [
    {
      min: 200,
      max: 399,
    },
  ],

  status: 'UP',
  enabled: true,

  consecutive_failures: 0,
  consecutive_successes: 5,

  last_checked_at:
    '2026-09-30T04:00:00Z',

  next_check_at:
    '2026-09-30T04:01:00Z',

  created_at:
    '2026-09-29T00:00:00Z',

  updated_at:
    '2026-09-30T04:00:00Z',
}


const metrics: MonitorMetrics = {
  monitor_id: 1,
  period: '24h',

  window: {
    start:
      '2026-09-29T04:00:00Z',
    end:
      '2026-09-30T04:00:00Z',
  },

  uptime: {
    percentage: 99.5,
    window_seconds: 86400,
    downtime_seconds: 432,
  },

  checks: {
    total: 100,
    successful: 96,
    failed: 4,
    success_percentage: 96,
  },

  latency: {
    average_ms: 120,
    min_ms: 70,
    max_ms: 410,
  },

  incidents: {
    count: 1,
    open_count: 0,
  },

  daily: [],
}


beforeEach(() => {
  vi.mocked(
    useAuth,
  ).mockReturnValue({
    user: {
      id: 1,
      email:
        'user@example.com',
      date_joined:
        '2026-09-01T00:00:00Z',
    },

    status: 'authenticated',

    login:
      vi.fn()
        .mockResolvedValue(
          undefined,
        ),

    register:
      vi.fn()
        .mockResolvedValue(
          undefined,
        ),

    logout:
      vi.fn()
        .mockResolvedValue(
          undefined,
        ),
  })

  vi.mocked(
    listMonitors,
  ).mockResolvedValue([
    monitor,
  ])

  vi.mocked(
    getMonitorMetrics,
  ).mockResolvedValue(
    metrics,
  )

  vi.mocked(
    createMonitor,
  ).mockResolvedValue(
    monitor,
  )

  vi.mocked(
    updateMonitor,
  ).mockResolvedValue(
    monitor,
  )

  vi.mocked(
    pauseMonitor,
  ).mockResolvedValue({
    ...monitor,
    status: 'PAUSED',
    enabled: false,
  })

  vi.mocked(
    resumeMonitor,
  ).mockResolvedValue({
    ...monitor,
    status: null,
    enabled: true,
  })

  vi.mocked(
    runMonitorCheck,
  ).mockResolvedValue({
    check_result: {
      id: 20,
      monitor: 1,
      result: 'SUCCESS',
      http_status: 200,
      response_time_ms: 95,
      error_type: null,
      checked_at:
        '2026-09-30T04:02:00Z',
    },

    monitor: {
      ...monitor,
      status: 'UP',
      last_checked_at:
        '2026-09-30T04:02:00Z',
    },
  })

  vi.mocked(
    deleteMonitor,
  ).mockResolvedValue(
    undefined,
  )
})


afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})


describe(
  'private dashboard',
  () => {
    it(
      'loads monitor health and 24 hour metrics',
      async () => {
        render(
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>,
        )

        expect(
          await screen.findByRole(
            'heading',
            {
              name:
                'Monitoring health',
            },
          ),
        ).toBeDefined()

        expect(
          await screen.findByText(
            'Example Production',
          ),
        ).toBeDefined()

        await waitFor(() => {
          expect(
            getMonitorMetrics,
          ).toHaveBeenCalledWith(
            1,
            '24h',
          )
        })

        expect(
          screen.getAllByText(
            '99.50%',
          ).length,
        ).toBeGreaterThan(0)

        expect(
          screen.getAllByText(
            '120 ms',
          ).length,
        ).toBeGreaterThan(0)

        expect(
          screen.getAllByText(
            '100',
          ).length,
        ).toBeGreaterThan(0)
      },
    )
  },
)