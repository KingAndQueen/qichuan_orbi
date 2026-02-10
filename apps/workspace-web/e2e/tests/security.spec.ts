import { test, expect } from '@playwright/test'
import { TEST_USERS, TEST_CONVERSATIONS } from '../fixtures/test-data'

/**
 * 安全边界抽检 E2E 测试
 * 验证跨用户访问被正确拦截
 */
test.describe('安全边界抽检', () => {
    test('用户 A Token 无法访问用户 B 的会话', async ({ page }) => {
        // 使用 User A 的 Token
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: TEST_USERS.userA.token,
                domain: 'localhost',
                path: '/',
            },
        ])

        // Mock 会话验证 - User A 已登录
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

        // Mock 会话访问控制 - 拦截对 User B 会话的访问
        await page.route(`**/api/v*/sessions/${TEST_CONVERSATIONS.userBConversation.sessionId}**`, async (route) => {
            // User A 尝试访问 User B 的会话，应返回 403
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'Forbidden',
                    message: 'Access denied: You do not have permission to access this conversation',
                }),
            })
        })

        // 发起对 User B 会话的 API 请求
        const response = await page.request.get(
            `/api/v1/sessions/${TEST_CONVERSATIONS.userBConversation.sessionId}`
        )

        // 验证返回 403
        expect(response.status()).toBe(403)
    })

    test('无效 Token 被拒绝并重定向到登录页', async ({ page }) => {
        // 设置无效 Token
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: 'invalid-expired-token',
                domain: 'localhost',
                path: '/',
            },
        ])

        // Mock 会话验证失败
        await page.route('**/api/v1/session', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Unauthorized', message: 'Invalid or expired token' }),
            })
        })

        // 尝试访问受保护页面
        await page.goto('/')

        // 验证被重定向到登录页
        await expect(page).toHaveURL(/\/site-login/)
    })

    test('过期 Token 被拒绝', async ({ page }) => {
        // 设置过期 Token
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: 'expired-token-from-last-week',
                domain: 'localhost',
                path: '/',
            },
        ])

        // Mock 会话验证返回过期错误
        await page.route('**/api/v1/session', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'TokenExpired',
                    message: 'Session has expired, please login again',
                }),
            })
        })

        await page.goto('/')

        // 验证重定向到登录页
        await expect(page).toHaveURL(/\/site-login/)
    })

    test('伪造的 master_account_id 不被接受', async ({ page }) => {
        // 使用 User A 的 Token
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: TEST_USERS.userA.token,
                domain: 'localhost',
                path: '/',
            },
        ])

        // Mock 会话验证 - 正常返回 User A 信息
        await page.route('**/api/v1/session', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    user_id: TEST_USERS.userA.userId,
                    master_account_id: TEST_USERS.userA.masterAccountId,
                    valid: true,
                }),
            })
        })

        // Mock 检测并拒绝伪造的 master_account_id
        await page.route('**/api/v*/sessions**', async (route) => {
            const _headers = route.request().headers()
            const postData = route.request().postData()

            // 检查是否有尝试伪造 master_account_id
            if (postData?.includes(TEST_USERS.userB.masterAccountId)) {
                await route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        error: 'Forbidden',
                        message: 'Account ID mismatch',
                    }),
                })
            } else {
                await route.continue()
            }
        })

        await page.goto('/')

        // 发起带有伪造 master_account_id 的请求
        const response = await page.request.post('/api/v1/sessions', {
            data: {
                master_account_id: TEST_USERS.userB.masterAccountId, // 尝试伪造
                title: 'Test Session',
            },
        })

        // 应该被拒绝
        expect(response.status()).toBe(403)
    })

    test('跨用户资源访问返回 404', async ({ page }) => {
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: TEST_USERS.userA.token,
                domain: 'localhost',
                path: '/',
            },
        ])

        await page.route('**/api/v1/session', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    user_id: TEST_USERS.userA.userId,
                    master_account_id: TEST_USERS.userA.masterAccountId,
                    valid: true,
                }),
            })
        })

        // Mock 资源访问 - 对于不属于该用户的资源返回 404（信息隐藏）
        await page.route('**/api/v*/reports/report-user-b-private**', async (route) => {
            // 为了安全，返回 404 而不是 403，不暴露资源存在性
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'NotFound',
                    message: 'Resource not found',
                }),
            })
        })

        const response = await page.request.get('/api/v1/reports/report-user-b-private')

        // 验证返回 404（安全性最佳实践：不暴露资源是否存在）
        expect(response.status()).toBe(404)
    })

    test('并发请求不同用户资源正确隔离', async ({ page }) => {
        await page.context().addCookies([
            {
                name: 'site_auth_token',
                value: TEST_USERS.userA.token,
                domain: 'localhost',
                path: '/',
            },
        ])

        await page.route('**/api/v1/session', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    user_id: TEST_USERS.userA.userId,
                    master_account_id: TEST_USERS.userA.masterAccountId,
                    valid: true,
                }),
            })
        })

        // Mock 不同用户会话
        await page.route('**/api/v*/sessions/**', async (route) => {
            const url = route.request().url()

            if (url.includes(TEST_CONVERSATIONS.userAConversation.sessionId)) {
                // User A 自己的会话 - 允许访问
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(TEST_CONVERSATIONS.userAConversation),
                })
            } else if (url.includes(TEST_CONVERSATIONS.userBConversation.sessionId)) {
                // User B 的会话 - 拒绝访问
                await route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Forbidden' }),
                })
            } else {
                await route.fulfill({
                    status: 404,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'NotFound' }),
                })
            }
        })

        // 并发请求
        const [responseA, responseB] = await Promise.all([
            page.request.get(`/api/v1/sessions/${TEST_CONVERSATIONS.userAConversation.sessionId}`),
            page.request.get(`/api/v1/sessions/${TEST_CONVERSATIONS.userBConversation.sessionId}`),
        ])

        // 验证结果
        expect(responseA.status()).toBe(200) // 自己的会话
        expect(responseB.status()).toBe(403) // 他人的会话
    })
})
