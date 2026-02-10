import React from 'react'
import { act, fireEvent, renderWithProviders as render, screen, waitFor } from '../../vitest.setup'
import LoginForm from './LoginForm'
import { loginAction } from './actions'
import { useSearchParams } from 'next/navigation'

vi.mock('../site-login/actions', () => ({
  loginAction: vi.fn(),
}))

describe('Site login form', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/site-login')
    vi.mocked(loginAction).mockReset()
    vi.mocked(useSearchParams).mockImplementation(
      () => new URLSearchParams(window.location.search) as ReturnType<typeof useSearchParams>,
    )
  })

  it('submits identifier, password and sanitized next value', async () => {
    window.history.pushState({}, '', '/site-login?next=/connections')

    const { container } = render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('账号（邮箱 / 手机号 / 用户名）'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'hunter2' } })

    const form = container.querySelector('form') as HTMLFormElement

    await act(async () => {
      fireEvent.submit(form)
    })

    await waitFor(() => {
      expect(vi.mocked(loginAction)).toHaveBeenCalledTimes(1)
    })

    const submitted = vi.mocked(loginAction).mock.calls[0][0] as FormData
    expect(submitted.get('identifier')).toBe('user@example.com')
    expect(submitted.get('password')).toBe('hunter2')
    expect(submitted.get('next')).toBe('/connections')
  })

  it('shows backend error message and resets button state', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof loginAction>>>()
    vi.mocked(loginAction).mockImplementation(() => deferred.promise)

    const { container } = render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('账号（邮箱 / 手机号 / 用户名）'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'hunter2' } })

    const form = container.querySelector('form') as HTMLFormElement
    const submitButton = screen.getByRole('button', { name: '登录' })

    await act(async () => {
      fireEvent.submit(form)
    })

    await waitFor(() => {
      expect(submitButton).toBeDisabled()
      expect(submitButton).toHaveTextContent('登录中...')
    })

    deferred.resolve({ success: false, message: '账号或密码错误' })

    await waitFor(() => {
      expect(screen.getByText('账号或密码错误')).toBeInTheDocument()
      expect(submitButton).not.toBeDisabled()
      expect(submitButton).toHaveTextContent('登录')
    })
  })
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
