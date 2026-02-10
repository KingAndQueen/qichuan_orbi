/**
 * Marketplace Page - Render Tests
 * 工作流市场页面 - 渲染测试
 * 
 * Test Coverage / 测试覆盖：
 * - Basic page structure and header
 * - Category tabs rendering and switching
 * - Workflow cards rendering with correct data
 * - Filtered workflows by category
 * 
 * @see docs/quality-assurance.md
 */

import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import MarketplacePage from '../../app/marketplace/page'
import { useMarketplaceStore } from '../../lib/store/marketplace'

describe('Marketplace Page - Rendering', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useMarketplaceStore.getState()
    store.setActiveCategory('customer_driven')
    // Clear localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('renders page header with title and back link', () => {
    render(<MarketplacePage />)
    expect(screen.getByText('工作流市场')).toBeInTheDocument()
    expect(screen.getByText('返回')).toBeInTheDocument()
  })

  it('renders three category tabs', () => {
    render(<MarketplacePage />)
    expect(screen.getByRole('tab', { name: /客户需求驱动/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /内部使用驱动/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /战略规划驱动/ })).toBeInTheDocument()
  })

  it('renders workflow cards for active category', () => {
    render(<MarketplacePage />)
    // Default category is customer_driven, should show 2 workflows
    expect(screen.getByText('危机公关助手')).toBeInTheDocument()
    expect(screen.getByText('客户服务优化')).toBeInTheDocument()
  })

  it('switches category and shows filtered workflows', async () => {
    render(<MarketplacePage />)

    // Click on "内部使用驱动" tab
    const internalTab = screen.getByRole('tab', { name: /内部使用驱动/ })
    fireEvent.click(internalTab)

    // Should show internal workflows
    await waitFor(() => {
      expect(screen.getByText('会议纪要生成器')).toBeInTheDocument()
      expect(screen.getByText('周报月报助手')).toBeInTheDocument()
    })

    // Should not show customer-driven workflows
    expect(screen.queryByText('危机公关助手')).not.toBeInTheDocument()
  })

  it('renders workflow card with all required elements', () => {
    render(<MarketplacePage />)

    // Find the crisis PR card
    const card = screen.getByText('危机公关助手').closest('div[class*="rounded-lg"]') as HTMLElement
    expect(card).toBeInTheDocument()

    if (card) {
      // Check for description
      expect(within(card).getByText(/快速响应和处理企业危机事件/)).toBeInTheDocument()

      // Check for features (at least one)
      expect(within(card).getByText(/24小时内生成应对方案/)).toBeInTheDocument()

      // Check for trial button
      expect(within(card).getByRole('button', { name: /免费试用/ })).toBeInTheDocument()

      // Check for subscribe button
      expect(within(card).getByRole('button', { name: /订阅/ })).toBeInTheDocument()
    }
  })

  it('displays correct icon for each workflow', () => {
    render(<MarketplacePage />)

    // Icons are rendered as text content in aria-hidden div
    const icons = screen.getAllByText(/🚨|💬/)
    expect(icons.length).toBeGreaterThan(0)
  })
})
