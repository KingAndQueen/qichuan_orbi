/**
 * Marketplace Page - Unsubscribe Tests
 * 工作流市场页面 - 取消订阅测试
 * 
 * Test Coverage / 测试覆盖：
 * - Unsubscribe button appears for subscribed workflows
 * - Unsubscribe confirmation dialog
 * - Cancel unsubscribe (no changes)
 * - Confirm unsubscribe (status changes)
 * - Unsubscribe preserves trial status if exists
 * 
 * @see docs/quality-assurance.md
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MarketplacePage from '../../app/marketplace/page'
import { useMarketplaceStore } from '../../lib/store/marketplace'

describe('Marketplace Page - Unsubscribe', () => {
  beforeEach(() => {
    // Clear localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }

    // Reset store to initial state
    const store = useMarketplaceStore.getState()
    const resetStatus: Record<string, any> = {}
    store.workflows.forEach(w => {
      resetStatus[w.id] = {
        workflowId: w.id,
        trialRemaining: undefined,
        subscribed: false
      }
    })
    useMarketplaceStore.setState({
      userStatus: resetStatus,
      activeCategory: 'customer_driven',
      hydrated: false
    })

    // Mock window methods
    vi.spyOn(window, 'alert').mockImplementation(() => { })
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows unsubscribe button for subscribed workflow', async () => {
    render(<MarketplacePage />)

    // Wait for mount
    await waitFor(() => {
      expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    })

    // Subscribe first
    const subscribeButtons = screen.getAllByRole('button', { name: /订阅 ¥\d+\/月/ })
    fireEvent.click(subscribeButtons[0])

    // Should show subscribed badge
    await waitFor(() => {
      expect(screen.getByText('✓ 已订阅')).toBeInTheDocument()
    })

    // Should show unsubscribe button
    expect(screen.getByRole('button', { name: /取消订阅/ })).toBeInTheDocument()
  })

  it('unsubscribes when user confirms', async () => {
    render(<MarketplacePage />)

    await waitFor(() => {
      expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    })

    // Subscribe first
    const subscribeButtons = screen.getAllByRole('button', { name: /订阅 ¥\d+\/月/ })
    fireEvent.click(subscribeButtons[0])

    await waitFor(() => {
      expect(screen.getByText('✓ 已订阅')).toBeInTheDocument()
    })

    // Click unsubscribe
    const unsubscribeButton = screen.getByRole('button', { name: /取消订阅/ })
    fireEvent.click(unsubscribeButton)

    // Should show confirmation
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('确认取消订阅'))

    // Should show success alert
    expect(window.alert).toHaveBeenCalledWith('✓ 已取消订阅')

    // Should no longer show subscribed badge
    await waitFor(() => {
      expect(screen.queryByText('✓ 已订阅')).not.toBeInTheDocument()
    })

    // Should show trial or subscribe buttons again (use queryAll since there are multiple workflows)
    const buttons = screen.getAllByRole('button', { name: /免费试用 \(3次\)|订阅/ })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('does not unsubscribe when user cancels confirmation', async () => {
    render(<MarketplacePage />)

    await waitFor(() => {
      expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    })

    // Subscribe first
    const subscribeButtons = screen.getAllByRole('button', { name: /订阅 ¥\d+\/月/ })
    fireEvent.click(subscribeButtons[0])

    await waitFor(() => {
      expect(screen.getByText('✓ 已订阅')).toBeInTheDocument()
    })

    // Mock user cancels
    vi.spyOn(window, 'confirm').mockImplementationOnce(() => false)

    // Click unsubscribe
    const unsubscribeButton = screen.getByRole('button', { name: /取消订阅/ })
    fireEvent.click(unsubscribeButton)

    // Should show confirmation
    expect(window.confirm).toHaveBeenCalled()

    // Should NOT show success alert
    expect(window.alert).not.toHaveBeenCalledWith('✓ 已取消订阅')

    // Should still show subscribed badge
    expect(screen.getByText('✓ 已订阅')).toBeInTheDocument()
  })

  it('preserves trial status after unsubscribe', async () => {
    render(<MarketplacePage />)

    await waitFor(() => {
      expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    })

    // Start trial first
    const trialButtons = screen.getAllByRole('button', { name: /免费试用 \(3次\)/ })
    fireEvent.click(trialButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续使用 \(剩余3次\)/ })).toBeInTheDocument()
    })

    // Then subscribe
    const subscribeButton = screen.getByRole('button', { name: /订阅 ¥99\/月/ })
    fireEvent.click(subscribeButton)

    await waitFor(() => {
      expect(screen.getByText('✓ 已订阅')).toBeInTheDocument()
    })

    // Now unsubscribe
    const unsubscribeButton = screen.getByRole('button', { name: /取消订阅/ })
    fireEvent.click(unsubscribeButton)

    // Should show cancel alert
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('✓ 已取消订阅')
    })

    // Should restore trial status (continue use button with remaining count)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续使用 \(剩余3次\)/ })).toBeInTheDocument()
    })
  })

  it('persists unsubscribe to localStorage', async () => {
    render(<MarketplacePage />)

    await waitFor(() => {
      expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    })

    // Subscribe
    const subscribeButtons = screen.getAllByRole('button', { name: /订阅 ¥\d+\/月/ })
    fireEvent.click(subscribeButtons[0])

    await waitFor(() => {
      expect(screen.getByText('✓ 已订阅')).toBeInTheDocument()
    })

    // Unsubscribe
    const unsubscribeButton = screen.getByRole('button', { name: /取消订阅/ })
    fireEvent.click(unsubscribeButton)

    // Check localStorage
    await waitFor(() => {
      const stored = localStorage.getItem('of:marketplace:user-status:v1')
      expect(stored).toBeTruthy()

      if (stored) {
        const data = JSON.parse(stored)
        expect(data['w-crisis-pr']).toBeDefined()
        expect(data['w-crisis-pr'].subscribed).toBe(false)
        expect(data['w-crisis-pr'].subscriptionExpiresAt).toBeUndefined()
      }
    })
  })
})
