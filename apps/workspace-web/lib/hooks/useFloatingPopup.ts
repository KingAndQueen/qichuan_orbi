import { useState } from 'react'
import {
  useFloating,
  useClick,
  useHover,
  useDismiss,
  useInteractions,
  autoUpdate,
  offset,
  flip,
  shift,
  Placement,
} from '@floating-ui/react'

interface UseFloatingPopupProps {
  placement?: Placement
  trigger?: 'click' | 'hover'
  // [建议] 允许外部传入 open 和 onOpenChange，使其变为“受控”组件
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function useFloatingPopup({
  placement = 'bottom-start',
  trigger = 'click',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: UseFloatingPopupProps = {}) {
  // [建议] 如果外部没有传入 open 状态，则组件自己管理（非受控）
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)

  // [建议] 决定是使用外部传入的状态（受控）还是内部状态（非受控）
  const isOpen = controlledOpen ?? uncontrolledOpen
  const setIsOpen = controlledOnOpenChange ?? setUncontrolledOpen

  // [建议] 将状态传入 useFloating
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(8),
      flip(),
      shift(),
    ],
    whileElementsMounted: autoUpdate,
    placement,
  })

  // 交互钩子
  const click = useClick(context, { enabled: trigger === 'click' })
  const hover = useHover(context, { enabled: trigger === 'hover' })
  // [建议] useDismiss 现在可以正确调用 setIsOpen，
  // 无论是受控还是非受控，都可以关闭菜单了！
  const dismiss = useDismiss(context) 

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    hover,
    dismiss,
  ])

  return {
    isOpen: context.open, // [建议] 返回 context.open 更安全
    setIsOpen: context.onOpenChange,
    refs,
    floatingStyles,
    getReferenceProps,
    getFloatingProps,
    context,
  }
}
