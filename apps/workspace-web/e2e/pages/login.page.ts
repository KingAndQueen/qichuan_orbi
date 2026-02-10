import { Page, Locator } from '@playwright/test'

/**
 * Login Page Object Model
 * 登录页面的封装
 */
export class LoginPage {
    readonly page: Page
    readonly identifierInput: Locator
    readonly passwordInput: Locator
    readonly submitButton: Locator
    readonly errorMessage: Locator

    constructor(page: Page) {
        this.page = page
        this.identifierInput = page.getByLabel('账号（邮箱 / 手机号 / 用户名）')
        this.passwordInput = page.getByLabel('密码')
        this.submitButton = page.getByRole('button', { name: '登录' })
        this.errorMessage = page.locator('[data-testid="login-error"]').or(
            page.getByText('账号或密码错误')
        )
    }

    async goto() {
        await this.page.goto('/site-login')
    }

    async login(identifier: string, password: string) {
        await this.identifierInput.fill(identifier)
        await this.passwordInput.fill(password)
        await this.submitButton.click()
    }

    async waitForLoginSuccess() {
        await this.page.waitForURL('/')
    }

    async getErrorMessageText(): Promise<string | null> {
        try {
            await this.errorMessage.waitFor({ timeout: 5000 })
            return this.errorMessage.textContent()
        } catch {
            return null
        }
    }

    async isLoginButtonDisabled(): Promise<boolean> {
        return this.submitButton.isDisabled()
    }

    async isLoginButtonLoading(): Promise<boolean> {
        const text = await this.submitButton.textContent()
        return text?.includes('登录中') ?? false
    }
}
