/**
 * WorkflowCard Component - Horizontal Workflow Display Card
 * 横向工作流展示卡片组件
 * 
 * Features / 功能：
 * - Horizontal layout: icon (left) + content (center) + actions (right)
 *   横向布局：图标（左）+ 内容（中）+ 操作按钮（右）
 * - Dynamic button display based on user status (trial/subscription)
 *   根据用户状态动态显示按钮（试用/订阅）
 * - Status states: never tried, trialing, trial exhausted, subscribed, expired
 *   状态：从未试用、试用中、试用用完、已订阅、订阅过期
 * - macOS-style card with hover effect
 *   macOS风格卡片带悬停效果
 * 
 * Compliance / 符合规范：
 * - docs/frontend-interaction-guidelines.md § 0. 全局交互要求（悬停状态）
 * - docs/product-spec.md § OF-FEAT-003 工作流市场
 * 
 * @see docs/frontend-interaction-guidelines.md
 * @see docs/product-spec.md
 */

'use client'
import React from 'react'
import type { WorkflowTemplate, UserWorkflowStatus } from '../../lib/store/marketplace'

interface WorkflowCardProps {
  workflow: WorkflowTemplate
  userStatus: UserWorkflowStatus
  onStartTrial: (workflowId: string) => void
  onSubscribe: (workflowId: string) => void
  onUnsubscribe: (workflowId: string) => void
  onContinueUse?: (workflowId: string) => void
}

