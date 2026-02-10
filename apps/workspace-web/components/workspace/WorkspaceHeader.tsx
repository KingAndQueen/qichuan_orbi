"use client"

/** WorkspaceHeader renders the top bar controls./WorkspaceHeader 渲染顶部控制栏。 */

import React, { useEffect, useState } from 'react'
import { Dropdown } from '../ui/Dropdown'
import type { AuthStatus, AuthUser } from '../../lib/store/auth'

interface WorkspaceHeaderProps {
  /** Page title displayed in the header./在标题栏显示的页面标题。 */
  title?: string
  /** Current theme identifier (light/dark)./当前主题标识（浅色/深色）。 */
  theme?: string
  /** Toggles the visual theme./切换视觉主题。 */
  onToggleTheme: () => void
  /** Legacy flag retained for compatibility./为兼容性保留的历史标记。 */
  isAuthenticated: boolean
  /** Current authentication status enum./当前认证状态枚举。 */
  authStatus: AuthStatus
  /** Authenticated user data./认证用户数据。 */
  user?: AuthUser
  /** Legacy login trigger (unused)./历史登录触发器（未使用）。 */
  onLogin: () => void
  /** Callback executed on logout./退出登录时执行的回调。 */
  onLogout: () => void
}

/** WorkspaceHeader component./WorkspaceHeader 组件定义。 */
export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title = '新智流 · 工作空间',
  theme,
  onToggleTheme,
  // isAuthenticated and onLogin are kept for API compatibility but not used
  authStatus,
  user,
  onLogout,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  // NOTE: When running via scripts/otfy.py (Next.js dev), the theme may be
  // resolved from localStorage only on the client. That means the server sends
  // the fallback label "切换主题", while the client calculates "浅色/深色" on
  // first render, triggering a hydration mismatch. In the packaged
  // deploy_macos.py flow the server render already matches the client, so the
  // issue is invisible. Keeping this guard ensures both paths stay consistent
  // and avoids noisy dev errors./说明：在通过 scripts/otfy.py 运行（Next.js dev）时，
  // 主题仅在客户端从 localStorage 解析，服务器输出的按钮文案为“切换主题”，而
  // 客户端首次渲染立即算出“浅色/深色”，导致水合不一致。打包后的 deploy_macos.py
  // 流程服务器与客户端一致，因此不会出现该问题。保留该守卫可以保证两种路径
  // 渲染一致，避免开发环境的报错。
  // Avoid hydration mismatches when theme is resolved on client only./避免主题仅在客户端解析导致的水合不一致。
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  // Step 1: determine whether auth state is loading./步骤 1：判断认证状态是否处于加载中。
  const isLoading = authStatus === 'loading' || authStatus === 'idle'

  // Helper: derive initial for avatar fallback./辅助：获取用于头像占位的首字母。
  const userInitial = (user?.name || '用').slice(0, 1);

  return (
    <header
      className="sticky top-0 z-10 h-14 flex items-center gap-3 px-4 bg-[var(--color-bg-container)]"
      style={{ background: 'var(--color-bg-container)' }}
    >
      <div className="font-semibold">{title}</div>

      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle button remains unchanged./主题切换按钮保持不变。 */}
        <button
          type="button"
          aria-label="切换主题"
          className="rounded-md border px-3 py-1 bg-[var(--color-bg-container)] border-[var(--color-border)] hover:bg-[var(--color-hover-bg)] transition-colors"
          style={{ cursor: 'pointer' }}
          onClick={onToggleTheme}
        >
          {mounted && typeof theme === 'string' ? (theme === 'dark' ? '深色' : '浅色') : '切换主题'}
        </button>

        {/* Step 2: refactored authentication state UI./步骤 2：重构后的认证状态 UI。 */}
        {isLoading ? (
          // State 1: show placeholder while loading./状态 1：加载时显示占位符。
          <div
            className="rounded-md border px-3 py-1 text-sm"
            style={{
              color: 'var(--color-text-secondary)',
              borderColor: 'var(--color-border)',
              opacity: 0.7,
            }}
          >
            加载中…
          </div>
        ) : (
          // State 2: authenticated (enforced by guards)./状态 2：已认证（由守卫保证）。
          <Dropdown
            open={menuOpen}
            onOpenChange={setMenuOpen}
            align="right"
            trigger={(
              // Step 3: avatar-only trigger for simplicity./步骤 3：使用仅头像触发器，界面更简洁。
              <button
                type="button"
                aria-label="用户菜单"
                className="rounded-full w-8 h-8 flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity"
                style={{ cursor: 'pointer' }}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span
                    aria-hidden
                    className="w-full h-full flex items-center justify-center text-sm font-medium"
                    style={{ background: 'var(--color-fill-secondary)', color: 'var(--color-text)' }}
                  >
                    {userInitial}
                  </span>
                )}
              </button>
            )}
            content={(
              // Step 4: dropdown enriched with user info and separator./步骤 4：下拉菜单增加用户信息与分隔线。
              <div role="menu" className="min-w-[180px] of-dropdown p-2">
                {/* User info summary section./用户信息摘要区域。 */}
                <div className="px-2 py-1 mb-1">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {user?.name || '用户'}
                  </div>
                  {user?.username && (
                    <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {user.username}
                    </div>
                  )}
                </div>

                {/* Visual separator between info and actions./信息与操作之间的分隔线。 */}
                <div className="h-px mx-[-8px] my-1" style={{ background: 'var(--color-border)' }} />

                {/* Logout action item./退出登录操作项。 */}
                <button
                  role="menuitem"
                  type="button"
                  // 使用 'of-menu-item' 保证样式统一，并添加红色以示危险操作
                  className="block text-left w-full of-menu-item text-red-600"
                  onClick={() => {
                    setMenuOpen(false)
                    onLogout()
                  }}
                >
                  退出登录
                </button>
              </div>
            )}
          />
        )}
        {/* Legacy login branch removed entirely./历史登录分支已完全移除。 */}
      </div>
    </header>
  )
}