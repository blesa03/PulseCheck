import {
  cleanup,
  render,
  screen,
} from '@testing-library/react'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import App from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('shows the API as connected when the health check succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: 'ok',
          service: 'pulsecheck-api',
        }),
      }),
    )

    render(<App />)

    expect(
      await screen.findByText('API connected'),
    ).toBeDefined()
  })

  it('shows the API as unavailable when the health check fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new Error('Connection failed'),
      ),
    )

    render(<App />)

    expect(
      await screen.findByText('API unavailable'),
    ).toBeDefined()
  })
})