import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import {
  MemoryRouter,
  Route,
  Routes,
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
  getMonitor,
  getMonitorChecks,
  getMonitorIncidents,
  getMonitorMetrics,
  pauseMonitor,
  resumeMonitor,
  runMonitorCheck,
  updateMonitor,
} from '../monitors/api'

import {
  MonitorDetailPage,
} from './MonitorDetailPage'

import type {
  Incident,
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
    getMonitor: vi.fn(),
    getMonitorChecks: vi.fn(),
    getMonitorIncidents: vi.fn(),
    getMonitorMetrics: vi.fn(),
    pauseMonitor: vi.fn(),
    resumeMonitor: vi.fn(),
    runMonitorCheck: vi.fn(),
  }),
)


const monitor: Monitor = {
  id: 1,

  name: 'Example Production',
  url: 'https://example.com',

  interval_seconds: 90,
  timeout_seconds: 5,

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
  consecutive_successes: 10,

  last_checked_at:
    '2026-09-30T05:00:00Z',

  next_check_at:
    '2026-09-30T05:01:30Z',

  created_at:
    '2026-09-20T00:00:00Z',

  updated_at:
    '2026-09-30T05:00:00Z',
}


const metrics: MonitorMetrics = {
  monitor_id: 1,
  period: '7d',

  window: {
    start:
      '2026-09-24T00:00:00Z',

    end:
      '2026-09-30T05:00:00Z',
  },

  uptime: {
    percentage: 99.9,
    window_seconds: 540000,
    downtime_seconds: 540,
  },

  checks: {
    total: 200,
    successful: 198,
    failed: 2,
    success_percentage: 99,
  },

  latency: {
    average_ms: 68,
    min_ms: 40,
    max_ms: 300,
  },

  incidents: {
    count: 1,
    open_count: 0,
  },

  daily: [
    {
      date: '2026-09-30',

      total_checks: 28,
      successful_checks: 28,
      failed_checks: 0,

      check_success_percentage:
        100,

      average_response_time_ms:
        68,

      min_response_time_ms:
        50,

      max_response_time_ms:
        90,

      uptime_percentage:
        100,

      window_seconds:
        18000,

      downtime_seconds:
        0,
    },
  ],
}


const incident: Incident = {
  id: 4,
  monitor: 1,

  started_at:
    '2026-09-29T02:00:00Z',

  resolved_at:
    '2026-09-29T02:09:00Z',

  duration_seconds: 540,
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

    status:
      'authenticated',

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
    getMonitor,
  ).mockResolvedValue(
    monitor,
  )

  vi.mocked(
    getMonitorMetrics,
  ).mockResolvedValue(
    metrics,
  )

  vi.mocked(
    getMonitorChecks,
  ).mockResolvedValue([
    {
      id: 22,
      monitor: 1,

      result: 'SUCCESS',

      http_status: 200,

      response_time_ms: 68,

      error_type: null,

      checked_at:
        '2026-09-30T05:00:00Z',
    },
  ])

  vi.mocked(
    getMonitorIncidents,
  ).mockResolvedValue([
    incident,
  ])

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
    deleteMonitor,
  ).mockResolvedValue(
    undefined,
  )

  vi.mocked(
    runMonitorCheck,
  ).mockResolvedValue({
    check_result: {
      id: 23,
      monitor: 1,

      result: 'SUCCESS',

      http_status: 200,

      response_time_ms: 60,

      error_type: null,

      checked_at:
        '2026-09-30T05:02:00Z',
    },

    monitor,
  })
})


afterEach(() => {
  cleanup()

  vi.clearAllMocks()
})


describe(
  'monitor detail',
  () => {
    it(
      'loads metrics, checks and incident history',
      async () => {
        render(
          <MemoryRouter
            initialEntries={[
              '/monitors/1',
            ]}
          >
            <Routes>
              <Route
                path="/monitors/:monitorId"
                element={
                  <MonitorDetailPage />
                }
              />
            </Routes>
          </MemoryRouter>,
        )

        expect(
          await screen.findByRole(
            'heading',
            {
              name:
                'Example Production',
            },
          ),
        ).toBeDefined()

        await waitFor(() => {
          expect(
            getMonitor,
          ).toHaveBeenCalledWith(
            1,
          )

          expect(
            getMonitorMetrics,
          ).toHaveBeenCalledWith(
            1,
            '7d',
          )

          expect(
            getMonitorChecks,
          ).toHaveBeenCalledWith(
            1,
            50,
          )

          expect(
            getMonitorIncidents,
          ).toHaveBeenCalledWith(
            1,
          )
        })

        expect(
          screen.getByText(
            '99.90%',
          ),
        ).toBeDefined()

        const averageResponseCard =
          screen
            .getByText(
              'Avg response',
            )
            .closest('article')

        expect(
          averageResponseCard,
          ).not.toBeNull()

        expect(
          within(
            averageResponseCard as HTMLElement,
          ).getByText(
            '68 ms',
          ),
        ).toBeDefined()

        expect(
          screen.getByRole(
            'heading',
            {
              name:
                'Historical performance',
            },
          ),
        ).toBeDefined()

        expect(
          screen.getByRole(
            'heading',
            {
              name:
                'Monitor settings',
            },
          ),
        ).toBeDefined()

        expect(
          screen.getByRole(
            'heading',
            {
              name:
                'Recent raw checks',
            },
          ),
        ).toBeDefined()

        expect(
          screen.getByRole(
            'heading',
            {
              name:
                'Incident history',
            },
          ),
        ).toBeDefined()

        expect(
          screen.getByText(
            'HTTP 200',
          ),
        ).toBeDefined()

        const monitorSettingsSection =
          screen
            .getByRole(
              'heading',
              {
                name:
                  'Monitor settings',
              },
            )
            .closest('section')

        expect(
          monitorSettingsSection,
        ).not.toBeNull()

        expect(
          within(
            monitorSettingsSection as HTMLElement,
          ).getByText(
            '30 days',
          ),
        ).toBeDefined()
      },
    )

    it(
      'renders an invalid monitor id without requesting data',
      async () => {
        render(
          <MemoryRouter
            initialEntries={[
              '/monitors/not-a-number',
            ]}
          >
            <Routes>
              <Route
                path="/monitors/:monitorId"
                element={
                  <MonitorDetailPage />
                }
              />
            </Routes>
          </MemoryRouter>,
        )

        expect(
          screen.getByRole(
            'heading',
            {
              name:
                'Monitor unavailable',
            },
          ),
        ).toBeDefined()

        expect(
          screen.getByText(
            'Invalid monitor identifier.',
          ),
        ).toBeDefined()

        expect(
          getMonitor,
        ).not.toHaveBeenCalled()

        expect(
          getMonitorMetrics,
        ).not.toHaveBeenCalled()

        expect(
          getMonitorChecks,
        ).not.toHaveBeenCalled()

        expect(
          getMonitorIncidents,
        ).not.toHaveBeenCalled()
      },
    )
  },
)