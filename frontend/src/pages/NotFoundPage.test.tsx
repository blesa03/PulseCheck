import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { NotFoundPage } from './NotFoundPage'

describe('NotFoundPage', () => {
  it('provides an accessible heading and navigation link', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Return to dashboard' })).toBeDefined()
  })
})