"use client"

/** Sidebar renders navigation and conversation controls./Sidebar 渲染导航与会话控制。 */
import React, { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useConversationStore, type Conversation } from '../lib/store/conversation'
import { Dialog, Transition } from '@headlessui/react'
import { 
  PanelLeftClose, 
  PanelRightClose, 
  MessageSquarePlus, 
  Pin, 
  PinOff, 
  Edit3, 
  Trash2,
  Workflow,
  BarChart3,
  AppWindow
} from 'lucide-react'
import { Tooltip }  from './ui/Tooltip'
import { Dropdown } from './ui/Dropdown'


// Modal state definition for rename/delete dialogs./模态框状态定义，用于重命名或删除对话。
type ModalState = {
  type: 'rename' | 'delete' | null
  convId: string | null
  convTitle: string
}

export interface SidebarProps {
  /** Whether the sidebar is collapsed./侧边栏是否折叠。 */
  collapsed: boolean
  /** Toggles collapse state./切换折叠状态。 */
  onToggleCollapse: () => void
}

/**
 * Sidebar layout overview./Sidebar 布局概览。
 * 1. Collapse button at top./顶部折叠按钮。
 * 2. New/temporary conversation controls./新建与临时会话控制。
 * 3. Application shortcuts./应用快捷入口。
 * 4. Conversation list fills remaining space./会话列表占据剩余空间。
 */
