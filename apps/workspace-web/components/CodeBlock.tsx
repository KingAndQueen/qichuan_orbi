"use client"

/** CodeBlock syntax-highlights code snippets using Prism./CodeBlock 使用 Prism 对代码片段进行高亮。 */
import React, { useEffect, useRef, useState } from 'react'
// @ts-expect-error: prismjs has no official types in our toolchain
import Prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-json'

/** Normalise language aliases to Prism identifiers./将语言别名标准化为 Prism 可识别的值。 */
function normalizeLanguage(lang?: string): string {
  const v = (lang || '').toLowerCase()
  if (v === 'ts' || v === 'tsx' || v === 'typescript') return 'typescript'
  if (v === 'js' || v === 'jsx' || v === 'javascript') return 'javascript'
  if (v === 'json') return 'json'
  return v || 'typescript'
}

/** Guess a language based on source text heuristics./根据源文本启发式推测语言。 */
function detectLanguage(text: string): string {
  if (/\b(function|const|let|=>|console\.)\b/.test(text)) return 'javascript'
  if (/\bclass\s+\w+\s*\{|interface\s+\w+/.test(text)) return 'typescript'
  if (/\{\s*"[\w-]+"\s*:\s*/.test(text)) return 'json'
  return 'typescript'
}

/** CodeBlock component./CodeBlock 组件。 */
export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const lang = normalizeLanguage(language) || detectLanguage(code)

  useEffect(() => {
    if (!preRef.current) return
    try {
      Prism.highlightAllUnder(preRef.current)
    } catch {
      // Ignore highlight errors caused by unsupported languages./忽略因不支持的语言导致的高亮错误。
    }
  }, [code, lang])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Ignore clipboard failures (e.g., insecure context in tests)./忽略剪贴板失败（例如测试环境不安全）。
    }
  }

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: 'var(--color-fill-secondary)', border: '1px solid var(--color-border)' }}>
      {/* Language label bar - ChatGPT style./语言标签栏，ChatGPT 风格。 */}
      <div 
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ 
          background: 'var(--color-fill-secondary)',
          borderColor: 'var(--color-border)',
          fontSize: '12px',
          color: 'var(--color-text-secondary)'
        }}
      >
        <span className="font-medium">{lang}</span>
        <button
          type="button"
          aria-label="复制代码"
          onClick={() => void copy()}
          className="rounded-md px-2 py-1 text-xs transition-all"
          style={{ 
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-hover-bg)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {copied ? '✓ 已复制' : '📋 复制'}
        </button>
      </div>
      {/* Code content./代码内容。 */}
      <pre
        ref={preRef}
        className={`language-${lang} m-0`}
        style={{ background: 'transparent', border: 'none', borderRadius: 0, padding: '16px' }}
      >
        <code className={`language-${lang}`}>{code}</code>
      </pre>
    </div>
  )
}
