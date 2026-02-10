/**
 * Marketplace Store - Workflow Marketplace State Management
 * 工作流市场状态管理
 * 
 * Features / 功能：
 * - Mock workflow templates and user subscription status
 *   模拟工作流模板和用户订阅状态
 * - Category filtering (customer_driven, internal_driven, strategic_driven)
 *   分类筛选（客户需求驱动、内部使用驱动、战略规划驱动）
 * - Trial and subscription status tracking
 *   试用和订阅状态追踪
 * - LocalStorage persistence for user status
 *   用户状态的本地持久化
 * 
 * Compliance / 符合规范：
 * - docs/product-spec.md § OF-FEAT-003 工作流市场
 * - docs/fullstack-architecture.md § 模块2: 工作流市场
 * 
 * @see docs/product-spec.md
 * @see docs/fullstack-architecture.md
 */

import { createWithEqualityFn } from 'zustand/traditional'

// Types / 类型定义

export type WorkflowCategory = 'customer_driven' | 'internal_driven' | 'strategic_driven'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string  // emoji or icon identifier
  category: WorkflowCategory
  features: string[]  // 3-5 key features
  pricing: {
    trial: {
      enabled: boolean
      totalRuns: number  // total trial runs available
    }
    subscription: {
      price: number
      period: 'month' | 'year'
    }
  }
}

export interface UserWorkflowStatus {
  workflowId: string
  trialRemaining?: number        // undefined = not started trial; 0 = exhausted
  subscribed: boolean
  subscriptionExpiresAt?: string // ISO date string; undefined if not subscribed or perpetual
}

interface MarketplaceState {
  // Data
  workflows: WorkflowTemplate[]
  userStatus: Record<string, UserWorkflowStatus>  // keyed by workflowId

  // UI state
  activeCategory: WorkflowCategory
  hydrated: boolean
  
  // Actions
  setActiveCategory: (category: WorkflowCategory) => void
  startTrial: (workflowId: string) => void
  subscribe: (workflowId: string) => void
  unsubscribe: (workflowId: string) => void
  getWorkflowStatus: (workflowId: string) => UserWorkflowStatus
  getFilteredWorkflows: () => WorkflowTemplate[]
  rehydrate: () => void
}

// Mock Data / 模拟数据

const MOCK_WORKFLOWS: WorkflowTemplate[] = [
  // Customer-driven / 客户需求驱动
  {
    id: 'w-crisis-pr',
    name: '危机公关助手',
    description: '快速响应和处理企业危机事件，帮助企业在危机中保持品牌形象和公众信任',
    icon: '🚨',
    category: 'customer_driven',
    features: [
      '24小时内生成应对方案',
      '多渠道舆情监控与分析',
      '模板化回应策略库',
      '实时危机等级评估'
    ],
    pricing: {
      trial: { enabled: true, totalRuns: 3 },
      subscription: { price: 99, period: 'month' }
    }
  },
  {
    id: 'w-customer-service',
    name: '客户服务优化',
    description: '提升客户服务质量，自动生成客户问题解决方案和服务话术',
    icon: '💬',
    category: 'customer_driven',
    features: [
      '智能问题分类与路由',
      '自动生成回复建议',
      '客户满意度预测',
      '服务质量评估报告'
    ],
    pricing: {
      trial: { enabled: true, totalRuns: 3 },
      subscription: { price: 79, period: 'month' }
    }
  },
  
  // Internal-driven / 内部使用驱动
  {
    id: 'w-meeting-summary',
    name: '会议纪要生成器',
    description: '自动整理会议记录，生成结构化纪要和待办事项清单',
    icon: '📝',
    category: 'internal_driven',
    features: [
      '音频/视频会议自动转写',
      '智能提取关键决策点',
      '生成待办事项清单',
      '多格式导出（PDF/Word/Markdown）'
    ],
    pricing: {
      trial: { enabled: true, totalRuns: 3 },
      subscription: { price: 59, period: 'month' }
    }
  },
  {
    id: 'w-report-writer',
    name: '周报月报助手',
    description: '快速生成工作总结报告，节省写作时间，提升汇报质量',
    icon: '📊',
    category: 'internal_driven',
    features: [
      '自动提取工作亮点',
      '数据可视化图表生成',
      '多模板选择（技术/市场/管理）',
      '智能润色与建议'
    ],
    pricing: {
      trial: { enabled: true, totalRuns: 3 },
      subscription: { price: 49, period: 'month' }
    }
  },
  
  // Strategic-driven / 战略规划驱动
  {
    id: 'w-market-analysis',
    name: '市场分析助手',
    description: '深度分析市场趋势，生成竞争对手分析和市场洞察报告',
    icon: '📈',
    category: 'strategic_driven',
    features: [
      '行业趋势预测与分析',
      '竞品对比与定位分析',
      'SWOT分析自动生成',
      '市场机会识别与建议'
    ],
    pricing: {
      trial: { enabled: true, totalRuns: 3 },
      subscription: { price: 149, period: 'month' }
    }
  },
  {
    id: 'w-strategic-planning',
    name: '战略规划顾问',
    description: '辅助制定企业战略规划，提供框架、模板和专业建议',
    icon: '🎯',
    category: 'strategic_driven',
    features: [
      'OKR目标制定辅助',
      '战略地图自动生成',
      '风险评估与应对策略',
      '资源分配优化建议'
    ],
    pricing: {
      trial: { enabled: true, totalRuns: 3 },
      subscription: { price: 199, period: 'month' }
    }
  }
]