export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const {
    conversations,
    activeId,
    createConversation,
    setActive,
    renameConversation,
    togglePinConversation,
    deleteConversation,
    startTemporaryConversation,
  } = useConversationStore()

  // Modal state values./模态框状态。 
  const [modalState, setModalState] = useState<ModalState>({ type: null, convId: null, convTitle: '' })
  const [newTitle, setNewTitle] = useState('')

  const sortedConversations = useMemo(() => {
    return conversations
      .slice()
      .sort((a: Conversation, b: Conversation) => {
        const pinDiff = (b.pinnedAt || 0) - (a.pinnedAt || 0)
        if (pinDiff !== 0) return pinDiff
        const aTime = a.lastMessageAt || a.createdAt || 0
        const bTime = b.lastMessageAt || b.createdAt || 0
        return bTime - aTime
      })
  }, [conversations])

  // Modal callbacks handle rename/delete flows./模态框回调用于处理重命名/删除流程。
  const handleOpenModal = (type: 'rename' | 'delete', conv: Conversation) => {
    if (type === 'rename') {
      setNewTitle(conv.title) 
    }
    setModalState({ type, convId: conv.id, convTitle: conv.title })
  }
  const handleCloseModal = () => {
    setModalState({ type: null, convId: null, convTitle: '' })
  }
  const handleSubmitRename = () => {
    if (modalState.convId) {
      renameConversation(modalState.convId, newTitle.trim() || modalState.convTitle)
    }
    handleCloseModal()
  }
  const handleSubmitDelete = () => {
    if (modalState.convId) {
      deleteConversation(modalState.convId)
    }
    handleCloseModal()
  }

  // Rendering branch for collapsed mode./折叠状态下的渲染分支。
  if (collapsed) {
    return (
      <aside 
        role="complementary" 
        className="h-full flex flex-col items-center p-2 gap-4"
      >
        {/* Step 1: expand button at top./步骤 1：顶部展开按钮。 */}
        <Tooltip content="展开" position="right">
          <button
            type="button"
            aria-label="展开左侧菜单"
            className="sidebar-icon-button sidebar-icon-button-secondary cursor-pointer"
            onClick={onToggleCollapse}
          >
            <PanelRightClose size={20} />
          </button>
        </Tooltip>
        
        {/* Step 2: new and temporary conversation actions./步骤 2：新建与临时会话操作。 */}
        <Tooltip content="发起新对话" position="right">
          <button
            type="button"
            aria-label="发起新对话"
            className="sidebar-icon-button cursor-pointer"
            onClick={() => createConversation()}
          >
            <Edit3 size={20} />
          </button>
        </Tooltip>
        <Tooltip content="临时对话" position="right">
          <button
            type="button"
            aria-label="临时对话"
            className="sidebar-icon-button sidebar-icon-button-secondary cursor-pointer"
            onClick={() => startTemporaryConversation?.()}
          >
            <MessageSquarePlus size={20} />
          </button>
        </Tooltip>
        
        {/* Step 3: application shortcuts./步骤 3：应用快捷入口。 */}
        <Tooltip content="工作流市场" position="right">
          <Link href="/marketplace" className="sidebar-icon-button cursor-pointer">
            <Workflow size={20} />
          </Link>
        </Tooltip>
        <Tooltip content="数据洞察" position="right">
          <Link href="/activity" className="sidebar-icon-button cursor-pointer">
            <BarChart3 size={20} />
          </Link>
        </Tooltip>
        <Tooltip content="三方管理" position="right">
          <Link href="/connections" className="sidebar-icon-button cursor-pointer">
            <AppWindow size={20} />
          </Link>
        </Tooltip>
        
        {/* Step 4: spring spacer fills remaining space./步骤 4：弹簧撑开剩余空间。 */}
        <div className="flex-1" />
      </aside>
    )
  }
  
  // Rendering branch for expanded mode./展开状态下的渲染分支。
  return (
    <aside 
      role="complementary" 
      className="h-full flex flex-col p-2"
    >
      {/* Step 1: top control bar with collapse button./步骤 1：顶部控制栏及折叠按钮。 */}
      <div className="flex justify-end mb-3">
        <Tooltip content="收起" position="bottom">
          <button
            type="button"
            aria-label="收起左侧菜单"
            className="sidebar-icon-button sidebar-icon-button-secondary cursor-pointer"
            onClick={onToggleCollapse}
          >
            <PanelLeftClose size={20} />
          </button>
        </Tooltip>
      </div>

      {/* Step 2: second row with new/temporary conversation controls./步骤 2：第二层的新建与临时会话控制。 */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          className="sidebar-link flex-1 flex items-center gap-2"
          aria-label="发起新对话"
          onClick={() => createConversation()}
        >
          <Edit3 size={16} />
          发起新对话
        </button>
        <Tooltip content="临时对话" position="bottom">
          <button
            className="sidebar-icon-button sidebar-icon-button-secondary cursor-pointer"
            aria-label="临时对话"
            onClick={() => startTemporaryConversation?.()}
          >
            <MessageSquarePlus size={20} />
          </button>
        </Tooltip>
      </div>

      {/* Step 3: third row application links./步骤 3：第三层应用链接。 */}
      <div className="sidebar-section-label mb-1">应用</div>
      <nav aria-label="应用导航" className="mb-3 grid gap-1">
        <Link href="/marketplace" className="sidebar-link flex items-center gap-2">
          <Workflow size={16} />
          工作流市场
        </Link>
        <Link href="/activity" className="sidebar-link flex items-center gap-2">
          <BarChart3 size={16} />
          数据洞察
        </Link>
        <Link href="/connections" className="sidebar-link flex items-center gap-2">
          <AppWindow size={16} />
          三方管理
        </Link>
      </nav>

      {/* Step 4: fourth layer conversation list fills space./步骤 4：第四层会话列表填充剩余空间。 */}
      <div className="sidebar-section-label mb-1">会话</div>
      <div className="mt-2 space-y-1 flex-1 overflow-y-auto">
        {sortedConversations.map((c: Conversation) => (
          <ConversationItem
            key={c.id}
            conversation={c}
            isActive={c.id === activeId}
            onClick={() => setActive(c.id)}
            onTogglePin={() => togglePinConversation(c.id)}
            onOpenModal={handleOpenModal} 
          />
        ))}
      </div>
      
      {/* Modals retain previous behaviour./模态框沿用既有行为。 */}
      <RenameModal
        isOpen={modalState.type === 'rename'}
        onClose={handleCloseModal}
        onSubmit={handleSubmitRename}
        title={newTitle}
        setTitle={setNewTitle}
      />
      <DeleteModal
        isOpen={modalState.type === 'delete'}
        onClose={handleCloseModal}
        onDelete={handleSubmitDelete}
        convTitle={modalState.convTitle}
      />
    </aside>
  )
}
/**
 * =================================================================================
 * 对话列表项组件 (ConversationItem Component)
 * =================================================================================
 */
interface ConversationItemProps {
  /** Conversation data to display./要展示的会话数据。 */
  conversation: Conversation
  /** Indicates whether the item is currently active./指示该项是否为当前激活会话。 */
  isActive: boolean
  /** Handler when the row is clicked./点击行时触发的处理函数。 */
  onClick: () => void
  /** Toggles pinned status./切换固定状态。 */
  onTogglePin: () => void
  /** Opens modal for rename or delete./打开重命名或删除模态框。 */
  onOpenModal: (type: 'rename' | 'delete', conv: Conversation) => void
}

