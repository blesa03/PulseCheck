import {
  cleanup,
  render,
  screen,
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
  getPublicStatusPage,
} from '../status/api'

import {
  PublicStatusPage,
} from './PublicStatusPage'


vi.mock(
  '../status/api',
  () => ({
    getPublicStatusPage:
      vi.fn(),
  }),
)


beforeEach(() => {
  vi.mocked(
    getPublicStatusPage,
  ).mockResolvedValue({
    slug: 'acme',
    title: 'Acme Status',
    description:
      'Availability of Acme services.',

    overall_status: 'UP',

    generated_at:
      '2026-09-30T06:00:00Z',

    monitors: [
      {
        id: 1,
        name: 'Production API',
        status: 'UP',

        last_checked_at:
          '2026-09-30T06:00:00Z',

        uptime_30d: 99.99,

        daily: [
          {
            date:
              '2026-09-30',

            uptime_percentage:
              100,
          },
        ],
      },
    ],

    incidents: [],
  })
})


afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})


describe(
  'public status page',
  () => {
    it(
      'renders public service health',
      async () => {
        render(
          <MemoryRouter
            initialEntries={[
              '/status/acme',
            ]}
          >
            <Routes>
              <Route
                path="/status/:slug"
                element={
                  <PublicStatusPage />
                }
              />
            </Routes>
          </MemoryRouter>,
        )

        expect(
          await screen.findByRole(
            'heading',
            {
              name: 'Acme Status',
            },
          ),
        ).toBeDefined()

        expect(
          screen.getByText(
            'All systems operational',
          ),
        ).toBeDefined()

        expect(
          screen.getByText(
            'Production API',
          ),
        ).toBeDefined()

        expect(
          screen.getByText(
            '99.99%',
          ),
        ).toBeDefined()

        expect(
          screen.getByText(
            'No incidents reported.',
          ),
        ).toBeDefined()

        expect(
          getPublicStatusPage,
        ).toHaveBeenCalledWith(
          'acme',
        )
      },
    )
  },
)