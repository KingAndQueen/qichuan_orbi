/**
 * Composer Unified Layout Test
 * 测试新的统一输入框布局
 * 
 * Test coverage / 测试覆盖：
 * - Unified container with border (visual grouping)
 * - Textarea at top (full width)
 * - Bottom control bar: [+] [Workflow▼] ... [Send/Stop]
 * - Workflow dropdown menu (popup upward, select/cancel)
 * - Send/Stop button dynamic switch
 * - File upload (no separate image upload)
 * - No voice input button
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Composer, type ComposerHandle } from './Composer'
import React from 'react'

// Mock stores
vi.mock('../lib/store/conversation', () => ({
  useConversationStore: vi.fn(() => ({
    activeId: 'c1',
    workflowSelectedIdByConvId: {},
    setWorkflowForActive: vi.fn(),
  }))
}))

vi.mock('../lib/store/workflow', () => ({
  useWorkflowStore: vi.fn(() => ({
    options: [
      { id: 'w1', name: '危机公关', enabled: true },
      { id: 'w2', name: '创意策划', enabled: true },
      { id: 'w3', name: '数据分析报告生成器', enabled: true },
    ]
  }))
}))

describe('Composer - Unified Layout', () => {
  it('renders unified container with border and shadow', () => {
    const { container } = render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )
    const composerContainer = container.firstChild as HTMLElement
    expect(composerContainer).toHaveClass('rounded-lg', 'border', 'p-4')
    expect(composerContainer).toHaveStyle({ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' })
  })

  it('renders textarea at top with full width', () => {
    render(
      <Composer
        value="test input"
        onChange={() => { }}
        onSend={() => { }}
      />
    )
    const textarea = screen.getByPlaceholderText('输入消息...')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveClass('w-full')
    expect(textarea).toHaveValue('test input')
  })

  it('renders bottom control bar with correct layout: [+] [Workflow] ... [Send]', () => {
    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    const plusBtn = screen.getByLabelText('上传文件')
    const workflowBtn = screen.getByLabelText('选择工作流')
    const sendBtn = screen.getByLabelText('发送消息')

    expect(plusBtn).toBeInTheDocument()
    expect(workflowBtn).toBeInTheDocument()
    expect(sendBtn).toBeInTheDocument()

    // Check order by comparing DOM positions
    const allButtons = screen.getAllByRole('button')
    const plusIndex = allButtons.indexOf(plusBtn as HTMLButtonElement)
    const workflowIndex = allButtons.indexOf(workflowBtn as HTMLButtonElement)
    const sendIndex = allButtons.indexOf(sendBtn as HTMLButtonElement)
    if (plusIndex !== -1 && workflowIndex !== -1 && sendIndex !== -1) {
      expect(plusIndex).toBeLessThan(workflowIndex)
      expect(workflowIndex).toBeLessThan(sendIndex)
    }
  })

  it('does NOT render voice input button (removed feature)', () => {
    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    const voiceBtn = screen.queryByLabelText(/语音输入|录音/i)
    expect(voiceBtn).not.toBeInTheDocument()
  })

  it('plus button directly triggers file input (no menu)', () => {
    const { container } = render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    const plusBtn = screen.getByLabelText('上传文件')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null

    expect(fileInput).toBeInTheDocument()
    expect(fileInput).toHaveAttribute('accept', '.pdf,.docx,.txt,.md,.csv,.jpg,.jpeg,.png,.gif,.webp')

    const clickSpy = vi.fn()
    if (fileInput) {
      (fileInput as any).click = clickSpy
    }

    fireEvent.click(plusBtn)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('workflow button opens dropdown menu upward', async () => {
    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    const workflowBtn = screen.getByLabelText('选择工作流')
    expect(workflowBtn).toHaveTextContent('选择工作流')

    fireEvent.click(workflowBtn)

    const menu = await screen.findByRole('menu', { name: '工作流列表' })
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveClass('absolute', 'bottom-full')
    expect(menu.parentElement).toHaveClass('relative')
  })

  it('workflow dropdown shows "不使用工作流" and user workflows', async () => {
    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    fireEvent.click(screen.getByLabelText('选择工作流'))

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /不使用工作流/ })).toBeInTheDocument()
    })
    expect(screen.getByRole('menuitem', { name: '危机公关' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '创意策划' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '数据分析报告生成器' })).toBeInTheDocument()
  })

  it('selecting a workflow updates button text and closes menu', async () => {
    const mockSetWorkflow = vi.fn()
    const { useConversationStore } = await import('../lib/store/conversation')
    vi.mocked(useConversationStore).mockReturnValue({
      activeId: 'c1',
      workflowSelectedIdByConvId: {},
      setWorkflowForActive: mockSetWorkflow,
    } as any)

    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    fireEvent.click(screen.getByLabelText('选择工作流'))
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: '危机公关' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('menuitem', { name: '危机公关' }))

    expect(mockSetWorkflow).toHaveBeenCalledWith('w1')

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('truncates long workflow name: min 5 chars, ellipsis after 10', async () => {
    // Re-mock stores for this specific test
    const { useConversationStore } = await import('../lib/store/conversation')
    const { useWorkflowStore } = await import('../lib/store/workflow')

    vi.mocked(useConversationStore).mockReturnValueOnce({
      activeId: 'c1',
      workflowSelectedIdByConvId: { c1: 'w3' },
      setWorkflowForActive: vi.fn(),
    } as any)

    vi.mocked(useWorkflowStore).mockReturnValueOnce({
      options: [
        { id: 'w3', name: '数据分析报告生成器长名称测试', enabled: true },
      ]
    } as any)

    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    const workflowBtn = screen.getByLabelText('选择工作流')
    const btnText = workflowBtn.textContent || ''
    // Should be truncated to max 10 chars + ... (excluding the ▼ symbol)
    expect(btnText).toContain('数据分析报告生成器长')
    expect(btnText).toContain('...')
    expect(btnText).toContain('▼')
    expect(workflowBtn).toHaveAttribute('title', '数据分析报告生成器长名称测试')
  })

  it('send button is disabled when input is empty and no files', () => {
    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    const sendBtn = screen.getByLabelText('发送消息')
    expect(sendBtn).toBeDisabled()
  })

  it('send button is enabled when input has text', () => {
    render(
      <Composer
        value="hello"
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    const sendBtn = screen.getByLabelText('发送消息')
    expect(sendBtn).not.toBeDisabled()
  })

  it('send button switches to stop button when streaming', () => {
    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
        streaming={true}
        onCancel={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('发送消息')).not.toBeInTheDocument()
    const stopBtn = screen.getByLabelText('停止生成')
    expect(stopBtn).toBeInTheDocument()
    expect(stopBtn).toHaveTextContent('■')  // ChatGPT-style icon
    expect(stopBtn).toHaveStyle({ background: 'var(--color-send-button-enabled)' })  // Theme-aware color
  })

  it('stop button triggers onCancel callback', () => {
    const mockCancel = vi.fn()
    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
        streaming={true}
        onCancel={mockCancel}
      />
    )

    fireEvent.click(screen.getByLabelText('停止生成'))
    expect(mockCancel).toHaveBeenCalled()
  })

  it('Enter key sends message (not Shift+Enter)', () => {
    const mockSend = vi.fn()
    render(
      <Composer
        value="test"
        onChange={() => { }}
        onSend={mockSend}
      />
    )

    const textarea = screen.getByPlaceholderText('输入消息...')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(mockSend).toHaveBeenCalled()
  })

  it('workflow menu closes on Escape key', async () => {
    render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    fireEvent.click(screen.getByLabelText('选择工作流'))
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('exposes focus method via ref', () => {
    const ref = React.createRef<ComposerHandle>()
    render(
      <Composer
        ref={ref}
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    expect(ref.current).not.toBeNull()
    expect(ref.current?.focus).toBeInstanceOf(Function)

    const textarea = screen.getByPlaceholderText('输入消息...')
    ref.current?.focus()
    expect(textarea).toHaveFocus()
  })

  it('supports drag and drop for files', async () => {
    const { container } = render(
      <Composer
        value=""
        onChange={() => { }}
        onSend={() => { }}
      />
    )

    const composerContainer = container.firstChild as HTMLElement
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })

    // Use fireEvent.drop instead of creating DragEvent manually (jsdom limitation)
    fireEvent.drop(composerContainer, {
      dataTransfer: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(screen.getByTitle('test.pdf')).toBeInTheDocument()
    })
  })
})
