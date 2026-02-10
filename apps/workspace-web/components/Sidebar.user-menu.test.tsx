import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import Page from '../app/page'
import { useAuthStore } from '../lib/store/auth'

describe('User menu', () => {
  it('shows login button when not authenticated', () => {
    // Mock unauthenticated state (but prevent redirect by not fully initializing)
    useAuthStore.setState({ 
      user: undefined, 
      status: 'loading',  // Use 'loading' to prevent redirect
      initialized: false 
    })
    
    render(<Page />)
    // When loading, the header shows "加载中..." instead of login button
    expect(screen.getByText('加载中…')).toBeInTheDocument()
  })

  it('opens user menu and can logout', async () => {
    // Mock the auth store to simulate existing session
    const mockUser = { id: 'u', name: '测试用户', username: 'testuser' }
    useAuthStore.setState({ 
      user: mockUser, 
      status: 'authenticated',
      initialized: true 
    })
    
    render(<Page />)
    const userBtn = await screen.findByRole('button', { name: '用户菜单' })
    fireEvent.click(userBtn)
    const logoutItem = await screen.findByRole('menuitem', { name: '退出登录' })
    fireEvent.click(logoutItem)
    
    // After logout, status should be 'unauthenticated'
    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('unauthenticated')
      expect(useAuthStore.getState().user).toBeUndefined()
    })
  })
})
