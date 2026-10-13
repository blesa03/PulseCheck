import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="not-found-heading">
        <div className="brand">PulseCheck</div>
        <h1 id="not-found-heading">Page not found</h1>
        <p className="auth-description">
          The address you requested does not exist.
        </p>
        <Link to="/dashboard">Return to dashboard</Link>
      </section>
    </main>
  )
}