"use client"

import React, { FormEvent, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { loginAction } from './actions'

// 这是您原来的 page.tsx 的内容，现在是一个独立的组件
export default function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const searchParams = useSearchParams()
  const nextUrl = useMemo(() => searchParams.get('next') ?? '/', [searchParams])

  const submitForm = async (formData: FormData) => {
    setIsSubmitting(true)
    setError(null)
    const result = await loginAction(formData)
    if (result && !result.success) {
      setError(result.message)
    }
    // 成功时由 Middleware 处理重定向
    setIsSubmitting(false)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    await submitForm(formData)
  }

  // 注意：只保留了 <form> 及其内部内容
  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border p-6 w-full max-w-sm"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-bg-container)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <input type="hidden" name="next" value={nextUrl} />
      <h1
        className="text-xl font-medium mb-4 text-center"
        style={{ color: 'var(--color-text)' }}
      >
        新智流 (Orbitaskflow)
      </h1>
      <p
        className="text-sm text-center mb-6"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        请输入账号与密码完成登录
      </p>

      <div className="grid gap-4">
        <div>
          <label
            htmlFor="identifier"
            className="text-sm font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            账号（邮箱 / 手机号 / 用户名）
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            required
            autoComplete="username"
            placeholder="邮箱 / 手机号 / 用户名"
            className="w-full rounded border px-3 py-2 mt-1 bg-transparent"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="text-sm font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded border px-3 py-2 mt-1 bg-transparent"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded border px-4 py-2 text-sm text-white border-blue-600 transition-opacity"
          style={{
            background: 'var(--color-primary)',
            opacity: isSubmitting ? 0.7 : 1,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? '登录中...' : '登录'}
        </button>

        {error && (
          <p
            className="text-sm text-center"
            style={{ color: 'var(--color-error)' }}
          >
            {error}
          </p>
        )}

        <p
          className="text-xs text-center"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          飞书、微信、企微、钉钉 等第三方登录暂未开放
        </p>
      </div>
    </form>
  )
}