"use client"
import React, { useState } from 'react'

export type StepStatus = 'pending' | 'running' | 'waiting_for_tool' | 'succeeded' | 'failed'

export type StepStatusItem = {
  stepId?: string
  stepName: string
  status: StepStatus
  progress?: number
  meta?: Record<string, unknown>
}

export type TaskItem = {
  runId: string
  steps: StepStatusItem[]
}

/**
 * TaskProgressMonitorPanel - Gemini-style collapsible task progress panel
 * 任务进度监控面板 - Gemini风格的可折叠任务进度面板
 * 
 * Features:
 * - Default collapsed state (only shows summary)
 * - Click to expand/collapse
 * - Shows all step details when expanded
 * - Status indicators: ⏳ running, ✓ succeeded, ❌ failed, ⏱️ pending
 */
/** TaskProgressMonitorPanel component./TaskProgressMonitorPanel 组件。 */
export function TaskProgressMonitorPanel({ tasks, defaultCollapsed = true }: { tasks: TaskItem[]; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  
  if (!tasks || tasks.length === 0) return null

  // Determine overall status from all steps./根据所有步骤判定整体状态。
  const allSteps = tasks.flatMap(t => t.steps || [])
  // Check: do we have at least one running/pending task (currently unused)
  const _hasRunning = allSteps.some(s => s.status === 'running' || s.status === 'waiting_for_tool')
  const hasFailed = allSteps.some(s => s.status === 'failed')
  const allSucceeded = allSteps.length > 0 && allSteps.every(s => s.status === 'succeeded')
  
  const overallStatus = hasFailed ? 'failed' : allSucceeded ? 'completed' : 'running'
  const statusText = overallStatus === 'failed' ? '执行失败' : overallStatus === 'completed' ? '已完成' : '正在处理...'

  /** Convert a step status to an icon./将步骤状态转换为图标。 */
  function statusIcon(status?: StepStatusItem['status']): string {
    switch (status) {
      case 'succeeded':
        return '✓'
      case 'failed':
        return '❌'
      case 'running':
      case 'waiting_for_tool':
        return '⏳'
      default:
        return '⏱️'
    }
  }

  /** Convert a step status to a color value./将步骤状态转换为颜色值。 */
  function statusColor(status?: StepStatusItem['status']): string {
    switch (status) {
      case 'succeeded':
        return '#10b981'
      case 'failed':
        return '#ef4444'
      case 'running':
      case 'waiting_for_tool':
        return 'var(--color-primary)'
      default:
        return 'var(--color-text-secondary)'
    }
  }

  return (
    <div 
      aria-label="任务进度" 
      className="rounded-lg border mb-3"
      style={{ 
        borderColor: 'var(--color-border)', 
        background: 'var(--color-bg-container)',
        overflow: 'hidden'
      }}
    >
      {/* Collapsible header - always visible./可折叠标题始终可见。 */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--color-hover-bg)] transition-colors text-left"
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开任务详情' : '折叠任务详情'}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {statusText}
          </span>
        </div>
        <span 
          className="text-sm transition-transform"
          style={{ 
            color: 'var(--color-text-secondary)',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)'
          }}
        >
          ▼
        </span>
      </button>

      {/* Expanded content - step details./展开内容展示步骤详情。 */}
      {!collapsed && (
        <div 
          className="px-3 pb-2 pt-1 border-t space-y-2"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {tasks.map((t) => (
            <div key={t.runId}>
              {(t.steps || []).map((step, idx) => (
                <div 
                  key={`${t.runId}-${idx}`} 
                  className="flex items-center gap-2 py-1"
                >
                  <span style={{ color: statusColor(step.status) }}>
                    {statusIcon(step.status)}
                  </span>
                  <span 
                    className="text-xs flex-1"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {step.stepName}
                  </span>
                  {typeof step.progress === 'number' && (
                    <span 
                      className="text-xs"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {Math.round(step.progress)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
