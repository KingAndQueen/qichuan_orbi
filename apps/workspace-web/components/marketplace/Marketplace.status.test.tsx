/**
 * Marketplace Page - Status Display Tests
 * 工作流市场页面 - 状态显示测试
 * 
 * Test Coverage / 测试覆盖：
 * - Never tried state (default)
 * - Trialing state (with remaining runs)
 * - Trial exhausted state
 * - Subscribed state (active)
 * - Subscription expired state
 * 
 * @see docs/quality-assurance.md
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkflowCard } from '../../components/marketplace/WorkflowCard'
import type { WorkflowTemplate, UserWorkflowStatus } from '../../lib/store/marketplace'

const MOCK_WORKFLOW: WorkflowTemplate = {
  id: 'w-test',
  name: '测试工作流',
  description: '这是一个测试工作流',
  icon: '🧪',
  category: 'customer_driven',
  features: ['功能1', '功能2', '功能3'],
  pricing: {
    trial: { enabled: true, totalRuns: 3 },
    subscription: { price: 99, period: 'month' }
  }
}

describe('Marketplace - Workflow Status Display', () => {
  it('shows trial and subscribe buttons for never-tried workflow', () => {
    const status: UserWorkflowStatus = {
      workflowId: 'w-test',
      trialRemaining: undefined,
      subscribed: false
    }

    render(
      <WorkflowCard
        workflow={MOCK_WORKFLOW}
        userStatus={status}
        onStartTrial={() => { }}
        onSubscribe={() => { }}
        onUnsubscribe={() => { }}
      />
    )

    expect(screen.getByRole('button', { name: /免费试用 \(3次\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /订阅 ¥99\/月/ })).toBeInTheDocument()
  })

  it('shows continue-use button for trialing workflow', () => {
    const status: UserWorkflowStatus = {
      workflowId: 'w-test',
      trialRemaining: 2,
      subscribed: false
    }

    render(
      <WorkflowCard
        workflow={MOCK_WORKFLOW}
        userStatus={status}
        onStartTrial={() => { }}
        onSubscribe={() => { }}
        onUnsubscribe={() => { }}
        onContinueUse={() => { }}
      />
    )

    expect(screen.getByRole('button', { name: /继续使用 \(剩余2次\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /订阅/ })).toBeInTheDocument()
  })

  it('shows trial-exhausted badge and subscribe button', () => {
    const status: UserWorkflowStatus = {
      workflowId: 'w-test',
      trialRemaining: 0,
      subscribed: false
    }

    render(
      <WorkflowCard
        workflow={MOCK_WORKFLOW}
        userStatus={status}
        onStartTrial={() => { }}
        onSubscribe={() => { }}
        onUnsubscribe={() => { }}
      />
    )

    expect(screen.getByText('试用已用完')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /立即订阅/ })).toBeInTheDocument()
  })

  it('shows subscribed badge for active subscription', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)

    const status: UserWorkflowStatus = {
      workflowId: 'w-test',
      trialRemaining: undefined,
      subscribed: true,
      subscriptionExpiresAt: futureDate.toISOString()
    }

    render(
      <WorkflowCard
        workflow={MOCK_WORKFLOW}
        userStatus={status}
        onStartTrial={() => { }}
        onSubscribe={() => { }}
        onUnsubscribe={() => { }}
      />
    )

    expect(screen.getByText('✓ 已订阅')).toBeInTheDocument()
    expect(screen.getByText(/有效期至/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /取消订阅/ })).toBeInTheDocument()
  })

  it('shows expired badge and re-subscribe button for expired subscription', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1)

    const status: UserWorkflowStatus = {
      workflowId: 'w-test',
      trialRemaining: undefined,
      subscribed: true,
      subscriptionExpiresAt: pastDate.toISOString()
    }

    render(
      <WorkflowCard
        workflow={MOCK_WORKFLOW}
        userStatus={status}
        onStartTrial={() => { }}
        onSubscribe={() => { }}
        onUnsubscribe={() => { }}
      />
    )

    expect(screen.getByText('订阅已过期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重新订阅/ })).toBeInTheDocument()
  })

  it('prioritizes subscribed state over trial state', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)

    const status: UserWorkflowStatus = {
      workflowId: 'w-test',
      trialRemaining: 2,  // Has trial remaining
      subscribed: true,   // But also subscribed
      subscriptionExpiresAt: futureDate.toISOString()
    }

    render(
      <WorkflowCard
        workflow={MOCK_WORKFLOW}
        userStatus={status}
        onStartTrial={() => { }}
        onSubscribe={() => { }}
        onUnsubscribe={() => { }}
      />
    )

    // Should show subscribed badge, not trial button
    expect(screen.getByText('✓ 已订阅')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /继续使用/ })).not.toBeInTheDocument()
  })
})
