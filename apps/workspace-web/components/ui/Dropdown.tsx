"use client"

import React, { useEffect, useState } from 'react'
import { FloatingPortal } from '@floating-ui/react'
import { useFloatingPopup } from '../../lib/hooks/useFloatingPopup'

interface DropdownProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactNode
  content: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}

export const Dropdown: React.FC<DropdownProps> = ({
  open,
  onOpenChange,
  trigger,
  content,
  align = 'left',
  className,
}) => {
  const [isClient, setIsClient] = useState(false)
  useEffect(() => setIsClient(true), [])

  const {
    isOpen, // [建议] 现在 isOpen 会正确反映来自 Sidebar.tsx 的状态
    refs,
    floatingStyles,
    getReferenceProps,
    getFloatingProps,
  } = useFloatingPopup({
    placement: align === 'right' ? 'bottom-end' : 'bottom-start',
    trigger: 'click',
    
    // [建议] 核心修复：将外部状态传入钩子
    open: open,
    onOpenChange: onOpenChange,
  })

  // [建议] 移除旧的 useEffect，因为状态同步已在钩子内部完成

  const renderPortal = () => (
    <FloatingPortal>
      {isOpen && ( // [建议] 使用钩子返回的 isOpen 状态
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className={[
            'z-20',
            className || ''
          ].join(' ')}
        >
          {content}
        </div>
      )}
    </FloatingPortal>
  )

  return (
    <>
      <div ref={refs.setReference} {...getReferenceProps()}>
        {trigger}
      </div>
      {isClient && renderPortal()}
    </>
  )
}