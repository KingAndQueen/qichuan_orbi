import React from 'react'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders as render } from '../../vitest.setup'
import Page from '../../app/page'

describe('Temporary conversation behavior', () => {
  it('temporary conversation does not materialize into history list', async () => {
    render(<Page />)
    const sidebar = screen.getByRole('complementary')
    // Start temporary conversation
    const tempBtn = within(sidebar).getByRole('button', { name: '临时对话' })
    fireEvent.click(tempBtn)

    // Send a message
    const textarea = screen.getByPlaceholderText('输入消息...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'temp message' } })
    const sendBtn = screen.getByRole('button', { name: '发送消息' })
    fireEvent.click(sendBtn)
    // wait for mock streaming to finish
    await new Promise(r => setTimeout(r, 60))

    // Ensure conversation list does not contain generated title from temp
    const history = within(sidebar)
    expect(history.queryByText(/temp message/)).toBeNull()
  })
})
