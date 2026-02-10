/**
 * Marketplace Page - Interaction Tests
 * 工作流市场页面 - 交互测试
 * 
 * Test Coverage / 测试覆盖：
 * - Start trial button interaction
 * - Subscribe button interaction
 * - Continue use button (for trialing workflows)
 * - Status badge display for different states
 * - LocalStorage persistence
 * 
 * @see docs/quality-assurance.md
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MarketplacePage from '../../app/marketplace/page'
import { useMarketplaceStore } from '../../lib/store/marketplace'

describe('Marketplace Page - Interactions', () => {
  beforeEach(() => {
    // Clear localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }

    // Reset store to initial state
    const store = useMarketplaceStore.getState()
    // Reset all user status to default (no trial, no subscription)
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

    // Mock window.alert and window.confirm
    vi.spyOn(window, 'alert').mockImplementation(() => { })
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts trial when clicking trial button', async () => {
    render(<MarketplacePage />)

    // Find and click trial button for first workflow (there are multiple, get the first one)
    const trialButtons = screen.getAllByRole('button', { name: /免费试用 \(3次\)/ })
    fireEvent.click(trialButtons[0])

    // Should show alert
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('试用已开通'))

    // Button should change to "继续使用"
    expect(await screen.findByRole('button', { name: /继续使用/ })).toBeInTheDocument()
  })

  it('subscribes when clicking subscribe button with confirmation', async () => {
    render(<MarketplacePage />)

    // Find and click subscribe button (get the first one for the first workflow)
    const subscribeButtons = screen.getAllByRole('button', { name: /订阅 ¥99\/月/ })
    fireEvent.click(subscribeButtons[0])

    // Should show confirmation dialog
    expect(window.confirm).toHaveBeenCalled()

    // Should show success alert
    expect(window.alert).toHaveBeenCalledWith('✓ 订阅成功！')

    // Should show subscribed badge
    expect(await screen.findByText('✓ 已订阅')).toBeInTheDocument()
  })

  it('does not subscribe when user cancels confirmation', async () => {
    // Override the mock for this specific test
    vi.spyOn(window, 'confirm').mockImplementationOnce(() => false)
    render(<MarketplacePage />)

    // Wait for component to mount and render
    await waitFor(() => {
      expect(screen.getByText('工作流市场')).toBeInTheDocument()
    })

    const subscribeButtons = screen.getAllByRole('button', { name: /订阅 ¥\d+\/月/ })
    fireEvent.click(subscribeButtons[0])

    // Should show confirmation
    expect(window.confirm).toHaveBeenCalled()

    // Should NOT show success alert
    expect(window.alert).not.toHaveBeenCalledWith('✓ 订阅成功！')

    // Should NOT show subscribed badge
    expect(screen.queryByText('✓ 已订阅')).not.toBeInTheDocument()
  })

  it('shows "continue use" button with remaining count after trial started', async () => {
    render(<MarketplacePage />)

    // Start trial
    const trialButtons = screen.getAllByRole('button', { name: /免费试用 \(3次\)/ })
    fireEvent.click(trialButtons[0])

    // Should show continue use button with count
    const continueButton = await screen.findByRole('button', { name: /继续使用 \(剩余3次\)/ })
    expect(continueButton).toBeInTheDocument()
  })

  it('persists user status to localStorage', async () => {
    render(<MarketplacePage />)

    // Wait for component to mount
    await waitFor(() => {
      expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    })

    // Start trial
    const trialButtons = screen.getAllByRole('button', { name: /免费试用 \(3次\)/ })
    fireEvent.click(trialButtons[0])

    // Wait for state update
    await waitFor(() => {
      const stored = localStorage.getItem('of:marketplace:user-status:v1')
      expect(stored).toBeTruthy()

      if (stored) {
        const data = JSON.parse(stored)
        expect(data['w-crisis-pr']).toBeDefined()
        expect(data['w-crisis-pr'].trialRemaining).toBe(3)
      }
    })
  })

  it('rehydrates user status from localStorage on mount', async () => {
    // Pre-populate localStorage
    const mockStatus = {
      'w-crisis-pr': {
        workflowId: 'w-crisis-pr',
        trialRemaining: 2,
        subscribed: false
      }
    }
    localStorage.setItem('of:marketplace:user-status:v1', JSON.stringify(mockStatus))

    // Render page
    render(<MarketplacePage />)

    // Should show continue use button with correct count
    expect(await screen.findByRole('button', { name: /继续使用 \(剩余2次\)/ })).toBeInTheDocument()
  })

  it('switches between categories without losing user status', async () => {
    render(<MarketplacePage />)

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    })

    // Start trial on customer-driven workflow
    const trialButtons = screen.getAllByRole('button', { name: /免费试用 \(3次\)/ })
    fireEvent.click(trialButtons[0])

    // Should show continue use button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续使用 \(剩余3次\)/ })).toBeInTheDocument()
    })

    // Switch to internal category
    const internalTab = screen.getByRole('tab', { name: /内部使用驱动/ })
    fireEvent.click(internalTab)

    // Wait for category change
    await waitFor(() => {
      expect(screen.getByText('会议纪要生成器')).toBeInTheDocument()
    })

    // Switch back to customer category
    const customerTab = screen.getByRole('tab', { name: /客户需求驱动/ })
    fireEvent.click(customerTab)

    // Wait for category change back
    await waitFor(() => {
      expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    })

    // Should still show continue use button
    expect(screen.getByRole('button', { name: /继续使用 \(剩余3次\)/ })).toBeInTheDocument()
  })
})
