import { useEffect, useState } from 'react'

import './App.css'

type ApiState = 'checking' | 'connected' | 'unavailable'

const API_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

function App() {
  const [apiState, setApiState] =
    useState<ApiState>('checking')

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${API_URL}/health/`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Health check failed with ${response.status}`,
          )
        }

        return response.json()
      })
      .then(() => {
        setApiState('connected')
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return
        }

        setApiState('unavailable')
      })

    return () => {
      controller.abort()
    }
  }, [])

  const apiMessage = {
    checking: 'Checking API connection…',
    connected: 'API connected',
    unavailable: 'API unavailable',
  }[apiState]

  return (
    <main className="app-shell">
      <section className="foundation-card">
        <p className="eyebrow">Service monitoring</p>

        <h1>PulseCheck</h1>

        <p className="description">
          Foundation ready. Monitoring comes next.
        </p>

        <div
          className={`api-status api-status--${apiState}`}
          role="status"
        >
          <span
            className="status-dot"
            aria-hidden="true"
          />

          {apiMessage}
        </div>
      </section>
    </main>
  )
}

export default App