/** ConversationItem renders a single conversation row./ConversationItem 渲染单条会话记录。 */
function ConversationItem({ conversation: c, isActive, onClick, onTogglePin, onOpenModal }: ConversationItemProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  
  const handleMenuItemClick = (action: 'rename' | 'delete' | 'pin') => {
    if (action === 'pin') {
      onTogglePin()
    } else {
      onOpenModal(action, c)
    }
    setIsMenuOpen(false) // Close the context menu./关闭“...”菜单。
  }
  const menuContent = (
    <div
      id="conv-menu"
      role="menu"
      className="ml-2 mt-1 w-[180px] of-dropdown"
    >
      <button
        role="menuitem"
        type="button"
        className="block w-full text-left of-menu-item"
        onClick={() => handleMenuItemClick('rename')}
      >
        <Edit3 size={14} className="inline-block mr-2" />
        重命名
      </button>
      <button
        role="menuitem"
        type="button"
        className="block w-full text-left of-menu-item"
        onClick={() => handleMenuItemClick('pin')}
      >
        {c.pinnedAt ? <PinOff size={14} className="inline-block mr-2" /> : <Pin size={14} className="inline-block mr-2" />}
        {c.pinnedAt ? '取消固定' : '固定'}
      </button>
      <button
        role="menuitem"
        type="button"
        className="block w-full text-left of-menu-item text-red-600"
        onClick={() => handleMenuItemClick('delete')}
      >
        <Trash2 size={14} className="inline-block mr-2" />
        删除
      </button>
    </div>
  )

  return (
    <div className="group">
      <div
        role="button"
        onClick={onClick}
        className={`sidebar-conversation ${isActive ? 'sidebar-conversation-active' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="sidebar-conversation-title">{c.title}</div>
          <div className="flex items-center gap-1 sidebar-meta">
            {c.pinnedAt ? <span role="img" aria-label="已固定">📌</span> : null}
            <Dropdown
              open={isMenuOpen}
              onOpenChange={setIsMenuOpen}
              align="left"
              content={menuContent}
              trigger={(
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-label={`对话项菜单：${c.title}`}
                  className="sidebar-menu-button cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation() 
                    setIsMenuOpen(v => !v)
                  }}
                >
                  …
                </button>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  )
}


/**
 * =================================================================================
 * 重命名模态框 (RenameModal Component)
 * =================================================================================
 */
interface RenameModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: () => void
  title: string
  setTitle: (title: string) => void
}

/** RenameModal allows editing conversation titles./RenameModal 允许编辑会话标题。 */
function RenameModal({ isOpen, onClose, onSubmit, title, setTitle }: RenameModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-[var(--color-bg-container)] p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-[var(--color-text)]">
                  重命名对话
                </Dialog.Title>
                <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
                  <div className="mt-4">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded border px-3 py-2 bg-transparent"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                      aria-label="新的对话标题" 
                    />
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      className="rounded border px-4 py-2 text-sm"
                      style={{ borderColor: 'var(--color-border)' }}
                      onClick={onClose}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="rounded border px-4 py-2 text-sm bg-blue-600 text-white border-blue-600"
                    >
                      保存
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

/**
 * =================================================================================
 * DeleteModal Component./删除模态框组件。
 * =================================================================================
 */
interface DeleteModalProps {
  /** Whether the modal is visible./模态框是否可见。 */
  isOpen: boolean
  /** Handler for closing without deleting./在未删除时关闭的处理函数。 */
  onClose: () => void
  /** Handler invoked to confirm deletion./确认删除时的处理函数。 */
  onDelete: () => void
  /** Title of the conversation to display./需展示的会话标题。 */
  convTitle: string | null
}

/** DeleteModal prompts the user before removing a conversation./DeleteModal 在删除会话前提示用户。 */
function DeleteModal({ isOpen, onClose, onDelete, convTitle }: DeleteModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-[var(--color-bg-container)] p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-[var(--color-text)]">
                  删除对话
                </Dialog.Title>
                <div className="mt-4">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    您确定要删除对话 "{convTitle}" 吗？此操作无法撤销。
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="rounded border px-4 py-2 text-sm"
                    style={{ borderColor: 'var(--color-border)' }}
                    onClick={onClose}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="rounded border px-4 py-2 text-sm bg-red-600 text-white border-red-600"
                    onClick={onDelete}
                  >
                    确认删除
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}