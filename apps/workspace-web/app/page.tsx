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
      className="h-screen flex flex-row overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg-layout)',
        backgroundImage: 'var(--custom-bg-image)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Sidebar Section */}
      <div
        className="h-full flex-shrink-0 overflow-hidden transition-all duration-300 relative z-20"
        style={{
          width: leftCollapsed ? '56px' : '260px',
          background: 'var(--color-bg-layout)',
          borderRight: '1px solid var(--color-border)'
        }}
      >
        <Sidebar
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed((v) => !v)}
        />
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 h-full flex flex-col overflow-hidden relative"
        style={{ background: 'transparent' }}
      >
        {/* Background Image Overlay to ensure readability */}
        <div className="absolute inset-0 pointer-events-none bg-black/40 z-0"></div>
        <div className="absolute inset-0 pointer-events-none backdrop-blur-[2px] z-0"></div>

        <div className="relative z-10 w-full flex-shrink-0" style={{ background: 'rgba(32, 33, 35, 0.4)', backdropFilter: 'blur(8px)' }}>
          <WorkspaceHeader
            theme={theme}
            onToggleTheme={handleToggleTheme}
            isAuthenticated={isAuthenticated}
            user={user}
            authStatus={status}
            onLogin={handleLogin}
            onLogout={handleLogout}
          />
        </div>

        <main
          className="relative flex-1 w-full overflow-hidden z-10"
          style={{ background: 'transparent' }}
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
