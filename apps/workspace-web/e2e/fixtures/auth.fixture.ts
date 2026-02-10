import { test as base, expect, Page } from '@playwright/test'
import { TEST_USERS } from './test-data'

type AuthFixtures = {
    authenticatedPage: Page
    loginAsUserA: () => Promise<void>
    loginAsUserB: () => Promise<void>
}

/**
 * 认证 Fixture
 * 提供已登录状态的页面及登录辅助方法
 */
export const test = base.extend<AuthFixtures>({
    authenticatedPage: async ({ page }, use) => {
        // 设置认证 cookie 模拟已登录状态
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: TEST_USERS.userA.token,
                domain: 'localhost',
                path: '/',
            },
        ])

        // Mock 会话验证接口
        await page.route('**/api/v1/session', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    user_id: TEST_USERS.userA.userId,
                    master_account_id: TEST_USERS.userA.masterAccountId,
                    email: TEST_USERS.userA.identifier,
                    valid: true,
                }),
            })
        })

        await use(page)
    },

    loginAsUserA: async ({ page }, use) => {
        const login = async () => {
            await page.goto('/site-login')
            await page.getByLabel('账号（邮箱 / 手机号 / 用户名）').fill(TEST_USERS.userA.identifier)
            await page.getByLabel('密码').fill(TEST_USERS.userA.password)
            await page.getByRole('button', { name: '登录' }).click()
            await page.waitForURL('/')
        }
        await use(login)
    },

    loginAsUserB: async ({ page }, use) => {
        const login = async () => {
            await page.goto('/site-login')
            await page.getByLabel('账号（邮箱 / 手机号 / 用户名）').fill(TEST_USERS.userB.identifier)
            await page.getByLabel('密码').fill(TEST_USERS.userB.password)
            await page.getByRole('button', { name: '登录' }).click()
            await page.waitForURL('/')
        }
        await use(login)
    },
})

export { expect }
