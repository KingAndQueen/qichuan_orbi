"use client"
import React from 'react'
import { FloatingPortal, type Placement } from '@floating-ui/react'

// [建议] 导入我们抽象的 useFloatingPopup 钩子
// （这个钩子封装了 Floating UI 的所有核心逻辑）
import { useFloatingPopup } from '../../lib/hooks/useFloatingPopup' // (假设路径)

interface TooltipProps {
  /**
   * 触发提示的元素 (例如:一个按钮)，必须是单个 React 元素。
   */
  children: React.ReactNode
  /**
   * 提示框中显示的文本内容
   */
  content: React.ReactNode
  /**
   * 提示框相对于触发元素的位置 (默认为 'top')
   * [建议] 类型从 'top' | 'bottom' ... 更改为 Floating UI 的 'Placement'
   */
  position?: Placement
}

/**
 * [建议] Tooltip 重构版
 *
 * 移除了所有手动的位置计算、state、effect 和 createPortal。
 * 现在 100% 依赖 useFloatingPopup 抽象钩子（该钩子内部使用 Floating UI）。
 *
 * - 自动使用 Portal，解决了 overflow 剪裁问题。
 * - 自动处理滚动和窗口大小调整（autoUpdate）。
 * - 自动处理边缘碰撞（flip, shift）。
 * - 与 Dropdown.tsx 共享核心逻辑，实现抽象。
 */
export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  position = 'top',
}) => {
  // --- 1. 使用共享钩子 ---
  // [建议] 只需一行代码，即可获取所有需要的功能
  const {
    context,
    refs,
    floatingStyles,
    getReferenceProps,
    getFloatingProps,
  } = useFloatingPopup({
    placement: position,
    trigger: 'hover', // [建议] 明确告诉钩子，Tooltip 是 'hover' 触发
  })

  // --- 2. 附加 Refs 和 Props 到触发器 ---
  // [建议] 使用 React.cloneElement 来安全地注入 Floating UI 所需的 props
  const triggerElement = React.Children.only(children) as React.ReactElement
  const trigger = React.cloneElement(
    triggerElement,
    // [建议] getReferenceProps 包含了 onMouseEnter, onMouseLeave, onFocus, onBlur
    // 它会与 triggerElement.props 合并
    {
      ...triggerElement.props,
      ...getReferenceProps(triggerElement.props),
      // [建议] 将 ref 附加到触发器
      ref: refs.setReference,
    }
  )

  // --- 3. 渲染 Portal ---
  // [建议] FloatingPortal 是 @floating-ui/react 提供的 Portal 组件
  return (
    <>
      {trigger}
      
      {/* [建议] FloatingPortal 会自动处理 isClient 检查 
        并将其渲染到 document.body
      */}
      <FloatingPortal>
        {/* [建议] context.open 由 useFloatingPopup 内部的 useState 管理 */}
        {context.open && (
          <div
            // [建议] 附加 ref 和 props 到浮动元素
            ref={refs.setFloating}
            {...getFloatingProps()}
            role="tooltip"
            className={`
              fixed z-50
              whitespace-nowrap rounded px-2 py-1 text-xs
              transition-opacity duration-150
              pointer-events-none
            `}
            style={{
              ...floatingStyles, // [建议] 这是最关键的：应用 Floating UI 计算的坐标
              
              /* [修改] 1. 使用 CSS 变量来设置颜色 (与原版保持一致) */
              backgroundColor: 'var(--color-text)', 
              color: 'var(--color-bg-container)' 
            }}
          >
            {content}
          </div>
        )}
      </FloatingPortal>
    </>
  )
}