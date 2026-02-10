/**
 * CategoryTabs Component - Workflow Category Navigation
 * 工作流分类导航组件
 * 
 * Features / 功能：
 * - Three fixed categories: customer_driven, internal_driven, strategic_driven
 *   三个固定分类：客户需求驱动、内部使用驱动、战略规划驱动
 * - Active tab with underline indicator
 *   激活Tab带有下划线指示器
 * - Keyboard navigation support
 *   键盘导航支持
 * 
 * Compliance / 符合规范：
 * - docs/frontend-interaction-guidelines.md § 0. 全局交互要求（悬停状态）
 * - docs/contributing.md § 注释与工程规范
 * 
 * @see docs/frontend-interaction-guidelines.md
 */

'use client'
import React from 'react'
import type { WorkflowCategory } from '../../lib/store/marketplace'

interface CategoryTabsProps {
  activeCategory: WorkflowCategory
  onCategoryChange: (category: WorkflowCategory) => void
}

const CATEGORIES: Array<{ id: WorkflowCategory; label: string }> = [
  { id: 'customer_driven', label: '客户需求驱动' },
  { id: 'internal_driven', label: '内部使用驱动' },
  { id: 'strategic_driven', label: '战略规划驱动' }
]

export function CategoryTabs({ activeCategory, onCategoryChange }: CategoryTabsProps) {
  return (
    <div role="tablist" aria-label="工作流分类" className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
      {CATEGORIES.map((cat) => {
        const isActive = cat.id === activeCategory
        return (
          <button
            key={cat.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${cat.id}`}
            type="button"
            className="relative px-4 py-3 text-sm font-medium transition-colors"
            style={{
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              background: 'transparent',
              border: 'none'
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--color-text)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--color-text-secondary)'
              }
            }}
            onClick={() => onCategoryChange(cat.id)}
          >
            {cat.label}
            {/* Active indicator underline / 激活指示器下划线 */}
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: 'var(--color-primary)' }}
                aria-hidden
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
