"use client"

/** ErrorBanner shows dismissible error messages./ErrorBanner 显示可关闭的错误提示。 */

import React from 'react'

interface ErrorBannerProps {
  /** Text to display in the banner./横幅中显示的文本。 */
  message?: string
  /** Callback invoked when the close button is pressed./点击关闭按钮时触发的回调。 */
  onDismiss?: () => void
  /** Optional extra classes for layout spacing./可选的额外类名用于布局间距。 */
  className?: string
}

/** ErrorBanner component./ErrorBanner 组件。 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss, className }) => {
  if (!message) return null

  return (
    <div
      role="alert"
      className={[
        'rounded-md border px-3 py-2 text-sm bg-[var(--color-bg-container)] border-[var(--color-border)]',
        className ?? 'mb-4',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span>{message}</span>
        {onDismiss ? (
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs bg-[var(--color-bg-container)] border-[var(--color-border)] hover:bg-[var(--color-hover-bg)] transition-colors"
            style={{ cursor: 'pointer' }}
            onClick={onDismiss}
          >
            关闭
          </button>
        ) : null}
      </div>
    </div>
  )
}
