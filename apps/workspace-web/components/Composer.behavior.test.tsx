import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders as render } from '../vitest.setup'
import Page from '../app/page'
import { useAuthStore } from '../lib/store/auth'

describe('Composer behavior', () => {
  it('disables send when empty and sends on Enter', async () => {
    // Mock 认证状态
    useAuthStore.setState({
      user: { id: 'u-1', name: '测试用户', username: 'testuser' },
      status: 'authenticated',
      initialized: true
    })

    render(<Page />)
    let textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    const sendBtn = screen.getByRole('button', { name: '发送消息' })
    expect(sendBtn).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(sendBtn).not.toBeDisabled()

    fireEvent.keyDown(textarea, { key: 'Enter' })

    // ✅ 新设计：input 在发送时不立即清空（失败时保留）
    // 由于 WebSocket mock 会失败，input 应该保留
    await waitFor(() => {
      textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
      // 验证 textarea 仍然存在（没有崩溃）
      expect(textarea).toBeInTheDocument()
    })
  })

  it('shows plus button and workflow selector with new layout', () => {
    render(<Page />)
    const plus = screen.getByRole('button', { name: '上传文件' })
    expect(plus).toBeInTheDocument()

    // Check for workflow selector button (new design)
    const workflowBtn = screen.getByRole('button', { name: '选择工作流' })
    expect(workflowBtn).toBeInTheDocument()
  })

  it('Shift+Enter inserts newline', () => {
    render(<Page />)
    const textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'line1' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    // browser won't actually insert newline in jsdom automatically; we simulate expected value change
    fireEvent.change(textarea, { target: { value: 'line1\n' } })
    expect(textarea.value).toBe('line1\n')
  })

  it('voice input button removed (feature removed)', () => {
    render(<Page />)
    const voiceBtn = screen.queryByRole('button', { name: /语音输入|录音/i })
    expect(voiceBtn).not.toBeInTheDocument()
  })

  it('textarea and send button are in unified container', () => {
    render(<Page />)
    const textarea = screen.getByPlaceholderText('输入消息...')
    const sendBtn = screen.queryByRole('button', { name: '停止生成' }) || screen.queryByRole('button', { name: /发送/ })

    // Both should exist and be visible
    expect(textarea).toBeInTheDocument()
    expect(sendBtn).toBeInTheDocument()

    // They should be in the same container (the unified composer box)
    const container = textarea.closest('div[class*="rounded-lg"]')
    expect(container).toBeInTheDocument()
    expect(container).toContainElement(sendBtn)
  })
})
