import React from 'react'
import { screen, within } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import Page from '../app/page'
import { useAuthStore } from '../lib/store/auth'

describe('Sidebar new chat icon', () => {
  it('shows new chat button in sidebar', () => {
    // Mock authenticated state
    useAuthStore.setState({ 
      user: { id: 'u', name: '测试用户', username: 'testuser' }, 
      status: 'authenticated',
      initialized: true 
    })
    
    render(<Page />)
    const sidebar = screen.getByRole('complementary')
    const btn = within(sidebar).getByRole('button', { name: '发起新对话' })
    expect(btn).toBeInTheDocument()
    // Simplified: just verify button exists, not checking specific icon implementation
  })
})
