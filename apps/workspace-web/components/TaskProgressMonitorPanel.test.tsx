import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import { TaskProgressMonitorPanel } from './TaskProgressMonitorPanel'

// @feature OF-FEAT-009

describe('TaskProgressMonitorPanel [OF-FEAT-009] - Gemini-style collapsible', () => {
  it('renders tasks with collapsible interface', () => {
    render(
      <TaskProgressMonitorPanel
        tasks={[{ runId: 'r1', steps: [{ stepName: 'Step A', status: 'running', progress: 70 }] }]}
      />
    )
    expect(screen.getByLabelText('任务进度')).toBeInTheDocument()

    // Should show header with status text
    expect(screen.getByText('正在处理...')).toBeInTheDocument()

    // Should have expand/collapse button
    const toggleButton = screen.getByRole('button', { expanded: false })
    expect(toggleButton).toBeInTheDocument()
  })

  it('defaults to collapsed state', () => {
    render(
      <TaskProgressMonitorPanel
        tasks={[{ runId: 'r1', steps: [{ stepName: 'Step A', status: 'running' }] }]}
        defaultCollapsed={true}
      />
    )

    // Button should indicate collapsed state
    const toggleButton = screen.getByRole('button', { expanded: false })
    expect(toggleButton).toBeInTheDocument()

    // Step details should not be visible when collapsed
    expect(screen.queryByText('Step A')).not.toBeInTheDocument()
  })

  it('can be expanded to show step details', () => {
    render(
      <TaskProgressMonitorPanel
        tasks={[{ runId: 'r1', steps: [{ stepName: 'Step A', status: 'running', progress: 70 }] }]}
        defaultCollapsed={true}
      />
    )

    // Initially collapsed - step details hidden
    expect(screen.queryByText('Step A')).not.toBeInTheDocument()

    // Click to expand
    const toggleButton = screen.getByRole('button')
    fireEvent.click(toggleButton)

    // Now step details should be visible
    expect(screen.getByText('Step A')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
  })

  it('shows "已完成" when all steps succeed', () => {
    render(
      <TaskProgressMonitorPanel
        tasks={[{
          runId: 'r1',
          steps: [
            { stepName: 'Step A', status: 'succeeded' },
            { stepName: 'Step B', status: 'succeeded' }
          ]
        }]}
      />
    )

    expect(screen.getByText('已完成')).toBeInTheDocument()
  })

  it('shows "执行失败" when any step fails', () => {
    render(
      <TaskProgressMonitorPanel
        tasks={[{
          runId: 'r1',
          steps: [
            { stepName: 'Step A', status: 'succeeded' },
            { stepName: 'Step B', status: 'failed' }
          ]
        }]}
      />
    )

    expect(screen.getByText('执行失败')).toBeInTheDocument()
  })

  it('displays correct status icons for each step when expanded', () => {
    render(
      <TaskProgressMonitorPanel
        tasks={[{
          runId: 'r1',
          steps: [
            { stepName: 'Done', status: 'succeeded' },
            { stepName: 'Running', status: 'running' },
            { stepName: 'Pending', status: 'pending' }
          ]
        }]}
        defaultCollapsed={false}
      />
    )

    // All steps should be visible when not collapsed
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
