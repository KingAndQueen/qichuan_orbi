"use client"

/** MarkdownRenderer displays sanitized markdown content./MarkdownRenderer 渲染经过净化的 Markdown 内容。 */
import React from 'react'
import Markdown from 'markdown-to-jsx'
import { CodeBlock } from './CodeBlock'

/** MarkdownRenderer component./MarkdownRenderer 组件。 */
export function MarkdownRenderer({ content, isUserMessage = false }: { content: string; isUserMessage?: boolean }) {
  // Security hardening: escape angle brackets to block raw HTML./安全强化：转义尖括号以阻止原始 HTML。
  // This prevents script tags and inline handlers from being interpreted./防止脚本标签与内联事件被解析。
  const sanitized = typeof content === 'string' ? content.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''
  return (
    <div 
      className="prose prose-sm max-w-none"
      style={isUserMessage ? { color: 'var(--user-message-text)' } : undefined}
    >
      <Markdown
        options={{
          overrides: {
            code: {
              component: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
                const lang = (className || '').replace('lang-', '').replace('language-', '') || 'typescript'
                const text = typeof children === 'string' ? children : String(children)
                return <CodeBlock code={text} language={lang} />
              }
            }
          }
        }}
      >{sanitized}</Markdown>
    </div>
  )
}
