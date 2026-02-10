import { test, expect, Page } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { TEST_USERS } from '../fixtures/test-data'

/**
 * 设置已登录状态的 Mock
 */
async function setupAuthenticatedMocks(page: Page) {
    // Mock 会话验证 API - 必须在导航前设置
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
}

/**
 * 身份认证 E2E 测试
 * 对应 release-testing.md E2E-001
 */
test.describe('身份认证 (E2E-001)', () => {
    test.beforeEach(async ({ page }) => {
        // 清除所有 cookies 确保干净状态
        await page.context().clearCookies()
    })

    test('登录成功并跳转到工作台', async ({ page }) => {
        const loginPage = new LoginPage(page)

        // 先设置会话验证 Mock
        await setupAuthenticatedMocks(page)

        // Mock 登录 Server Action - 返回重定向
        await page.route('**/site-login', async (route) => {
            if (route.request().method() === 'POST') {
                // 设置 cookie
                await page.context().addCookies([
                    {
                        name: 'site_auth_token',
                        value: TEST_USERS.userA.token,
                        domain: 'localhost',
                        path: '/',
                    },
                ])
                // 返回重定向响应
                await route.fulfill({
                    status: 302,
                    headers: {
                        Location: 'http://localhost:5174/',
                        'Set-Cookie': `site_auth_token=${TEST_USERS.userA.token}; Path=/`,
                    },
                })
            } else {
                await route.continue()
            }
        })

        // 执行登录
        await loginPage.goto()
        await loginPage.login(TEST_USERS.userA.identifier, TEST_USERS.userA.password)

        // 等待页面跳转完成（给一点时间处理重定向）
        await page.waitForTimeout(1000)

        // 验证不再在登录页
        const url = page.url()
        expect(url).not.toContain('/site-login')
    })

    test('登录失败显示错误提示', async ({ page }) => {
        const loginPage = new LoginPage(page)

        await loginPage.goto()
        await loginPage.login(TEST_USERS.userA.identifier, 'wrong-password')

        // 验证错误提示显示（等待更长时间）
        await expect(page.getByText('账号或密码错误')).toBeVisible({ timeout: 15000 })
    })

    test('刷新页面保持登录态', async ({ page }) => {
        // 先设置 Mock（在 cookie 和导航之前）
        await setupAuthenticatedMocks(page)

        // 设置已登录状态 cookie
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: TEST_USERS.userA.token,
                domain: 'localhost',
                path: '/',
            },
        ])

        // 访问首页
        await page.goto('/')

        // 验证在首页（URL 不包含 site-login）
        await page.waitForTimeout(500)
        expect(page.url()).not.toContain('/site-login')

        // 刷新页面
        await page.reload()

        // 验证仍在首页
        await page.waitForTimeout(500)
        expect(page.url()).not.toContain('/site-login')
    })

    test('未登录访问受保护页面重定向到登录页', async ({ page }) => {
        // 确保没有 cookie
        await page.context().clearCookies()

        // Mock 会话验证失败
        await page.route('**/api/v1/session', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Unauthorized' }),
            })
        })

        // 尝试访问受保护页面
        await page.goto('/')

        // 验证被重定向到登录页
        await expect(page).toHaveURL(/\/site-login/)
    })

    test('登录按钮在提交时显示加载状态', async ({ page }) => {
        const loginPage = new LoginPage(page)

        // Mock 慢响应
        await page.route('**/site-login', async (route) => {
            if (route.request().method() === 'POST') {
                await new Promise((resolve) => setTimeout(resolve, 2000))
                await route.continue()
            } else {
                await route.continue()
            }
        })

        await loginPage.goto()
        await loginPage.identifierInput.fill(TEST_USERS.userA.identifier)
        await loginPage.passwordInput.fill(TEST_USERS.userA.password)

        // 点击登录按钮
        await loginPage.submitButton.click()

        // 验证按钮显示加载状态
        await expect(loginPage.submitButton).toBeDisabled()
        await expect(loginPage.submitButton).toContainText('登录中')
    })
})