export function WorkflowCard({ 
  workflow, 
  userStatus, 
  onStartTrial, 
  onSubscribe,
  onUnsubscribe,
  onContinueUse 
}: WorkflowCardProps) {
  // Determine display state / 确定显示状态
  const isSubscribed = userStatus.subscribed
  const isSubscriptionExpired = isSubscribed && userStatus.subscriptionExpiresAt 
    ? new Date(userStatus.subscriptionExpiresAt) < new Date() 
    : false
  const trialRemaining = userStatus.trialRemaining
  const hasStartedTrial = trialRemaining !== undefined
  const trialExhausted = hasStartedTrial && trialRemaining === 0

  // Button logic / 按钮逻辑
  let primaryButton: React.ReactNode = null
  let secondaryButton: React.ReactNode = null
  let statusBadge: React.ReactNode = null

  if (isSubscribed && !isSubscriptionExpired) {
    // State: Subscribed (active) / 状态：已订阅（有效）
    statusBadge = (
      <div className="text-xs px-2 py-1 rounded" style={{ background: '#dcfce7', color: '#16a34a' }}>
        ✓ 已订阅
      </div>
    )
    const expiresDate = userStatus.subscriptionExpiresAt 
      ? new Date(userStatus.subscriptionExpiresAt).toLocaleDateString('zh-CN')
      : ''
    primaryButton = (
      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        有效期至 {expiresDate}
      </div>
    )
    secondaryButton = (
      <button
        type="button"
        className="px-4 py-2 rounded-md text-sm transition-all"
        style={{
          background: 'transparent',
          color: 'var(--color-error)',
          border: '1px solid var(--color-error)',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-error-bg)'
          e.currentTarget.style.borderColor = 'var(--color-error)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'var(--color-error)'
        }}
        onClick={() => onUnsubscribe(workflow.id)}
      >
        取消订阅
      </button>
    )
  } else if (isSubscriptionExpired) {
    // State: Subscription expired / 状态：订阅已过期
    statusBadge = (
      <div className="text-xs px-2 py-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>
        订阅已过期
      </div>
    )
    primaryButton = (
      <button
        type="button"
        className="px-4 py-2 rounded-md text-sm font-medium transition-all"
        style={{
          background: 'var(--color-primary)',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--color-hover-shadow)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
        onClick={() => onSubscribe(workflow.id)}
      >
        重新订阅
      </button>
    )
  } else if (hasStartedTrial && !trialExhausted) {
    // State: Trialing (has remaining runs) / 状态：试用中（有剩余次数）
    primaryButton = (
      <button
        type="button"
        className="px-4 py-2 rounded-md text-sm font-medium transition-all"
        style={{
          background: 'var(--color-primary-bg)',
          color: 'var(--color-primary)',
          border: 'none',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--color-hover-shadow-inset)'
          e.currentTarget.style.transform = 'translateY(1px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
        onClick={() => onContinueUse?.(workflow.id)}
      >
        继续使用 (剩余{trialRemaining}次)
      </button>
    )
    secondaryButton = (
      <button
        type="button"
        className="px-4 py-2 rounded-md text-sm transition-all"
        style={{
          background: 'transparent',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-hover-bg)'
          e.currentTarget.style.borderColor = 'var(--color-hover-border)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'var(--color-border)'
        }}
        onClick={() => onSubscribe(workflow.id)}
      >
        订阅 ¥{workflow.pricing.subscription.price}/{workflow.pricing.subscription.period === 'month' ? '月' : '年'}
      </button>
    )
  } else if (trialExhausted) {
    // State: Trial exhausted / 状态：试用已用完
    statusBadge = (
      <div className="text-xs px-2 py-1 rounded" style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-text-secondary)' }}>
        试用已用完
      </div>
    )
    primaryButton = (
      <button
        type="button"
        className="px-4 py-2 rounded-md text-sm font-medium transition-all"
        style={{
          background: 'var(--color-primary)',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--color-hover-shadow)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
        onClick={() => onSubscribe(workflow.id)}
      >
        立即订阅
      </button>
    )
  } else {
    // State: Never tried / 状态：从未试用
    if (workflow.pricing.trial.enabled) {
      primaryButton = (
        <button
          type="button"
          className="px-4 py-2 rounded-md text-sm font-medium transition-all"
          style={{
            background: 'var(--color-primary-bg)',
            color: 'var(--color-primary)',
            border: 'none',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--color-hover-shadow-inset)'
            e.currentTarget.style.transform = 'translateY(1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
          onClick={() => onStartTrial(workflow.id)}
        >
          免费试用 ({workflow.pricing.trial.totalRuns}次)
        </button>
      )
    }
    secondaryButton = (
      <button
        type="button"
        className="px-4 py-2 rounded-md text-sm transition-all"
        style={{
          background: 'transparent',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-hover-bg)'
          e.currentTarget.style.borderColor = 'var(--color-hover-border)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'var(--color-border)'
        }}
        onClick={() => onSubscribe(workflow.id)}
      >
        订阅 ¥{workflow.pricing.subscription.price}/{workflow.pricing.subscription.period === 'month' ? '月' : '年'}
      </button>
    )
  }

  return (
    <div
      className="rounded-lg border p-6 transition-all"
      style={{
        background: 'var(--color-bg-container)',
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--shadow-card)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--color-hover-shadow)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div className="flex items-start gap-6">
        {/* Left: Icon / 左侧：图标 */}
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-lg"
          style={{
            width: 64,
            height: 64,
            background: 'var(--color-fill-secondary)',
            fontSize: 32
          }}
          aria-hidden
        >
          {workflow.icon}
        </div>

        {/* Center: Content / 中间：内容 */}
        <div className="flex-grow min-w-0">
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
            {workflow.name}
          </h3>
          <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            {workflow.description}
          </p>
          <ul className="space-y-1">
            {workflow.features.map((feature, idx) => (
              <li key={idx} className="text-sm flex items-start gap-2" style={{ color: 'var(--color-text)' }}>
                <span className="text-xs" style={{ color: 'var(--color-primary)' }} aria-hidden>•</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: Actions / 右侧：操作 */}
        <div className="flex-shrink-0 flex flex-col items-end gap-2 min-w-[160px]">
          {statusBadge}
          {primaryButton}
          {secondaryButton}
        </div>
      </div>
    </div>
  )
}
