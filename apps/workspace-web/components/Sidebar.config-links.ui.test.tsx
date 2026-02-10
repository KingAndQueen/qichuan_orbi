import React from 'react'
import { screen, within } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import Page from '../app/page'

describe('Sidebar config links', () => {
  it('renders config links with real hrefs', () => {
    render(<Page />)
    const sidebar = screen.getByRole('complementary')
    const linkTexts = ['工作流市场', '数据洞察', '三方管理']
    const hrefs = ['/marketplace', '/activity', '/connections']
    linkTexts.forEach((text, idx) => {
      const link = within(sidebar).getByRole('link', { name: text }) as HTMLAnchorElement
      expect(link).toBeInTheDocument()
      expect(link.getAttribute('href')).toBe(hrefs[idx])
    })
  })
})
