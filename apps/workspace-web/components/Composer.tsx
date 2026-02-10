/**
 * Composer Component - Unified Input Area for User Messages
 * 输入区域组件 - 统一的用户消息输入区
 * 
 * Features / 功能：
 * - Unified container with border (visual grouping)
 *   统一的带边框容器（视觉分组）
 * - File preview strip at top (when files present)
 *   文件预览区在顶部（有文件时显示）
 * - Full-width textarea in middle
 *   全宽文本输入框在中间
 * - Bottom control bar: [+] [Workflow▼] ... [Send/Stop]
 *   底部控制栏：[+] [工作流▼] ... [发送/停止]
 * - Workflow dropdown menu (popup upward)
 *   工作流下拉菜单（向上弹出）
 * - Send button dynamically switches to Stop button during streaming
 *   发送按钮在流式返回时动态切换为停止按钮
 * 
 * Compliance / 符合规范：
 * - frontend-interaction-guidelines.md § 1.4 输入区域 (Composer / Input Bar)
 * - interaction-protocol.md § 3.1 user_message (file upload & workflow selection)
 * 
 * @see docs/frontend-interaction-guidelines.md
 * @see docs/interaction-protocol.md
 */
"use client"
import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { useConversationStore } from '../lib/store/conversation'
import { useWorkflowStore } from '../lib/store/workflow'

export type ComposerHandle = { focus: () => void }

