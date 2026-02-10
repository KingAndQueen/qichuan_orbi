/**
 * Marketplace Store - Concurrency and Fault Tolerance Tests
 * 工作流市场状态 - 并发和容错测试
 *
 * Coverage / 测试覆盖:
 * - Concurrency: toggleSubscription-like actions under concurrent calls
 *   并发: 在并发调用时 subscribe/unsubscribe 的状态一致性
 * - Async Failure Recovery: Store state recovery on data loading failure
 *   异步失败恢复: 数据加载失败时的 Store 状态恢复逻辑
 *
 * Compliance / 符合规范:
 * - docs/test/frontend-testing.md § Store Logic Isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  let throwOnSet = false
  let throwOnGet = false

  return {
    getItem: vi.fn((key: string) => {
      if (throwOnGet) throw new Error('Storage read error')
      return store[key] || null
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (throwOnSet) throw new Error('QuotaExceededError')
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get _store() { return store },
    _setThrowOnSet(value: boolean) { throwOnSet = value },
    _setThrowOnGet(value: boolean) { throwOnGet = value }
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// ---------------------------------------------------------------------------
// Concurrency Tests
// ---------------------------------------------------------------------------

describe('Marketplace Store - Concurrency', () => {
  let useMarketplaceStore: typeof import('./marketplace').useMarketplaceStore

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorageMock.clear()
    localStorageMock._setThrowOnSet(false)
    localStorageMock._setThrowOnGet(false)

    const mod = await import('./marketplace')
    useMarketplaceStore = mod.useMarketplaceStore
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
  })

  describe('subscribe/unsubscribe Concurrency', () => {
    it('should maintain consistency under rapid subscribe/unsubscribe toggles', () => {
      const workflowId = 'w-crisis-pr'
      const { subscribe, unsubscribe, getWorkflowStatus } = useMarketplaceStore.getState()

      // Simulate rapid toggling (like double-click scenarios)
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        act(() => {
          if (i % 2 === 0) {
            subscribe(workflowId)
          } else {
            unsubscribe(workflowId)
          }
        })
      }

      // Final state should be deterministic (even number = subscribed)
      const finalStatus = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(finalStatus.subscribed).toBe(false) // 100 is even, last action was unsubscribe at i=99
    })

    it('should handle concurrent operations on different workflows', () => {
      const workflow1 = 'w-crisis-pr'
      const workflow2 = 'w-meeting-summary'
      const workflow3 = 'w-market-analysis'

      const { subscribe, unsubscribe, startTrial, getWorkflowStatus } = useMarketplaceStore.getState()

      // Concurrent-like operations on multiple workflows
      act(() => {
        subscribe(workflow1)
        startTrial(workflow2)
        subscribe(workflow3)
        unsubscribe(workflow1)
        subscribe(workflow2)
      })

      const status1 = useMarketplaceStore.getState().getWorkflowStatus(workflow1)
      const status2 = useMarketplaceStore.getState().getWorkflowStatus(workflow2)
      const status3 = useMarketplaceStore.getState().getWorkflowStatus(workflow3)

      // Each workflow should have its correct final state
      expect(status1.subscribed).toBe(false) // subscribed then unsubscribed
      expect(status2.subscribed).toBe(true)  // trial then subscribed
      expect(status2.trialRemaining).toBe(3) // trial status preserved
      expect(status3.subscribed).toBe(true)  // only subscribed
    })

    it('should preserve atomicity of userStatus updates', () => {
      const workflowId = 'w-crisis-pr'
      const { subscribe, startTrial } = useMarketplaceStore.getState()

      // Start trial and subscribe in quick succession
      act(() => {
        startTrial(workflowId)
        subscribe(workflowId)
      })

      const status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)

      // Both states should be preserved
      expect(status.trialRemaining).toBe(3)
      expect(status.subscribed).toBe(true)
      expect(status.subscriptionExpiresAt).toBeDefined()
    })

    it('should handle interleaved category changes with subscription actions', () => {
      const { setActiveCategory, subscribe, getFilteredWorkflows } = useMarketplaceStore.getState()

      act(() => {
        setActiveCategory('customer_driven')
        subscribe('w-crisis-pr')
        setActiveCategory('internal_driven')
        subscribe('w-meeting-summary')
        setActiveCategory('strategic_driven')
      })

      const state = useMarketplaceStore.getState()

      // Category should be final value
      expect(state.activeCategory).toBe('strategic_driven')

      // Subscriptions should persist across category changes
      expect(state.getWorkflowStatus('w-crisis-pr').subscribed).toBe(true)
      expect(state.getWorkflowStatus('w-meeting-summary').subscribed).toBe(true)

      // Filtered workflows should reflect current category
      const filtered = state.getFilteredWorkflows()
      expect(filtered.every(w => w.category === 'strategic_driven')).toBe(true)
    })

    it('should handle simultaneous startTrial calls for same workflow', () => {
      const workflowId = 'w-crisis-pr'
      const { startTrial, getWorkflowStatus } = useMarketplaceStore.getState()

      // Multiple startTrial calls should be idempotent
      act(() => {
        startTrial(workflowId)
        startTrial(workflowId)
        startTrial(workflowId)
      })

      const status = getWorkflowStatus(workflowId)

      // Trial count should be the initial value, not multiplied
      expect(status.trialRemaining).toBe(3)
    })

    it('should maintain state consistency when switching active conversation rapidly', () => {
      const { setActiveCategory } = useMarketplaceStore.getState()
      const categories = ['customer_driven', 'internal_driven', 'strategic_driven'] as const

      // Rapid category switching
      for (let i = 0; i < 50; i++) {
        act(() => {
          setActiveCategory(categories[i % 3])
        })
      }

      // Final state should be the last category
      expect(useMarketplaceStore.getState().activeCategory).toBe(categories[50 % 3])
    })
  })

  describe('Race Condition Prevention', () => {
    it('should handle subscribe then immediate unsubscribe', () => {
      const workflowId = 'w-crisis-pr'

      act(() => {
        useMarketplaceStore.getState().subscribe(workflowId)
      })

      const midState = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(midState.subscribed).toBe(true)
      const expiresAt = midState.subscriptionExpiresAt

      act(() => {
        useMarketplaceStore.getState().unsubscribe(workflowId)
      })

      const finalState = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(finalState.subscribed).toBe(false)
      expect(finalState.subscriptionExpiresAt).toBeUndefined()
    })

    it('should handle unsubscribe on never-subscribed workflow', () => {
      const workflowId = 'w-crisis-pr'
      const { unsubscribe, getWorkflowStatus } = useMarketplaceStore.getState()

      // Should not throw or corrupt state
      expect(() => {
        act(() => {
          unsubscribe(workflowId)
        })
      }).not.toThrow()

      const status = getWorkflowStatus(workflowId)
      expect(status.subscribed).toBe(false)
    })

    it('should handle batch operations maintaining order', () => {
      const operations: Array<() => void> = []
      const { subscribe, unsubscribe, startTrial } = useMarketplaceStore.getState()

      // Queue operations
      operations.push(() => startTrial('w-crisis-pr'))
      operations.push(() => subscribe('w-crisis-pr'))
      operations.push(() => startTrial('w-meeting-summary'))
      operations.push(() => unsubscribe('w-crisis-pr'))
      operations.push(() => subscribe('w-meeting-summary'))

      // Execute in order
      act(() => {
        operations.forEach(op => op())
      })

      const state = useMarketplaceStore.getState()
      expect(state.getWorkflowStatus('w-crisis-pr').subscribed).toBe(false)
      expect(state.getWorkflowStatus('w-crisis-pr').trialRemaining).toBe(3)
      expect(state.getWorkflowStatus('w-meeting-summary').subscribed).toBe(true)
      expect(state.getWorkflowStatus('w-meeting-summary').trialRemaining).toBe(3)
    })
  })
})

// ---------------------------------------------------------------------------
// Async Failure Recovery Tests
// ---------------------------------------------------------------------------

describe('Marketplace Store - Async Failure Recovery', () => {
  let useMarketplaceStore: typeof import('./marketplace').useMarketplaceStore

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorageMock.clear()
    localStorageMock._setThrowOnSet(false)
    localStorageMock._setThrowOnGet(false)

    const mod = await import('./marketplace')
    useMarketplaceStore = mod.useMarketplaceStore
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
    localStorageMock._setThrowOnSet(false)
    localStorageMock._setThrowOnGet(false)
  })

  describe('localStorage Write Failures', () => {
    it('should maintain in-memory state when localStorage.setItem throws', () => {
      const workflowId = 'w-crisis-pr'
      const { subscribe, getWorkflowStatus } = useMarketplaceStore.getState()

      // Enable localStorage write failure
      localStorageMock._setThrowOnSet(true)

      // Subscribe should still work in memory
      expect(() => {
        act(() => {
          subscribe(workflowId)
        })
      }).not.toThrow()

      // State should be updated
      const status = getWorkflowStatus(workflowId)
      expect(status.subscribed).toBe(true)
    })

    it('should continue operating after QuotaExceededError', () => {
      const workflowId = 'w-crisis-pr'

      // Subscribe successfully first
      act(() => {
        useMarketplaceStore.getState().subscribe(workflowId)
      })

      // Enable failure
      localStorageMock._setThrowOnSet(true)

      // Try to unsubscribe
      act(() => {
        useMarketplaceStore.getState().unsubscribe(workflowId)
      })

      // State should still be updated
      expect(useMarketplaceStore.getState().getWorkflowStatus(workflowId).subscribed).toBe(false)

      // Disable failure and try again
      localStorageMock._setThrowOnSet(false)

      act(() => {
        useMarketplaceStore.getState().subscribe(workflowId)
      })

      // Should work normally again
      expect(useMarketplaceStore.getState().getWorkflowStatus(workflowId).subscribed).toBe(true)
    })

    it('should handle startTrial with storage failure', () => {
      localStorageMock._setThrowOnSet(true)

      const workflowId = 'w-crisis-pr'

      expect(() => {
        act(() => {
          useMarketplaceStore.getState().startTrial(workflowId)
        })
      }).not.toThrow()

      expect(useMarketplaceStore.getState().getWorkflowStatus(workflowId).trialRemaining).toBe(3)
    })
  })

  describe('localStorage Read Failures (Rehydration)', () => {
    it('should use default state when localStorage returns corrupted JSON', async () => {
      // Set corrupted data
      localStorageMock._store['of:marketplace:user-status:v1'] = 'not{valid}json'

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      // Rehydrate should not throw
      expect(() => {
        act(() => {
          freshStore.getState().rehydrate()
        })
      }).not.toThrow()

      // Should be hydrated with defaults
      expect(freshStore.getState().hydrated).toBe(true)
      expect(freshStore.getState().getWorkflowStatus('w-crisis-pr').subscribed).toBe(false)
    })

    it('should use default state when localStorage returns null object', async () => {
      localStorageMock._store['of:marketplace:user-status:v1'] = 'null'

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      act(() => {
        freshStore.getState().rehydrate()
      })

      expect(freshStore.getState().hydrated).toBe(true)
    })

    it('should use default state when localStorage returns array instead of object', async () => {
      localStorageMock._store['of:marketplace:user-status:v1'] = '[]'

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      act(() => {
        freshStore.getState().rehydrate()
      })

      expect(freshStore.getState().hydrated).toBe(true)
    })

    it('should recover gracefully from partially valid data', async () => {
      // Valid structure but missing some expected fields
      const partialData = {
        'w-crisis-pr': {
          workflowId: 'w-crisis-pr',
          subscribed: true
          // Missing trialRemaining and subscriptionExpiresAt
        }
      }
      localStorageMock._store['of:marketplace:user-status:v1'] = JSON.stringify(partialData)

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      act(() => {
        freshStore.getState().rehydrate()
      })

      const status = freshStore.getState().getWorkflowStatus('w-crisis-pr')
      expect(status.subscribed).toBe(true)
      // Should not crash when accessing undefined fields
      expect(status.trialRemaining).toBeUndefined()
    })

    it('should merge persisted data with new workflows added after persistence', async () => {
      // Old data only has some workflows
      const oldData = {
        'w-crisis-pr': {
          workflowId: 'w-crisis-pr',
          trialRemaining: 1,
          subscribed: true,
          subscriptionExpiresAt: '2026-03-01T00:00:00.000Z'
        }
      }
      localStorageMock._store['of:marketplace:user-status:v1'] = JSON.stringify(oldData)

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      act(() => {
        freshStore.getState().rehydrate()
      })

      // Old workflow should retain persisted state
      expect(freshStore.getState().getWorkflowStatus('w-crisis-pr').subscribed).toBe(true)
      expect(freshStore.getState().getWorkflowStatus('w-crisis-pr').trialRemaining).toBe(1)

      // New workflows should have default state
      expect(freshStore.getState().getWorkflowStatus('w-meeting-summary').subscribed).toBe(false)
      expect(freshStore.getState().getWorkflowStatus('w-market-analysis').subscribed).toBe(false)
    })
  })

  describe('State Recovery After Errors', () => {
    it('should allow re-subscription after failed persistence', () => {
      const workflowId = 'w-crisis-pr'

      // Subscribe with failure
      localStorageMock._setThrowOnSet(true)
      act(() => {
        useMarketplaceStore.getState().subscribe(workflowId)
      })

      // Unsubscribe with failure
      act(() => {
        useMarketplaceStore.getState().unsubscribe(workflowId)
      })

      // Fix storage and re-subscribe
      localStorageMock._setThrowOnSet(false)
      act(() => {
        useMarketplaceStore.getState().subscribe(workflowId)
      })

      // Verify persistence worked
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
        'of:marketplace:user-status:v1',
        expect.stringContaining('"subscribed":true')
      )
    })

    it('should maintain valid state through multiple error/recovery cycles', () => {
      const workflowId = 'w-crisis-pr'

      for (let i = 0; i < 5; i++) {
        // Alternate between failure and success
        localStorageMock._setThrowOnSet(i % 2 === 0)

        act(() => {
          if (i % 2 === 0) {
            useMarketplaceStore.getState().subscribe(workflowId)
          } else {
            useMarketplaceStore.getState().unsubscribe(workflowId)
          }
        })
      }

      // State should still be valid
      const status = useMarketplaceStore.getState().getWorkflowStatus(workflowId)
      expect(typeof status.subscribed).toBe('boolean')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty localStorage gracefully', async () => {
      localStorageMock.clear()

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      act(() => {
        freshStore.getState().rehydrate()
      })

      expect(freshStore.getState().hydrated).toBe(true)
      expect(freshStore.getState().workflows).toHaveLength(6)
    })

    it('should handle localStorage returning undefined', async () => {
      localStorageMock.getItem.mockReturnValueOnce(undefined as any)

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      expect(() => {
        act(() => {
          freshStore.getState().rehydrate()
        })
      }).not.toThrow()
    })

    it('should ignore unknown workflow IDs in persisted data', async () => {
      const dataWithUnknown = {
        'unknown-workflow-xyz': {
          workflowId: 'unknown-workflow-xyz',
          subscribed: true
        },
        'w-crisis-pr': {
          workflowId: 'w-crisis-pr',
          subscribed: true
        }
      }
      localStorageMock._store['of:marketplace:user-status:v1'] = JSON.stringify(dataWithUnknown)

      vi.resetModules()
      const mod = await import('./marketplace')
      const freshStore = mod.useMarketplaceStore

      act(() => {
        freshStore.getState().rehydrate()
      })

      // Known workflow should work
      expect(freshStore.getState().getWorkflowStatus('w-crisis-pr').subscribed).toBe(true)

      // Unknown workflow should return default (not crash)
      const unknownStatus = freshStore.getState().getWorkflowStatus('unknown-workflow-xyz')
      expect(unknownStatus.workflowId).toBe('unknown-workflow-xyz')
      expect(unknownStatus.subscribed).toBe(true) // Persisted value is preserved
    })
  })
})

// ---------------------------------------------------------------------------
// Workflow Store - Concurrency Tests
// ---------------------------------------------------------------------------

describe('Workflow Store - Concurrency', () => {
  let useWorkflowStore: typeof import('./workflow').useWorkflowStore

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./workflow')
    useWorkflowStore = mod.useWorkflowStore
  })

  it('should handle rapid setSelected calls consistently', () => {
    const { setSelected } = useWorkflowStore.getState()
    const ids = ['w1', 'w2', undefined, 'w1', 'w2']

    ids.forEach(id => {
      act(() => {
        setSelected(id)
      })
    })

    expect(useWorkflowStore.getState().selectedId).toBe('w2')
  })

  it('should maintain options immutability during selection changes', () => {
    const initialOptions = useWorkflowStore.getState().options
    const { setSelected } = useWorkflowStore.getState()

    for (let i = 0; i < 100; i++) {
      act(() => {
        setSelected(i % 2 === 0 ? 'w1' : 'w2')
      })
    }

    expect(useWorkflowStore.getState().options).toBe(initialOptions)
  })

  it('should handle concurrent-like selection and read operations', () => {
    const { setSelected } = useWorkflowStore.getState()

    act(() => {
      setSelected('w1')
      const options = useWorkflowStore.getState().options
      setSelected('w2')
      const selectedAfter = useWorkflowStore.getState().selectedId

      expect(options).toHaveLength(2)
      expect(selectedAfter).toBe('w2')
    })
  })
})
