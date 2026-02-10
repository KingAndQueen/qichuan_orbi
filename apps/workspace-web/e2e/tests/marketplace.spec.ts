import { test, expect, Page } from '@playwright/test'
import { MarketplacePage } from '../pages/marketplace.page'
import { TEST_USERS } from '../fixtures/test-data'

/**
 * 设置已登录状态
 */
async function setupAuth(page: Page) {
    // Mock 会话验证 API
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

    // 设置 cookie
    await page.context().addCookies([
        {
            name: 'site_auth_token',
            value: TEST_USERS.userA.token,
            domain: 'localhost',
            path: '/',
        },
    ])
}

/**
 * 工作流市场订阅 E2E 测试
 * 对应 release-testing.md E2E-040
 * 
 * 实际工作流（来自 lib/store/marketplace.ts）:
 * - customer_driven: 危机公关助手, 客户服务优化
 * - internal_driven: 会议纪要生成器, 周报月报助手
 * - strategic_driven: 市场分析助手, 战略规划顾问
 */
test.describe('业务订阅 (E2E-040)', () => {
    test.beforeEach(async ({ page }) => {
        await setupAuth(page)
        // 清除 localStorage 确保干净状态
        await page.addInitScript(() => {
            localStorage.clear()
        })
    })

    test('访问 Marketplace 并查看工作流列表', async ({ page }) => {
        const marketplace = new MarketplacePage(page)

        await marketplace.goto()
        await marketplace.waitForLoad()

        // 验证页面标题
        await expect(marketplace.pageTitle).toBeVisible()

        // 验证分类 Tab 存在
        await expect(marketplace.customerDrivenTab).toBeVisible()
        await expect(marketplace.internalTab).toBeVisible()
        await expect(marketplace.strategicTab).toBeVisible()
    })

    test('默认显示客户需求驱动分类', async ({ page }) => {
        const marketplace = new MarketplacePage(page)

        await marketplace.goto()
        await marketplace.waitForLoad()

        // 验证显示客户需求驱动类工作流
        await expect(page.getByText('危机公关助手')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('客户服务优化')).toBeVisible()
    })

    test('切换分类显示对应工作流', async ({ page }) => {
        const marketplace = new MarketplacePage(page)

        await marketplace.goto()
        await marketplace.waitForLoad()

        // 切换到内部使用驱动分类
        await marketplace.switchToInternalCategory()

        // 验证显示内部使用类工作流
        await expect(page.getByText('会议纪要生成器')).toBeVisible({ timeout: 5000 })
        await expect(page.getByText('周报月报助手')).toBeVisible()

        // 验证客户驱动类工作流不显示
        await expect(page.getByText('危机公关助手')).not.toBeVisible()
    })

    test('开始试用工作流显示剩余次数', async ({ page }) => {
        const marketplace = new MarketplacePage(page)

        // Mock window.alert
        await page.addInitScript(() => {
            window.alert = (msg: string) => console.log('Alert:', msg)
        })

        await marketplace.goto()
        await marketplace.waitForLoad()

        // 找到并点击试用按钮 - 按钮文本是 "免费试用 (3次)"
        const trialButton = page.getByRole('button', { name: /免费试用/ }).first()
        await trialButton.click()

        // 验证按钮变为"继续使用"并显示剩余次数 - 文本是 "继续使用 (剩余3次)"
        await expect(page.getByRole('button', { name: /继续使用/ })).toBeVisible({ timeout: 5000 })
    })

    test('订阅工作流显示已订阅状态', async ({ page }) => {
        const marketplace = new MarketplacePage(page)

        // Mock window.confirm 返回 true（确认订阅）
        await page.addInitScript(() => {
            window.confirm = () => true
            window.alert = (msg: string) => console.log('Alert:', msg)
        })

        await marketplace.goto()
        await marketplace.waitForLoad()

        // 找到并点击订阅按钮 - 按钮文本是 "订阅 ¥99/月"
        const subscribeButton = page.getByRole('button', { name: /订阅 ¥/ }).first()
        await subscribeButton.click()

        // 验证显示已订阅徽章
        await expect(page.getByText('✓ 已订阅')).toBeVisible({ timeout: 5000 })
    })

    test('取消订阅确认不会订阅', async ({ page }) => {
        const marketplace = new MarketplacePage(page)

        // Mock window.confirm 返回 false（取消订阅）
        await page.addInitScript(() => {
            window.confirm = () => false
            window.alert = (msg: string) => console.log('Alert:', msg)
        })

        await marketplace.goto()
        await marketplace.waitForLoad()

        // 找到并点击订阅按钮
        const subscribeButton = page.getByRole('button', { name: /订阅 ¥/ }).first()
        await subscribeButton.click()

        // 验证没有显示已订阅徽章
        await expect(page.getByText('✓ 已订阅')).not.toBeVisible()
    })

    test('订阅状态在页面刷新后持久化', async ({ page }) => {
        const marketplace = new MarketplacePage(page)

        // Mock window.confirm 返回 true
        await page.addInitScript(() => {
            window.confirm = () => true
            window.alert = (msg: string) => console.log('Alert:', msg)
        })

        await marketplace.goto()
        await marketplace.waitForLoad()

        // 开始试用
        const trialButton = page.getByRole('button', { name: /免费试用/ }).first()
        await trialButton.click()

        // 等待状态更新
        await expect(page.getByRole('button', { name: /继续使用/ })).toBeVisible({ timeout: 5000 })

        // 刷新页面
        await page.reload()

        // 验证状态持久化
        await expect(page.getByRole('button', { name: /继续使用/ })).toBeVisible({ timeout: 5000 })
    })

    test('切换分类不丢失用户状态', async ({ page }) => {
        const marketplace = new MarketplacePage(page)

        await page.addInitScript(() => {
            window.alert = (msg: string) => console.log('Alert:', msg)
        })

        await marketplace.goto()
        await marketplace.waitForLoad()

        // 开始试用客户驱动类工作流
        const trialButton = page.getByRole('button', { name: /免费试用/ }).first()
        await trialButton.click()

        // 等待状态更新
        await expect(page.getByRole('button', { name: /继续使用/ })).toBeVisible({ timeout: 5000 })

        // 切换到内部使用分类
        await marketplace.switchToInternalCategory()
        await expect(page.getByText('会议纪要生成器')).toBeVisible({ timeout: 5000 })

        // 切换回客户驱动分类
        await marketplace.switchToCustomerDrivenCategory()

        // 验证试用状态仍然保持
        await expect(page.getByRole('button', { name: /继续使用/ })).toBeVisible({ timeout: 5000 })
    })
})