export const Composer = forwardRef<ComposerHandle, {
  value: string
  onChange: (_value: string) => void
  onSend: () => void
  disabled?: boolean
  streaming?: boolean
  onCancel?: () => void
}>(({ value, onChange, onSend, disabled, streaming, onCancel }, ref) => {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])

  type SelectedFile = { id: string; name: string; url: string; progress: number }
  const [files, setFiles] = useState<SelectedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadsInProgress, setUploadsInProgress] = useState(0)
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false)
  const { activeId, workflowSelectedIdByConvId, setWorkflowForActive } = (useConversationStore() as any) || {}
  const { options: workflowOptions } = useWorkflowStore()

  // Close workflow menu when pressing ESC or clicking outside./按 ESC 或点击外部时关闭工作流菜单。
  React.useEffect(() => {
    if (!workflowMenuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWorkflowMenuOpen(false) }
    const onClick = (e: MouseEvent) => {
      const menu = document.getElementById('workflow-dropdown-menu')
      const btn = document.getElementById('workflow-button')
      if (menu && !menu.contains(e.target as Node) && btn && !btn.contains(e.target as Node)) setWorkflowMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [workflowMenuOpen])

  // Auto-resize textarea within 1~5 lines./自动调整文本框高度为 1~5 行。
  React.useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '20')
    const maxH = lineHeight * 5 + 12
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
  }, [value])

  /** Simulate upload progress for placeholder UX./模拟上传进度以改善体验。 */
  const simulateProgress = (id: string) => {
    let pct = 0
    const timer = setInterval(() => {
      pct += 25
      setFiles((prev) => prev.map(f => f.id === id ? { ...f, progress: Math.min(100, pct) } : f))
      if (pct >= 100) { clearInterval(timer); setUploadsInProgress((n) => Math.max(0, n - 1)) }
    }, 120)
  }

  /** Handle files selected via input or drop./处理通过输入框或拖拽选择的文件。 */
  const onFiles = useCallback((list: FileList | null) => {
    if (!list) return
    const next: SelectedFile[] = []
    Array.from(list).forEach((f) => {
      const id = `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`
      const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(f) : ''
      next.push({ id, name: f.name, url, progress: 0 })
      setUploadsInProgress((n) => n + 1)
      setTimeout(() => simulateProgress(id), 0)
    })
    setFiles((prev) => [...prev, ...next])
  }, [])

  /** Accept dropped files and forward to handler./接收拖放文件并转交处理。 */
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    onFiles(e.dataTransfer.files)
  }

  /** Trigger hidden file input to open dialog./触发隐藏文件输入以打开选择框。 */
  const onChooseFiles = () => { fileInputRef.current?.click() }

  /** Remove a file from the preview list./从预览列表中移除文件。 */
  const onRemove = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id))

  // Get current selected workflow
  const selectedWorkflowId = activeId ? workflowSelectedIdByConvId?.[activeId] : undefined
  const selectedWorkflow = workflowOptions.find(w => w.id === selectedWorkflowId)

  // Truncate workflow name: minimum 5 chars, add ellipsis if longer than 10./截断工作流名称：至少 5 个字符，超过 10 个添加省略号。
  const truncateWorkflowName = (name: string) => {
    if (name.length <= 10) return name
    return name.slice(0, 10) + '...'
  }

  const workflowButtonText = selectedWorkflow 
    ? truncateWorkflowName(selectedWorkflow.name)
    : '选择工作流'

  return (
    <div 
      className="rounded-lg border p-4"
      style={{ 
        borderColor: 'var(--color-border)', 
        background: 'var(--color-bg-container)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}
      onDragOver={(e) => e.preventDefault()} 
      onDrop={onDrop}
    >
      {/* 1. File preview area (top, when files present)./顶部文件预览区域（存在文件时显示）。 */}
      {files.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <div className="flex items-stretch gap-2" style={{ minHeight: 96 }}>
            {files.map((f) => {
              const ext = f.name.split('.').pop()?.toLowerCase() || ''
              const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
              const getFileIcon = () => {
                if (ext === 'pdf') return '📄'
                if (['doc', 'docx'].includes(ext)) return '📝'
                if (['xls', 'xlsx'].includes(ext)) return '📊'
                if (['txt', 'md'].includes(ext)) return '📃'
                return '📎'
              }
              return (
                <div key={f.id} className="relative inline-block align-top rounded-md border" style={{ width: 100, borderColor: 'var(--color-border)' }}>
                  <div className="mb-1" style={{ width: '100%', height: 80, overflow: 'hidden', borderRadius: 6, background: 'var(--color-fill-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isImage && f.url ? (
                      <img src={f.url} alt={f.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span className="text-3xl" role="img" aria-label={`${ext} 文件`}>{getFileIcon()}</span>
                    )}
                  </div>
                  <div className="px-2 pb-2">
                    <div className="text-[10px] truncate" title={f.name}>{f.name}</div>
                    <div className="h-1 mt-1 rounded" style={{ background: 'var(--color-fill-secondary)' }}>
                      <div className="h-1 rounded" style={{ width: `${f.progress}%`, background: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <div className="absolute top-1 right-1 flex gap-1">
                    <button 
                      type="button" 
                      aria-label="删除文件" 
                      className="text-xs rounded-md px-1 transition-all" 
                      style={{ 
                        border: 'none',
                        background: 'transparent', 
                        cursor: 'pointer',
                        color: 'var(--color-text)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-hover-bg)'
                        e.currentTarget.style.color = '#ef4444'
                        e.currentTarget.style.boxShadow = 'var(--color-hover-shadow-inset)'
                        e.currentTarget.style.transform = 'translateY(1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--color-text)'
                        e.currentTarget.style.boxShadow = 'none'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                      onClick={() => onRemove(f.id)}
                    >✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 2. Textarea (middle, full width) - macOS style without border./全宽文本框（居中，macOS 风格无边框）。 */}
      <textarea
        ref={inputRef}
        placeholder="输入消息..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!value.trim() && files.length === 0) return
            if (disabled) return
            onSend()
            inputRef.current?.focus()
          }
        }}
        className="w-full min-h-[80px] max-h-[120px] rounded-md p-3 resize-none mb-3"
        style={{ 
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--color-text)'
        }}
      />

      {/* 3. Bottom control bar: [+] [Workflow▼] ... [Send/Stop] */}
      <div className="flex items-center gap-2">
        {/* Plus button - macOS风格：无边框，纯背景变化 */}
        <button
          type="button"
          aria-label="上传文件"
          className="flex-shrink-0 rounded-md w-9 h-9 flex items-center justify-center transition-all"
          style={{ 
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text)', 
            cursor: 'pointer' 
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-hover-bg)'
            e.currentTarget.style.boxShadow = 'var(--color-hover-shadow-inset)'
            e.currentTarget.style.transform = 'translateY(1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
          onClick={onChooseFiles}
          title="上传文件"
        >
          +
        </button>

        {/* Workflow selector button - macOS风格 */}
        <div className="relative flex-shrink-0">
          <button
            id="workflow-button"
            type="button"
            aria-label="选择工作流"
            aria-expanded={workflowMenuOpen}
            className="rounded-md px-3 h-9 flex items-center gap-1 transition-all text-sm whitespace-nowrap"
            style={{ 
              border: 'none',
              background: selectedWorkflow ? 'var(--color-primary-bg)' : 'transparent',
              color: selectedWorkflow ? 'var(--color-primary)' : 'var(--color-text)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              if (selectedWorkflow) return
              e.currentTarget.style.background = 'var(--color-hover-bg)'
              e.currentTarget.style.boxShadow = 'var(--color-hover-shadow-inset)'
              e.currentTarget.style.transform = 'translateY(1px)'
            }}
            onMouseLeave={(e) => {
              if (selectedWorkflow) return
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
            onClick={() => setWorkflowMenuOpen(v => !v)}
            title={selectedWorkflow ? selectedWorkflow.name : '选择工作流'}
          >
            <span>{workflowButtonText}</span>
            <span aria-hidden>▼</span>
          </button>

          {/* Workflow dropdown menu (popup upward) */}
          {workflowMenuOpen && (
            <div
              id="workflow-dropdown-menu"
              role="menu"
              aria-label="工作流列表"
              className="absolute bottom-full left-0 mb-1 z-20 rounded-lg border shadow-lg overflow-hidden"
              style={{ 
                minWidth: 160,
                maxHeight: 240,
                background: 'var(--color-bg-container)',
                borderColor: 'var(--color-border)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
            >
              <div className="overflow-y-auto max-h-60">
                {/* Option: No workflow - macOS风格 */}
                <button
                  role="menuitem"
                  type="button"
                  className="block text-left w-full px-3 py-2 text-sm transition-all"
                  style={{ 
                    color: 'var(--color-text)', 
                    cursor: 'pointer', 
                    background: 'transparent',
                    border: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-hover-bg)'
                    e.currentTarget.style.boxShadow = 'var(--color-hover-shadow-inset)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  onClick={() => {
                    setWorkflowForActive?.(undefined)
                    setWorkflowMenuOpen(false)
                  }}
                >
                  {!selectedWorkflow && <span className="mr-2" aria-hidden>✓</span>}
                  不使用工作流
                </button>

                {/* Divider */}
                {workflowOptions.filter(w => w.enabled).length > 0 && (
                  <div className="h-px" style={{ background: 'var(--color-border)' }} />
                )}

                {/* User subscribed workflows - macOS风格 */}
                {workflowOptions.filter(w => w.enabled).map(workflow => (
                  <button
                    key={workflow.id}
                    role="menuitem"
                    type="button"
                    className="block text-left w-full px-3 py-2 text-sm transition-all"
                    style={{ 
                      color: 'var(--color-text)', 
                      cursor: 'pointer', 
                      background: 'transparent',
                      border: 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-hover-bg)'
                      e.currentTarget.style.boxShadow = 'var(--color-hover-shadow-inset)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    onClick={() => {
                      setWorkflowForActive?.(workflow.id)
                      setWorkflowMenuOpen(false)
                    }}
                    title={workflow.name}
                  >
                    {selectedWorkflowId === workflow.id && <span className="mr-2" aria-hidden>✓</span>}
                    {workflow.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Spacer (push send button to right) */}
        <div className="flex-grow" />

        {/* Send or Stop button - Theme-aware colors using CSS variables */}
        {!streaming ? (
          <button
            type="button"
            aria-label="发送消息"
            disabled={(!value.trim() && files.length === 0) || disabled || uploadsInProgress > 0}
            onClick={() => { 
              if ((!value.trim() && files.length === 0) || disabled || uploadsInProgress > 0) return
              onSend()
              inputRef.current?.focus()
            }}
            className="flex-shrink-0 rounded-full w-9 h-9 flex items-center justify-center font-bold text-lg transition-all"
            style={{ 
              background: (!value.trim() && files.length === 0) || disabled || uploadsInProgress > 0 
                ? 'var(--color-send-button-disabled)' 
                : 'var(--color-send-button-enabled)', 
              color: (!value.trim() && files.length === 0) || disabled || uploadsInProgress > 0 
                ? 'var(--color-send-button-disabled-text)' 
                : 'var(--color-send-button-enabled-text)',
              cursor: (!value.trim() && files.length === 0) || disabled || uploadsInProgress > 0 ? 'not-allowed' : 'pointer',
              border: 'none'
            }}
            onMouseEnter={(e) => {
              if ((!value.trim() && files.length === 0) || disabled || uploadsInProgress > 0) return
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
              e.currentTarget.style.transform = 'scale(1.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            ↑
          </button>
        ) : (
          <button
            type="button"
            aria-label="停止生成"
            className="flex-shrink-0 rounded-full w-9 h-9 flex items-center justify-center text-lg transition-all"
            style={{ 
              background: 'var(--color-send-button-enabled)',
              color: 'var(--color-send-button-enabled-text)',
              cursor: 'pointer',
              border: 'none'
            }}
            onClick={() => onCancel?.()}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
              e.currentTarget.style.transform = 'scale(1.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            ■
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.docx,.txt,.md,.csv,.jpg,.jpeg,.png,.gif,.webp"
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  )
})
