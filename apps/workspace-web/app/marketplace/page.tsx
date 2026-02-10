/**
 * Marketplace Page - Workflow Marketplace
 * 工作流市场页面
 * 
 * Features / 功能：
 * - Three-category workflow browsing (customer, internal, strategic)
 *   三分类工作流浏览（客户、内部、战略）
 * - Horizontal workflow cards with full details
 *   横向工作流卡片，展示完整信息
 * - Trial and subscription management (Mock)
 *   试用和订阅管理（Mock阶段）
 * - LocalStorage persistence for user status
 *   用户状态本地持久化
 * 
 * Compliance / 符合规范：
 * - docs/product-spec.md § OF-FEAT-003 工作流市场
 * - docs/frontend-interaction-guidelines.md § 全局交互要求
 * - docs/iteration-plan.md § Mock-first 策略
 * 
 * @see docs/product-spec.md
 * @see docs/frontend-interaction-guidelines.md
 */

'use client'
import React, { useEffect } from 'react'
import { useMarketplaceStore } from '../../lib/store/marketplace'
import { CategoryTabs } from '../../components/marketplace/CategoryTabs'
import { WorkflowCard } from '../../components/marketplace/WorkflowCard'

export default function MarketplacePage() {
  const {
    activeCategory,
    setActiveCategory,
    getFilteredWorkflows,
    getWorkflowStatus,
    startTrial,
    subscribe,
    unsubscribe,
    rehydrate,
    hydrated
  } = useMarketplaceStore()

  // Rehydrate from localStorage on mount
  useEffect(() => {
    rehydrate()
  }, [rehydrate])

  const filteredWorkflows = getFilteredWorkflows()

  const handleStartTrial = (workflowId: string) => {
    startTrial(workflowId)
    // Mock: Show success message
    if (typeof window !== 'undefined') {
      alert('✓ 试用已开通！您可以在主工作空间使用该工作流。')
    }
  }

  const handleSubscribe = (workflowId: string) => {
    // Mock: Confirm subscription
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('确认订阅该工作流？（Mock阶段：将自动设置为已订阅状态）')
      if (confirmed) {
        subscribe(workflowId)
        alert('✓ 订阅成功！')
      }
    }
  }

  const handleUnsubscribe = (workflowId: string) => {
    // Mock: Confirm unsubscribe
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('确认取消订阅该工作流？取消后将无法继续使用，但已有的试用次数（如有）将保留。')
      if (confirmed) {
        unsubscribe(workflowId)
        alert('✓ 已取消订阅')
      }
    }
  }

  const handleContinueUse = (_workflowId: string) => {
    // Mock: Navigate to main workspace with workflow selected
    if (typeof window !== 'undefined') {
      alert('即将跳转到主工作空间并选中该工作流（Mock阶段：功能占位）')
      // TODO: Navigate to main page with workflowId parameter
      // window.location.href = `/?workflow=${workflowId}`
    }
  }

  if (!hydrated) {
    // Prevent hydration mismatch
    return null
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--color-bg-layout)' }}>
      {/* Header / 页面头部 */}
      <header className="sticky top-0 z-10 border-b" style={{ background: 'var(--color-bg-container)', borderColor: 'var(--color-border)' }}>
        <div className="container-centered px-6 py-4">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
            >
              <span aria-hidden>←</span>
              <span>返回</span>
            </a>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
              工作流市场
            </h1>
          </div>
        </div>

        {/* Category Tabs / 分类Tab */}
        <div className="container-centered px-6">
          <CategoryTabs
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </div>
      </header>

      {/* Main Content / 主内容区 */}
      <main className="flex-1 overflow-auto">
        <div className="container-centered px-6 py-6">
          <div
            id={`panel-${activeCategory}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeCategory}`}
            className="space-y-4"
          >
            {filteredWorkflows.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
                暂无工作流
              </div>
            ) : (
              filteredWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  userStatus={getWorkflowStatus(workflow.id)}
                  onStartTrial={handleStartTrial}
                  onSubscribe={handleSubscribe}
                  onUnsubscribe={handleUnsubscribe}
                  onContinueUse={handleContinueUse}
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
