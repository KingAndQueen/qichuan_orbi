"use client"

/**
 * ConversationPane renders the chat transcript and composer./ConversationPane 负责渲染对话内容与输入面板。
 */

import React from 'react'
import type { Message } from '../../lib/store/conversation'
import { MessageList } from '../MessageList'
import { ErrorBanner } from './ErrorBanner'

interface ConversationPaneProps {
  /** Chat messages to display./需要展示的聊天消息列表。 */
  messages: Message[]
  /** Indicates whether the store has finished hydrating./指示状态存储是否已准备完成。 */
  storeReady: boolean
  /** Optional error text shown above the transcript./可选的错误文案显示在对话上方。 */
  errorMsg?: string
  /** Clears the visible error banner when invoked./触发时清除错误提示条。 */
  onClearError?: () => void
  /** Requests focus for the composer component./请求将焦点设置到输入框。 */
  onRequestComposerFocus?: () => void
  /** React node used as the composer UI./作为输入组件的 React 节点。 */
  composer: React.ReactNode
}

/**
 * ConversationPane displays messages and pins the composer to the bottom./ConversationPane 展示消息并固定输入框在底部。
 */
export const ConversationPane: React.FC<ConversationPaneProps> = ({
  messages,
  storeReady,
  errorMsg,
  onClearError,
  onRequestComposerFocus,
  composer,
}) => {
  return (
    <div className="container-centered h-full grid" style={{ gridTemplateRows: '1fr auto' }}>
      <div className="min-h-0 overflow-hidden">
        <ErrorBanner message={errorMsg} onDismiss={onClearError} className="mb-2" />
        {/* Only render the transcript after the store has initialised./仅在存储初始化后渲染对话内容。 */}
        {!storeReady ? null : (
          <MessageList messages={messages} onRequestComposerFocus={onRequestComposerFocus} />
        )}
      </div>
      <div
        className="sticky bottom-0 z-10 pt-10 pb-6 px-4 md:px-6 flex justify-center items-end"
        style={{ background: 'linear-gradient(to top, var(--color-bg-container) 65%, transparent 100%)' }}
      >
        <div className="w-full max-w-[840px]">
          {composer}
        </div>
      </div>
    </div>
  )
}
