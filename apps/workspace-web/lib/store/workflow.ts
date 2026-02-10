import { createWithEqualityFn } from 'zustand/traditional'

export interface Workflow { id: string; name: string; enabled: boolean }

interface WorkflowState {
  options: Workflow[]
  selectedId?: string
  setSelected: (id?: string) => void
}

export const useWorkflowStore = createWithEqualityFn<WorkflowState>((set) => ({
  options: [
    { id: 'w1', name: '危机公关工作流（占位）', enabled: true },
    { id: 'w2', name: '创意策划工作流（占位）', enabled: true },
  ],
  selectedId: undefined,
  setSelected: (id?: string) => set({ selectedId: id })
}))
