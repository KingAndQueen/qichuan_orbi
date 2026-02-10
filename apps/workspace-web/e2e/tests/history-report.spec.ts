import { test, expect } from '@playwright/test'
import { createMockApiHelper } from '../fixtures/mock-api.fixture'
import { TEST_USERS, MOCK_HISTORY_REPORTS } from '../fixtures/test-data'

/**
 * 历史报告持久化断言 E2E 测试
 * 验证任务完成后点击"查看历史报告"显示的数据与后台一致
 */
test.describe('结果持久化断言', () => {
    test.beforeEach(async ({ page }) => {
        // 设置已登录状态
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: TEST_USERS.userA.token,
                domain: 'localhost',
                path: '/',
            },
        ])

        const mockApi = createMockApiHelper(page)
        await mockApi.mockSessionApi(true, TEST_USERS.userA.userId)
        await mockApi.mockHistoryReportsApi()
    })

    test('历史报告页面正确显示报告列表', async ({ page }) => {
        // Mock 历史报告 API
        await page.route('**/api/v*/reports**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: MOCK_HISTORY_REPORTS,
                    total: MOCK_HISTORY_REPORTS.length,
                    page: 1,
                    pageSize: 10,
                }),
            })
        })

        // 导航到历史报告页面（假设入口在 /activity 或类似路径）
        await page.goto('/activity')

        // 验证报告标题显示
        for (const report of MOCK_HISTORY_REPORTS) {
            await expect(page.getByText(report.title)).toBeVisible({ timeout: 10000 })
        }
    })

    test('报告详情数据与 API 响应一致', async ({ page }) => {
        const targetReport = MOCK_HISTORY_REPORTS[0]

        // Mock 单个报告详情 API
        await page.route(`**/api/v*/reports/${targetReport.id}`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(targetReport),
            })
        })

        // Mock 报告列表
        await page.route('**/api/v*/reports', async (route) => {
            if (!route.request().url().includes(targetReport.id)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: MOCK_HISTORY_REPORTS,
                        total: MOCK_HISTORY_REPORTS.length,
                    }),
                })
            } else {
                await route.continue()
            }
        })

        await page.goto('/activity')

        // 点击第一个报告查看详情
        await page.getByText(targetReport.title).click()

        // 验证关键数据显示正确
        // 注：具体断言取决于实际 UI 实现
        await expect(page.getByText(targetReport.summary)).toBeVisible({ timeout: 10000 })
    })

    test('空报告列表显示提示信息', async ({ page }) => {
        // Mock 空列表
        await page.route('**/api/v*/reports**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [],
                    total: 0,
                    page: 1,
                    pageSize: 10,
                }),
            })
        })

        await page.goto('/activity')

        // 验证显示空状态提示（具体文案取决于实现）
        await expect(
            page.getByText(/暂无|没有|empty|no data/i)
        ).toBeVisible({ timeout: 10000 })
    })

    test('报告数据格式化正确显示', async ({ page }) => {
        const targetReport = MOCK_HISTORY_REPORTS[0]

        await page.route('**/api/v*/reports**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: MOCK_HISTORY_REPORTS,
                    total: MOCK_HISTORY_REPORTS.length,
                }),
            })
        })

        await page.goto('/activity')

        // 验证营收数据格式化显示（如千分位、货币符号等）
        // 注：具体格式取决于 UI 实现
        const formattedRevenue = (targetReport.totalRevenue / 10000).toFixed(0)
        await expect(
            page.getByText(new RegExp(`${formattedRevenue}|5940000|594万`, 'i'))
        ).toBeVisible({ timeout: 10000 })
    })

    test('报告加载失败显示错误提示', async ({ page }) => {
        // Mock API 失败
        await page.route('**/api/v*/reports**', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal Server Error' }),
            })
        })

        await page.goto('/activity')

        // 验证显示错误提示
        await expect(
            page.getByText(/错误|失败|error|failed/i)
        ).toBeVisible({ timeout: 10000 })
    })
})
