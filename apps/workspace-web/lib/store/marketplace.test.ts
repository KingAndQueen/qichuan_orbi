/**
 * Marketplace Store State Machine Tests
 * 工作流市场状态管理状态机测试
 *
 * Coverage / 测试覆盖:
 * - Async data loading and state synchronization / 异步数据加载后的状态同步
 * - State transition side effects (localStorage persistence) / 状态切换时的副作用校验
 * - Category filtering logic / 分类筛选逻辑
 * - Trial and subscription state transitions / 试用和订阅状态流转
 * - Rehydration from localStorage / 从本地存储重新加载状态
 *
 * References:
 * - docs/test/frontend-testing.md § 4.1 组件测试
 * - docs/features/prd-marketplace.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get _store() { return store }
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('Marketplace Store State Machine', () => {
  let useMarketplaceStore: typeof import('./marketplace').useMarketplaceStore

  beforeEach(async () => {
    vi.resetModules()
    localStorageMock.clear()
    vi.clearAllMocks()

    // Re-import to get fresh store instance
    const mod = await import('./marketplace')
    useMarketplaceStore = mod.useMarketplaceStore
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
  })

  // ---------------------------------------------------------------------------
  // 1. Initial State Tests / 初始状态测试
  // ---------------------------------------------------------------------------

  describe('Initial State', () => {
    it('should have correct default state', () => {
      const state = useMarketplaceStore.getState()

      expect(state.workflows).toHaveLength(6)
      expect(state.activeCategory).toBe('customer_driven')
      expect(state.hydrated).toBe(false)
      expect(Object.keys(state.userStatus)).toHaveLength(6)
    })

    it('should initialize all workflows with default user status', () => {
      const state = useMarketplaceStore.getState()

      Object.values(state.userStatus).forEach(status => {
        expect(status.subscribed).toBe(false)
        expect(status.trialRemaining).toBeUndefined()
        expect(status.subscriptionExpiresAt).toBeUndefined()
      })
    })

    it('should have workflows matching their categories', () => {
      const state = useMarketplaceStore.getState()

      const customerDriven = state.workflows.filter(w => w.category === 'customer_driven')
      const internalDriven = state.workflows.filter(w => w.category === 'internal_driven')
      const strategicDriven = state.workflows.filter(w => w.category === 'strategic_driven')

      expect(customerDriven.length).toBeGreaterThanOrEqual(1)
      expect(internalDriven.length).toBeGreaterThanOrEqual(1)
      expect(strategicDriven.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Category Filtering State Transitions / 分类筛选状态流转
  // ---------------------------------------------------------------------------

  describe('Category Filtering State Machine', () => {
    it('should transition to customer_driven category', () => {
      const { setActiveCategory, getFilteredWorkflows } = useMarketplaceStore.getState()

      act(() => {
        setActiveCategory('customer_driven')
      })

      const state = useMarketplaceStore.getState()
      expect(state.activeCategory).toBe('customer_driven')

      const filtered = getFilteredWorkflows()
      filtered.forEach(w => {
        expect(w.category).toBe('customer_driven')
      })
    })

    it('should transition to internal_driven category', () => {
      const { setActiveCategory, getFilteredWorkflows } = useMarketplaceStore.getState()

      act(() => {
        setActiveCategory('internal_driven')
      })

      const state = useMarketplaceStore.getState()
      expect(state.activeCategory).toBe('internal_driven')

      const filtered = getFilteredWorkflows()
      filtered.forEach(w => {
        expect(w.category).toBe('internal_driven')
      })
    })

    it('should transition to strategic_driven category', () => {
      const { setActiveCategory, getFilteredWorkflows } = useMarketplaceStore.getState()

      act(() => {
        setActiveCategory('strategic_driven')
      })

      const state = useMarketplaceStore.getState()
      expect(state.activeCategory).toBe('strategic_driven')

      const filtered = getFilteredWorkflows()
      filtered.forEach(w => {
        expect(w.category).toBe('strategic_driven')
      })
    })

    it('should allow multiple category transitions', () => {
      const { setActiveCategory } = useMarketplaceStore.getState()

      // Start -> customer_driven -> internal_driven -> strategic_driven -> customer_driven
      const transitions = ['customer_driven', 'internal_driven', 'strategic_driven', 'customer_driven'] as const

      transitions.forEach(category => {
        act(() => {
          setActiveCategory(category)
        })
        expect(useMarketplaceStore.getState().activeCategory).toBe(category)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Trial State Machine / 试用状态机
  // ---------------------------------------------------------------------------

  describe('Trial State Machine', () => {
    it('should transition from not_started to trial_active when starting trial', () => {
      const workflowId = 'w-crisis-pr'
      const { startTrial, getWorkflowStatus, workflows } = useMarketplaceStore.getState()

      // Initial state: trial not started
      let status = getWorkflowStatus(workflowId)
      expect(status.trialRemaining).toBeUndefined()

      // Transition: start trial
      act(() => {
        startTrial(workflowId)
      })

      // Final state: trial active
      status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      const workflow = workflows.find(w => w.id === workflowId)!
      expect(status.trialRemaining).toBe(workflow.pricing.trial.totalRuns)
    })

    it('should not start trial for workflow with trial disabled', () => {
      // Modify a workflow to have trial disabled
      const workflowId = 'w-crisis-pr'
      useMarketplaceStore.setState(state => ({
        workflows: state.workflows.map(w =>
          w.id === workflowId
            ? { ...w, pricing: { ...w.pricing, trial: { enabled: false, totalRuns: 0 } } }
            : w
        )
      }))

      const { startTrial, getWorkflowStatus } = useMarketplaceStore.getState()

      act(() => {
        startTrial(workflowId)
      })

      const status = getWorkflowStatus(workflowId)
      expect(status.trialRemaining).toBeUndefined()
    })

    it('should persist trial state to localStorage', () => {
      const workflowId = 'w-crisis-pr'
      const { startTrial } = useMarketplaceStore.getState()

      act(() => {
        startTrial(workflowId)
      })

      expect(localStorageMock.setItem).toHaveBeenCalled()
      const savedData = JSON.parse(localStorageMock._store['of:marketplace:user-status:v1'] || '{}')
      expect(savedData[workflowId]?.trialRemaining).toBe(3)
    })

    it('should handle starting trial for non-existent workflow gracefully', () => {
      const { startTrial, getWorkflowStatus } = useMarketplaceStore.getState()

      expect(() => {
        act(() => {
          startTrial('non-existent-workflow')
        })
      }).not.toThrow()

      const status = getWorkflowStatus('non-existent-workflow')
      expect(status.subscribed).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Subscription State Machine / 订阅状态机
  // ---------------------------------------------------------------------------

  describe('Subscription State Machine', () => {
    it('should transition from unsubscribed to subscribed', () => {
      const workflowId = 'w-crisis-pr'
      const { subscribe, getWorkflowStatus } = useMarketplaceStore.getState()

      // Initial state: not subscribed
      let status = getWorkflowStatus(workflowId)
      expect(status.subscribed).toBe(false)

      // Transition: subscribe
      act(() => {
        subscribe(workflowId)
      })

      // Final state: subscribed
      status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(status.subscribed).toBe(true)
      expect(status.subscriptionExpiresAt).toBeDefined()
    })

    it('should set subscription expiry to 30 days from now', () => {
      const workflowId = 'w-crisis-pr'
      const { subscribe, getWorkflowStatus } = useMarketplaceStore.getState()

      const beforeSubscribe = new Date()

      act(() => {
        subscribe(workflowId)
      })

      const status = getWorkflowStatus(workflowId)
      const expiresAt = new Date(status.subscriptionExpiresAt!)

      // Should be approximately 30 days in the future
      const daysDiff = (expiresAt.getTime() - beforeSubscribe.getTime()) / (1000 * 60 * 60 * 24)
      expect(daysDiff).toBeGreaterThanOrEqual(29)
      expect(daysDiff).toBeLessThanOrEqual(31)
    })

    it('should transition from subscribed to unsubscribed', () => {
      const workflowId = 'w-crisis-pr'
      const { subscribe, unsubscribe, getWorkflowStatus } = useMarketplaceStore.getState()

      // Setup: subscribe first
      act(() => {
        subscribe(workflowId)
      })

      expect(useMarketplaceStore.getState().getWorkflowStatus(workflowId).subscribed).toBe(true)

      // Transition: unsubscribe
      act(() => {
        unsubscribe(workflowId)
      })

      // Final state: unsubscribed
      const status = getWorkflowStatus(workflowId)
      expect(status.subscribed).toBe(false)
      expect(status.subscriptionExpiresAt).toBeUndefined()
    })

    it('should preserve trial status when unsubscribing', () => {
      const workflowId = 'w-crisis-pr'
      const { startTrial, subscribe, unsubscribe, getWorkflowStatus } = useMarketplaceStore.getState()

      // Setup: start trial and subscribe
      act(() => {
        startTrial(workflowId)
        subscribe(workflowId)
      })

      const trialRemaining = useMarketplaceStore.getState().getWorkflowStatus(workflowId).trialRemaining

      // Unsubscribe
      act(() => {
        unsubscribe(workflowId)
      })

      // Trial status should be preserved
      const status = getWorkflowStatus(workflowId)
      expect(status.subscribed).toBe(false)
      expect(status.trialRemaining).toBe(trialRemaining)
    })

    it('should persist subscription state to localStorage', () => {
      const workflowId = 'w-crisis-pr'
      const { subscribe } = useMarketplaceStore.getState()

      act(() => {
        subscribe(workflowId)
      })

      expect(localStorageMock.setItem).toHaveBeenCalled()
      const savedData = JSON.parse(localStorageMock._store['of:marketplace:user-status:v1'] || '{}')
      expect(savedData[workflowId]?.subscribed).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Rehydration State Machine / 状态重建状态机
  // ---------------------------------------------------------------------------

  describe('Rehydration State Machine', () => {
    it('should rehydrate from localStorage on first call', async () => {
      // Pre-populate localStorage with persisted state
      const persistedData = {
        'w-crisis-pr': {
          workflowId: 'w-crisis-pr',
          trialRemaining: 2,
          subscribed: true,
          subscriptionExpiresAt: '2026-03-01T00:00:00.000Z'
        }
      }
      localStorageMock._store['of:marketplace:user-status:v1'] = JSON.stringify(persistedData)

      // Reset and reimport store
      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      expect(freshStore.getState().hydrated).toBe(false)

      // Rehydrate
      act(() => {
        freshStore.getState().rehydrate()
      })

      const state = freshStore.getState()
      expect(state.hydrated).toBe(true)
      expect(state.userStatus['w-crisis-pr'].trialRemaining).toBe(2)
      expect(state.userStatus['w-crisis-pr'].subscribed).toBe(true)
    })

    it('should not rehydrate twice', async () => {
      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      // First rehydrate
      act(() => {
        freshStore.getState().rehydrate()
      })

      expect(freshStore.getState().hydrated).toBe(true)

      // Modify state
      act(() => {
        freshStore.getState().startTrial('w-crisis-pr')
      })

      const trialRemaining = freshStore.getState().userStatus['w-crisis-pr'].trialRemaining

      // Try to rehydrate again - should be no-op
      act(() => {
        freshStore.getState().rehydrate()
      })

      // State should remain unchanged
      expect(freshStore.getState().userStatus['w-crisis-pr'].trialRemaining).toBe(trialRemaining)
    })

    it('should merge persisted data with defaults for new workflows', async () => {
      // Simulate old persisted data (missing some workflows)
      const persistedData = {
        'w-crisis-pr': {
          workflowId: 'w-crisis-pr',
          trialRemaining: 1,
          subscribed: false
        }
      }
      localStorageMock._store['of:marketplace:user-status:v1'] = JSON.stringify(persistedData)

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      act(() => {
        freshStore.getState().rehydrate()
      })

      const state = freshStore.getState()

      // Persisted workflow should have persisted data
      expect(state.userStatus['w-crisis-pr'].trialRemaining).toBe(1)

      // Other workflows should have default data
      expect(state.userStatus['w-meeting-summary']).toBeDefined()
      expect(state.userStatus['w-meeting-summary'].subscribed).toBe(false)
    })

    it('should handle corrupted localStorage gracefully', async () => {
      // Corrupt localStorage
      localStorageMock._store['of:marketplace:user-status:v1'] = 'not-valid-json{'

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      expect(() => {
        act(() => {
          freshStore.getState().rehydrate()
        })
      }).not.toThrow()

      expect(freshStore.getState().hydrated).toBe(true)
    })

    it('should handle missing localStorage gracefully', async () => {
      // Ensure localStorage is empty
      localStorageMock.clear()

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      act(() => {
        freshStore.getState().rehydrate()
      })

      expect(freshStore.getState().hydrated).toBe(true)
      // All workflows should have default status
      Object.values(freshStore.getState().userStatus).forEach(status => {
        expect(status.subscribed).toBe(false)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Side Effects Verification / 副作用校验
  // ---------------------------------------------------------------------------

  describe('Side Effects Verification', () => {
    it('should call localStorage.setItem on startTrial', () => {
      const { startTrial } = useMarketplaceStore.getState()

      act(() => {
        startTrial('w-crisis-pr')
      })

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'of:marketplace:user-status:v1',
        expect.any(String)
      )
    })

    it('should call localStorage.setItem on subscribe', () => {
      const { subscribe } = useMarketplaceStore.getState()

      act(() => {
        subscribe('w-crisis-pr')
      })

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'of:marketplace:user-status:v1',
        expect.any(String)
      )
    })

    it('should call localStorage.setItem on unsubscribe', () => {
      const { subscribe, unsubscribe } = useMarketplaceStore.getState()

      act(() => {
        subscribe('w-crisis-pr')
      })

      vi.clearAllMocks()

      act(() => {
        unsubscribe('w-crisis-pr')
      })

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'of:marketplace:user-status:v1',
        expect.any(String)
      )
    })

    it('should not throw when localStorage is unavailable', async () => {
      // Simulate localStorage failure
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      const { startTrial } = useMarketplaceStore.getState()

      expect(() => {
        act(() => {
          startTrial('w-crisis-pr')
        })
      }).not.toThrow()

      // State should still be updated
      expect(useMarketplaceStore.getState().userStatus['w-crisis-pr'].trialRemaining).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Complex State Transitions / 复杂状态流转
  // ---------------------------------------------------------------------------

  describe('Complex State Transitions', () => {
    it('should handle full user lifecycle: trial -> subscribe -> unsubscribe', () => {
      const workflowId = 'w-crisis-pr'
      const store = useMarketplaceStore.getState()

      // Phase 1: Start trial
      act(() => {
        store.startTrial(workflowId)
      })

      let status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(status.trialRemaining).toBe(3)
      expect(status.subscribed).toBe(false)

      // Phase 2: Subscribe (convert from trial)
      act(() => {
        useMarketplaceStore.getState().subscribe(workflowId)
      })

      status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(status.subscribed).toBe(true)
      expect(status.trialRemaining).toBe(3) // Trial status preserved

      // Phase 3: Unsubscribe
      act(() => {
        useMarketplaceStore.getState().unsubscribe(workflowId)
      })

      status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(status.subscribed).toBe(false)
      expect(status.trialRemaining).toBe(3) // Trial status still preserved
    })

    it('should handle multiple workflows independently', () => {
      const workflow1 = 'w-crisis-pr'
      const workflow2 = 'w-meeting-summary'
      const store = useMarketplaceStore.getState()

      // Subscribe to workflow1, trial workflow2
      act(() => {
        store.subscribe(workflow1)
        store.startTrial(workflow2)
      })

      const status1 = useMarketplaceStore.getState().getWorkflowStatus(workflow1)
      const status2 = useMarketplaceStore.getState().getWorkflowStatus(workflow2)

      expect(status1.subscribed).toBe(true)
      expect(status1.trialRemaining).toBeUndefined()

      expect(status2.subscribed).toBe(false)
      expect(status2.trialRemaining).toBe(3)
    })

    it('should maintain state consistency during rapid transitions', () => {
      const workflowId = 'w-crisis-pr'
      const store = useMarketplaceStore.getState()

      // Rapid fire multiple actions
      act(() => {
        store.startTrial(workflowId)
        store.subscribe(workflowId)
        store.unsubscribe(workflowId)
        store.subscribe(workflowId)
      })

      const status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)

      // Final state should be subscribed
      expect(status.subscribed).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // 8. getWorkflowStatus Edge Cases / getWorkflowStatus 边界情况
  // ---------------------------------------------------------------------------

  describe('getWorkflowStatus Edge Cases', () => {
    it('should return default status for unknown workflow', () => {
      const { getWorkflowStatus } = useMarketplaceStore.getState()

      const status = getWorkflowStatus('unknown-workflow-id')

      expect(status.workflowId).toBe('unknown-workflow-id')
      expect(status.subscribed).toBe(false)
      expect(status.trialRemaining).toBeUndefined()
    })

    it('should return existing status for known workflow', () => {
      const workflowId = 'w-crisis-pr'
      const { startTrial, getWorkflowStatus } = useMarketplaceStore.getState()

      act(() => {
        startTrial(workflowId)
      })

      const status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(status.trialRemaining).toBe(3)
    })
  })
})
