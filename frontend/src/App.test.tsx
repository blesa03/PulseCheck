import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  MemoryRouter,
} from 'react-router-dom'

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import App from './App'
import {
  AuthProvider,
} from './auth/AuthProvider'


function response(
  body: object,
  status = 200,
): Response {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    json: async () => body,
  } as Response
}


function renderApp(
  initialPath: string,
) {
  return render(
    <MemoryRouter
      initialEntries={[
        initialPath,
      ]}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}


afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})


describe('authentication flow', () => {
  it(
    'shows the login page when no refresh session exists',
    async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response(
            {
              detail:
                'Refresh token is missing.',
            },
            401,
          ),
        ),
      )

      renderApp('/login')

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Sign in',
          },
        ),
      ).toBeDefined()
    },
  )

  it(
    'restores an authenticated session from the refresh cookie',
    async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            access:
              'access-token',
            user: {
              id: 1,
              email:
                'user@example.com',
              date_joined:
                '2026-09-25T00:00:00Z',
            },
          }),
        ),
      )

      renderApp('/dashboard')

      expect(
        await screen.findByText(
          'user@example.com',
        ),
      ).toBeDefined()

      expect(
        screen.getByRole(
          'heading',
          {
            name:
              'Your dashboard',
          },
        ),
      ).toBeDefined()
    },
  )

  it(
    'signs in and enters the protected dashboard',
    async () => {
      const fetchMock = vi.fn(
        async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          const url =
            String(input)

          if (
            url.endsWith(
              '/auth/refresh/',
            )
          ) {
            return response(
              {},
              401,
            )
          }

          if (
            url.endsWith(
              '/auth/login/',
            ) &&
            init?.method === 'POST'
          ) {
            return response({
              access:
                'access-token',
              user: {
                id: 1,
                email:
                  'user@example.com',
                date_joined:
                  '2026-09-25T00:00:00Z',
              },
            })
          }

          throw new Error(
            `Unexpected request: ${url}`,
          )
        },
      )

      vi.stubGlobal(
        'fetch',
        fetchMock,
      )

      renderApp('/login')

      await screen.findByRole(
        'heading',
        {
          name: 'Sign in',
        },
      )

      fireEvent.change(
        screen.getByLabelText(
          'Email',
        ),
        {
          target: {
            value:
              'user@example.com',
          },
        },
      )

      fireEvent.change(
        screen.getByLabelText(
          'Password',
        ),
        {
          target: {
            value:
              'Rugged-Pulse-2026!',
          },
        },
      )

      fireEvent.click(
        screen.getByRole(
          'button',
          {
            name: 'Sign in',
          },
        ),
      )

      await waitFor(() => {
        expect(
          screen.getByText(
            'user@example.com',
          ),
        ).toBeDefined()
      })
    },
  )
})