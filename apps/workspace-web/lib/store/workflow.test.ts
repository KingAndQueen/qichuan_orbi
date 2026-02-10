/**
 * Workflow Store State Machine Tests
 * 工作流选择状态管理状态机测试
 *
 * Coverage / 测试覆盖:
 * - Workflow selection state transitions / 工作流选择状态流转
 * - Selection clearing / 清除选择状态
 * - Initial state verification / 初始状态验证
 *
 * References:
 * - docs/test/frontend-testing.md § 4.1 组件测试
 * - docs/features/prd-workspace.md § 工作流触发
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'

describe('Workflow Store State Machine', () => {
  let useWorkflowStore: typeof import('./workflow').useWorkflowStore

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Re-import to get fresh store instance
    const mod = await import('./workflow')
    useWorkflowStore = mod.useWorkflowStore
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // 1. Initial State Tests / 初始状态测试
  // ---------------------------------------------------------------------------

  describe('Initial State', () => {
    it('should have correct default options', () => {
      const state = useWorkflowStore.getState()

      expect(state.options).toHaveLength(2)
      expect(state.options[0].id).toBe('w1')
      expect(state.options[0].name).toBe('危机公关工作流（占位）')
      expect(state.options[0].enabled).toBe(true)
    })

    it('should have undefined selectedId initially', () => {
      const state = useWorkflowStore.getState()
      expect(state.selectedId).toBeUndefined()
    })

    it('should have all workflows enabled by default', () => {
      const state = useWorkflowStore.getState()
      state.options.forEach(workflow => {
        expect(workflow.enabled).toBe(true)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Selection State Machine / 选择状态机
  // ---------------------------------------------------------------------------

  describe('Selection State Machine', () => {
    it('should transition from undefined to selected', () => {
      const { setSelected } = useWorkflowStore.getState()

      // Initial state: undefined
      expect(useWorkflowStore.getState().selectedId).toBeUndefined()

      // Transition: select workflow
      act(() => {
        setSelected('w1')
      })

      // Final state: selected
      expect(useWorkflowStore.getState().selectedId).toBe('w1')
    })

    it('should transition from one selection to another', () => {
      const { setSelected } = useWorkflowStore.getState()

      // Select first workflow
      act(() => {
        setSelected('w1')
      })
      expect(useWorkflowStore.getState().selectedId).toBe('w1')

      // Select second workflow
      act(() => {
        setSelected('w2')
      })
      expect(useWorkflowStore.getState().selectedId).toBe('w2')
    })

    it('should transition from selected to undefined (clear)', () => {
      const { setSelected } = useWorkflowStore.getState()

      // Setup: select workflow
      act(() => {
        setSelected('w1')
      })
      expect(useWorkflowStore.getState().selectedId).toBe('w1')

      // Transition: clear selection
      act(() => {
        setSelected(undefined)
      })

      // Final state: undefined
      expect(useWorkflowStore.getState().selectedId).toBeUndefined()
    })

    it('should allow re-selecting the same workflow (idempotent)', () => {
      const { setSelected } = useWorkflowStore.getState()

      act(() => {
        setSelected('w1')
      })

      act(() => {
        setSelected('w1')
      })

      expect(useWorkflowStore.getState().selectedId).toBe('w1')
    })
  })

  // ---------------------------------------------------------------------------
  // 3. State Transitions with Invalid IDs / 无效 ID 状态流转
  // ---------------------------------------------------------------------------

  describe('Invalid ID Handling', () => {
    it('should accept any string ID (store does not validate)', () => {
      const { setSelected } = useWorkflowStore.getState()

      // Store accepts any ID - validation is done at UI level
      act(() => {
        setSelected('non-existent-workflow')
      })

      expect(useWorkflowStore.getState().selectedId).toBe('non-existent-workflow')
    })

    it('should handle empty string as valid selection', () => {
      const { setSelected } = useWorkflowStore.getState()

      act(() => {
        setSelected('')
      })

      expect(useWorkflowStore.getState().selectedId).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Rapid State Changes / 快速状态变化
  // ---------------------------------------------------------------------------

  describe('Rapid State Changes', () => {
    it('should handle rapid selection changes', () => {
      const { setSelected } = useWorkflowStore.getState()

      act(() => {
        setSelected('w1')
        setSelected('w2')
        setSelected('w1')
        setSelected(undefined)
        setSelected('w2')
      })

      // Final state should be the last selection
      expect(useWorkflowStore.getState().selectedId).toBe('w2')
    })

    it('should maintain consistency during concurrent-like updates', () => {
      const { setSelected } = useWorkflowStore.getState()

      // Simulate multiple rapid calls
      for (let i = 0; i < 100; i++) {
        act(() => {
          setSelected(i % 2 === 0 ? 'w1' : 'w2')
        })
      }

      // Final state should be deterministic
      expect(useWorkflowStore.getState().selectedId).toBe('w1')
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Workflow Options Verification / 工作流选项验证
  // ---------------------------------------------------------------------------

  describe('Workflow Options', () => {
    it('should have correct workflow structure', () => {
      const state = useWorkflowStore.getState()

      state.options.forEach(workflow => {
        expect(workflow).toHaveProperty('id')
        expect(workflow).toHaveProperty('name')
        expect(workflow).toHaveProperty('enabled')
        expect(typeof workflow.id).toBe('string')
        expect(typeof workflow.name).toBe('string')
        expect(typeof workflow.enabled).toBe('boolean')
      })
    })

    it('should have unique workflow IDs', () => {
      const state = useWorkflowStore.getState()
      const ids = state.options.map(w => w.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  // ---------------------------------------------------------------------------
  // 6. State Isolation / 状态隔离
  // ---------------------------------------------------------------------------

  describe('State Isolation', () => {
    it('should not affect options when changing selectedId', () => {
      const { setSelected, options: initialOptions } = useWorkflowStore.getState()

      act(() => {
        setSelected('w1')
      })

      const { options: afterOptions } = useWorkflowStore.getState()

      // Options should remain unchanged
      expect(afterOptions).toEqual(initialOptions)
      expect(afterOptions).toHaveLength(2)
    })

    it('should maintain options reference stability', () => {
      const optionsRef1 = useWorkflowStore.getState().options

      act(() => {
        useWorkflowStore.getState().setSelected('w1')
      })

      const optionsRef2 = useWorkflowStore.getState().options

      // Options array reference should be stable (not recreated)
      expect(optionsRef1).toBe(optionsRef2)
    })
  })
})


