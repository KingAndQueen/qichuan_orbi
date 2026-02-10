import React from 'react'
import { renderWithProviders as render, screen } from '../vitest.setup'
import ActivityPage from './activity/page'
import ConnectionsPage from './connections/page'

describe('Auxiliary placeholder pages', () => {
  it('renders activity placeholder content', () => {
    render(<ActivityPage />)
    expect(screen.getByText('数据洞察（占位）')).toBeInTheDocument()
    expect(screen.getByText('此页面为占位，后续将展示使用数据与分析。')).toBeInTheDocument()
  })

  it('renders connections placeholder content', () => {
    render(<ConnectionsPage />)
    expect(screen.getByText('三方管理（占位）')).toBeInTheDocument()
    expect(screen.getByText('此页面为占位，后续将展示三方连接的列表与授权状态。')).toBeInTheDocument()
  })
})
