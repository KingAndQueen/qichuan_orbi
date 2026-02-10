"use client"

/** EmptyConversationView renders introductory content for blank chats./EmptyConversationView 在空对话时展示引导内容。 */

import React from 'react'
import { ErrorBanner } from './ErrorBanner'

interface EmptyConversationViewProps {
  /** Optional error message shown above the intro./显示在引导内容上方的错误信息。 */
  errorMsg?: string
  /** Clears the error banner when invoked./触发时清除错误横幅。 */
  onClearError?: () => void
  /** Content that encourages starting a conversation./用于鼓励开始对话的内容。 */
  children: React.ReactNode
}

/** EmptyConversationView component wrapper./EmptyConversationView 组件封装。 */
export const EmptyConversationView: React.FC<EmptyConversationViewProps> = ({
  errorMsg,
  onClearError,
  children,
}) => {
  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="w-full max-w-3xl">
        <ErrorBanner message={errorMsg} onDismiss={onClearError} />
        {children}
      </div>
    </div>
  )
}
