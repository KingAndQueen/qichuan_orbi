import { Page } from '@playwright/test'
import {
    TEST_USERS,
    TEST_CONVERSATIONS,
    MOCK_HISTORY_REPORTS
} from './test-data'

/**
 * Mock API Helper
 * 提供常用 API 的 Mock 封装
 */
export class MockApiHelper {
    constructor(private page: Page) { }

    /**
     * Mock 登录 API
     */
    async mockLoginApi(options: { success?: boolean; errorMessage?: string } = {}) {
        const { success = true, errorMessage = '账号或密码错误' } = options

        await this.page.route('**/site-login', async (route) => {
            if (route.request().method() === 'POST') {
                // 这是 server action，返回重定向或错误
                if (success) {
                    await route.fulfill({
                        status: 303,
                        headers: {
                            'Set-Cookie': `site_auth_token=${TEST_USERS.userA.token}; Path=/; HttpOnly`,
                            Location: '/',
                        },
                    })
                } else {
                    await route.fulfill({
                        status: 200,
                        contentType: 'text/html',
                        body: `<html><body>${errorMessage}</body></html>`,
                    })
                }
            } else {
                await route.continue()
            }
        })
    }

    /**
     * Mock 会话验证 API
     */
    async mockSessionApi(valid: boolean = true, userId: string = TEST_USERS.userA.userId) {
        await this.page.route('**/api/v1/session', async (route) => {
            if (valid) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        user_id: userId,
                        master_account_id: TEST_USERS.userA.masterAccountId,
                        email: TEST_USERS.userA.identifier,
                        valid: true,
                    }),
                })
            } else {
                await route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Unauthorized' }),
                })
            }
        })
    }

    /**
     * Mock WebSocket Ticket API
     */
    async mockWsTicketApi() {
        await this.page.route('**/api/agent/ws-ticket', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ticket: 'mock-ws-ticket-for-e2e-test',
                }),
            })
        })
    }

    /**
     * Mock 会话/对话 API
     */
    async mockConversationApi(ownerId: string = TEST_USERS.userA.userId) {
        // Mock 获取会话详情
        await this.page.route('**/api/v*/sessions/**', async (route) => {
            const url = route.request().url()
            const sessionMatch = url.match(/sessions\/([^/]+)/)
            const sessionId = sessionMatch?.[1]

            // 检查会话归属
            const conversation = Object.values(TEST_CONVERSATIONS).find(
                (c) => c.sessionId === sessionId
            )

            if (conversation && conversation.ownerId !== ownerId) {
                // 跨用户访问，返回 403
                await route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Forbidden', message: 'Access denied' }),
                })
            } else if (conversation) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(conversation),
                })
            } else {
                await route.fulfill({
                    status: 404,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Not found' }),
                })
            }
        })
    }

    /**
     * Mock 历史报告 API
     */
    async mockHistoryReportsApi() {
        await this.page.route('**/api/v*/reports**', async (route) => {
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
    }

    /**
     * Mock 所有通用 API
     */
    async mockAllApis() {
        await this.mockSessionApi()
        await this.mockWsTicketApi()
        await this.mockConversationApi()
        await this.mockHistoryReportsApi()
    }
}

/**
 * 创建 Mock API Helper 实例
 */
export function createMockApiHelper(page: Page): MockApiHelper {
    return new MockApiHelper(page)
}
