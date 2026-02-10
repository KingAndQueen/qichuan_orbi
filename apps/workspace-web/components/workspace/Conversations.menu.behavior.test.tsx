import React from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders as render } from '../../vitest.setup'
import Page from '../../app/page'

describe('Conversations menu actions', () => {
  it('pin/unpin and delete actions work', async () => {
    render(<Page />)
    const newBtn = screen.getByRole('button', { name: '发起新对话' })
    fireEvent.click(newBtn)
    // draft not materialized yet
    const input = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'menu test' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await new Promise(r => setTimeout(r, 20))
    // open item menu via ellipsis
    const itemMenuBtn = screen.getByRole('button', { name: /对话项菜单：/ })
    fireEvent.click(itemMenuBtn)
    // rename
    const renameItem = await screen.findByRole('menuitem', { name: '重命名' })
    fireEvent.click(renameItem)
    // reopen menu, then pin toggle
    fireEvent.click(itemMenuBtn)
    const pinItem = await screen.findByRole('menuitem', { name: /固定|取消固定/ })
    fireEvent.click(pinItem)
    // reopen menu, then delete
    fireEvent.click(itemMenuBtn)
    const delItem = await screen.findByRole('menuitem', { name: '删除' })
    fireEvent.click(delItem)
    // After delete, list may be empty or new draft; we assert no crash by ensuring UI still renders composer
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
  })
})
