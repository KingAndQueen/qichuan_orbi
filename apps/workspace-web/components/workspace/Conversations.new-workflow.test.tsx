/**
 * Test: New conversation workflow selection behavior
 * 测试：新对话的工作流选择行为
 * 
 * Validates that new conversations start with no workflow selected (undefined),
 * requiring users to explicitly choose a workflow if needed.
 * 
 * 验证新对话开始时没有选择任何工作流（undefined），
 * 需要用户明确选择工作流（如果需要）。
 */
import React from 'react'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders as render } from '../../vitest.setup'
import Page from '../../app/page'

describe('New conversation workflow selection', () => {
  it('new conversation starts with no workflow selected', () => {
    render(<Page />)
    
    // Initially should show "选择工作流" (not a specific workflow)
    const workflowBtn = screen.getByRole('button', { name: '选择工作流' })
    expect(workflowBtn).toBeInTheDocument()
    expect(workflowBtn.textContent).toBe('选择工作流▼')
    
    // Click "发起新对话" button to create a new conversation
    const sidebar = screen.getByRole('complementary')
    const newChatBtn = within(sidebar).getByRole('button', { name: '发起新对话' })
    fireEvent.click(newChatBtn)
    
    // After creating new conversation, workflow should still be unselected
    const workflowBtnAfter = screen.getByRole('button', { name: '选择工作流' })
    expect(workflowBtnAfter).toBeInTheDocument()
    expect(workflowBtnAfter.textContent).toBe('选择工作流▼')
  })
  
  it('temporary conversation also starts with no workflow selected', () => {
    render(<Page />)
    
    // Click "临时对话" button
    const sidebar = screen.getByRole('complementary')
    const tempBtn = within(sidebar).getByRole('button', { name: '临时对话' })
    fireEvent.click(tempBtn)
    
    // Temporary conversation should also have no workflow selected
    const workflowBtn = screen.getByRole('button', { name: '选择工作流' })
    expect(workflowBtn).toBeInTheDocument()
    expect(workflowBtn.textContent).toBe('选择工作流▼')
  })
  
  it('user can manually select workflow for new conversation', () => {
    render(<Page />)
    
    // Create new conversation
    const sidebar = screen.getByRole('complementary')
    const newChatBtn = within(sidebar).getByRole('button', { name: '发起新对话' })
    fireEvent.click(newChatBtn)
    
    // Initially no workflow selected
    let workflowBtn = screen.getByRole('button', { name: '选择工作流' })
    expect(workflowBtn.textContent).toBe('选择工作流▼')
    
    // Open workflow dropdown
    fireEvent.click(workflowBtn)
    
    // Select "危机公关工作流"
    const menu = screen.getByRole('menu', { name: '工作流列表' })
    const crisisWorkflow = within(menu).getByRole('menuitem', { name: /危机公关/ })
    fireEvent.click(crisisWorkflow)
    
    // Now button should show selected workflow name
    workflowBtn = screen.getByRole('button', { name: '选择工作流' })
    expect(workflowBtn.textContent).toContain('危机公关')
  })
})