// Persistence / 持久化

const STORAGE_KEY = 'of:marketplace:user-status:v1'

function loadUserStatus(): Record<string, UserWorkflowStatus> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, UserWorkflowStatus>
    if (typeof data !== 'object' || data === null) return {}
    return data
  } catch {
    return {}
  }
}

function saveUserStatus(status: Record<string, UserWorkflowStatus>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status))
  } catch {
    // ignore persistence failure
  }
}

// Store / 状态管理

export const useMarketplaceStore = createWithEqualityFn<MarketplaceState>((set, get) => {
  // Initialize default user status for all workflows
  const defaultUserStatus: Record<string, UserWorkflowStatus> = {}
  MOCK_WORKFLOWS.forEach(w => {
    defaultUserStatus[w.id] = {
      workflowId: w.id,
      trialRemaining: undefined,
      subscribed: false
    }
  })

  return {
    workflows: MOCK_WORKFLOWS,
    userStatus: defaultUserStatus,
    activeCategory: 'customer_driven',
    hydrated: false,

    setActiveCategory: (category) => set({ activeCategory: category }),

    startTrial: (workflowId) => {
      const workflow = get().workflows.find(w => w.id === workflowId)
      if (!workflow || !workflow.pricing.trial.enabled) return

      const newStatus = { ...get().userStatus }
      newStatus[workflowId] = {
        ...newStatus[workflowId],
        trialRemaining: workflow.pricing.trial.totalRuns
      }
      set({ userStatus: newStatus })
      saveUserStatus(newStatus)
    },

    subscribe: (workflowId) => {
      const newStatus = { ...get().userStatus }
      // Mock subscription: set to 30 days from now
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)
      
      newStatus[workflowId] = {
        ...newStatus[workflowId],
        subscribed: true,
        subscriptionExpiresAt: expiresAt.toISOString()
      }
      set({ userStatus: newStatus })
      saveUserStatus(newStatus)
    },

    unsubscribe: (workflowId) => {
      const newStatus = { ...get().userStatus }
      // Remove subscription but keep trial status if exists
      newStatus[workflowId] = {
        ...newStatus[workflowId],
        subscribed: false,
        subscriptionExpiresAt: undefined
      }
      set({ userStatus: newStatus })
      saveUserStatus(newStatus)
    },

    getWorkflowStatus: (workflowId) => {
      const status = get().userStatus[workflowId]
      if (!status) {
        return {
          workflowId,
          trialRemaining: undefined,
          subscribed: false
        }
      }
      return status
    },

    getFilteredWorkflows: () => {
      const { workflows, activeCategory } = get()
      return workflows.filter(w => w.category === activeCategory)
    },

    rehydrate: () => {
      if (get().hydrated) return
      const persisted = loadUserStatus()
      if (Object.keys(persisted).length > 0) {
        // Merge persisted status with defaults (in case new workflows were added)
        const merged = { ...get().userStatus, ...persisted }
        set({ userStatus: merged, hydrated: true })
        return
      }
      set({ hydrated: true })
    }
  }
})
