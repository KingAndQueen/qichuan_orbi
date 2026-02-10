import React from 'react'
import { render, screen } from '@testing-library/react'
import { MarkdownRenderer } from './MarkdownRenderer'

describe('MarkdownRenderer sanitization', () => {
  it('escapes raw HTML to prevent script execution', () => {
    const md = '<script>alert(1)</script>**bold**'
    render(<MarkdownRenderer content={md} />)
    // Script tag should be visible as text, not executed nor parsed
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    // Bold markdown should still render as strong
    const strong = document.querySelector('strong')
    expect(strong?.textContent).toBe('bold')
  })
})
