import {
  cleanup,
  render,
  screen,
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
  listMonitors,
} from '../monitors/api'

import {
  getStatusPageConfig,
} from '../status/api'

import {
  StatusPageSettingsPage,
} from './StatusPageSettingsPage'


vi.mock(
  '../monitors/api',
  () => ({
    listMonitors: vi.fn(),
  }),
)


vi.mock(
  '../status/api',
  () => ({
    getStatusPageConfig:
      vi.fn(),

    updateStatusPageConfig:
      vi.fn(),
  }),
)


beforeEach(() => {
  vi.mocked(
    getStatusPageConfig,
  ).mockResolvedValue({
    id: 1,
    title: 'Acme Status',
    description:
      'Public health information.',
    slug: 'acme',
    enabled: true,

    monitor_ids: [
      1,
    ],

    created_at:
      '2026-09-30T00:00:00Z',

    updated_at:
      '2026-09-30T00:00:00Z',
  })

  vi.mocked(
    listMonitors,
  ).mockResolvedValue([
    {
      id: 1,

      name: 'Production API',
      url: 'https://example.com',

      interval_seconds: 60,
      timeout_seconds: 10,

      failure_threshold: 2,
      recovery_threshold: 1,

      retention_policy:
        '30_DAYS',

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

      last_checked_at: null,
      next_check_at: null,

      created_at:
        '2026-09-30T00:00:00Z',

      updated_at:
        '2026-09-30T00:00:00Z',
    },
  ])
})


afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})


describe(
  'status page settings',
  () => {
    it(
      'loads configured public monitors',
      async () => {
        render(
          <MemoryRouter>
            <StatusPageSettingsPage />
          </MemoryRouter>,
        )

        expect(
          await screen.findByRole(
            'heading',
            {
              name: 'Status page',
            },
          ),
        ).toBeDefined()

        expect(
          screen.getByDisplayValue(
            'Acme Status',
          ),
        ).toBeDefined()

        expect(
          screen.getByText(
            'Production API',
          ),
        ).toBeDefined()
      },
    )
  },
)