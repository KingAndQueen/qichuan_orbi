"use client"

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/site-login')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        第三方登录暂未开放，请使用账号密码登录。
      </div>
    </div>
  )
}
