"use client"

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Composer, type ComposerHandle } from '../components/Composer'
import { Sidebar } from '../components/Sidebar'
import { useAuthGuard } from '../lib/hooks/useAuthGuard'
import { useActiveConversation } from '../lib/hooks/useActiveConversation'
import { WorkspaceHeader } from '../components/workspace/WorkspaceHeader'
import { EmptyConversationView } from '../components/workspace/EmptyConversationView'
import { ConversationPane } from '../components/workspace/ConversationPane'

export default function Page() {
  const { user, status, logout } = useAuthGuard()
  const {
    messages,
    input,
    setInput,
    sendMessage,
    streaming,
    cancelStreaming,
    clearError,
    errorMsg,
    storeReady,
  } = useActiveConversation()
  const { theme, setTheme } = useTheme()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const composerRef = useRef<ComposerHandle>(null)

  const handleToggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  const handleLogin = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.assign('/site-login')
    }
  }, [])

  const handleLogout = useCallback(() => {
    void logout()
  }, [logout])

  const handleClearError = useCallback(() => {
    if (clearError) clearError()
  }, [clearError])

  const composer = useMemo(
    () => (
      <Composer
        ref={composerRef}
        value={input}
        onChange={setInput}
        onSend={() => void sendMessage()}
        disabled={false}
        streaming={streaming}
        onCancel={() => cancelStreaming?.()}
      />
    ),
    [cancelStreaming, input, sendMessage, setInput, streaming]
  )

  const isAuthenticated = status === 'authenticated'

  return (
    <div
      className="h-screen grid overflow-hidden"
      style={{
        gridTemplateColumns: `${leftCollapsed ? '56px' : '260px'} 1fr`,
        background: 'var(--color-bg-layout)'
      }}
    >
      <div
        className="h-full overflow-hidden transition-all"
        style={{ background: 'var(--color-bg-layout)' }}
      >
        <Sidebar
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed((v) => !v)}
        />
      </div>

      <div
        className="h-full grid grid-rows-[56px_1fr] overflow-hidden"
        style={{ background: 'var(--color-bg-container)' }}
      >

        <WorkspaceHeader
          theme={theme}
          onToggleTheme={handleToggleTheme}
          isAuthenticated={isAuthenticated}
          user={user}
          authStatus={status}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />

        <main
          className="relative h-full overflow-hidden bg-[var(--color-bg-container)]"
          style={{ background: 'var(--color-bg-container)' }}
        >
          {messages.length === 0 ? (
            <EmptyConversationView errorMsg={errorMsg} onClearError={handleClearError}>
              {composer}
            </EmptyConversationView>
          ) : (
            <ConversationPane
              messages={messages}
              storeReady={storeReady}
              errorMsg={errorMsg}
              onClearError={handleClearError}
              onRequestComposerFocus={() => composerRef.current?.focus()}
              composer={composer}
            />
          )}
        </main>
      </div>
    </div>
  )
}
