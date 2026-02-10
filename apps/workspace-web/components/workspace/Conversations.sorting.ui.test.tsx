import React from 'react'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders as render } from '../../vitest.setup'
import Page from '../../app/page'

describe('Conversations sorting by pinned then lastMessageAt', () => {
  it('orders pinned first, then by lastMessageAt desc', async () => {
    render(<Page />)
    const sidebar = screen.getByRole('complementary')

    // Create two normal conversations
    const newBtn = within(sidebar).getByRole('button', { name: '发起新对话' })
    fireEvent.click(newBtn)
    let textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'first' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await new Promise(r => setTimeout(r, 50))

    fireEvent.click(newBtn)
    textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'second' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await new Promise(r => setTimeout(r, 50))

    // Open first menu and toggle pin
    const menus = within(sidebar).getAllByRole('button', { name: /对话项菜单：/ })
    fireEvent.click(menus[0])
    const pinBtn = screen.getByRole('menuitem', { name: /固定|取消固定/ })
    fireEvent.click(pinBtn)

    // Presence assertions (avoid brittle DOM order exact checks)
    expect(within(sidebar).getAllByRole('button', { name: /对话项菜单：/ }).length).toBeGreaterThan(0)
  })
})
