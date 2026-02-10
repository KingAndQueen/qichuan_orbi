import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { GatewayEnvelope } from '../types/conversation'

// --- 更健壮的 Mock WebSocket ---
class MockWebSocket {
    static instances: MockWebSocket[] = []
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3

    // 实例属性
    url: string
    readyState: number = 0
    onopen: (() => void) | null = null
    onmessage: ((e: any) => void) | null = null
    onclose: ((e: any) => void) | null = null
    onerror: ((e: any) => void) | null = null
    send = vi.fn()
    close = vi.fn()

    constructor(url: string) {
        this.url = url
        MockWebSocket.instances.push(this)

        // 关键：立即设置为 OPEN 并同步触发 onopen
        // 这样测试更可预测
        queueMicrotask(() => {
            this.readyState = MockWebSocket.OPEN
            this.onopen?.()
        })
    }

    // 辅助测试方法
    emitMessage(data: object) {
        this.onmessage?.({ data: JSON.stringify(data) })
    }

    emitError(err: any) {
        this.onerror?.(err)
    }
}

describe('AgentClient', () => {
    let AgentClient: any
    const originalFetch = global.fetch

    beforeEach(async () => {
        // 1. 清空实例
        MockWebSocket.instances = []

        // 2. Mock WebSocket
        vi.stubGlobal('WebSocket', MockWebSocket)

        // 3. Mock Fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ticket: 'mock-ticket-123' })
        } as Response)

        // 4. 重新导入 AgentClient 以重置模块状态
        vi.resetModules()
        const mod = await import('./agent-client')
        AgentClient = mod.AgentClient
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        global.fetch = originalFetch
    })

    describe('connect', () => {
        it('should fetch ticket and connect to WebSocket', async () => {
            const promise = AgentClient.connect()

            // 验证 Fetch 被调用
            expect(global.fetch).toHaveBeenCalledWith('/api/agent/ws-ticket', expect.anything())

            // 等待 WebSocket 实例化
            await waitFor(() => {
                expect(MockWebSocket.instances.length).toBe(1)
            })

            // 验证 URL
            const ws = MockWebSocket.instances[0]
            expect(ws.url).toContain('ticket=mock-ticket-123')
            expect(ws.url).toContain('/ws/agent')

            // 等待连接成功
            await promise
            expect(ws.readyState).toBe(MockWebSocket.OPEN)
        })

        it('should reuse existing connection (singleton behavior)', async () => {
            // 第一次连接
            const p1 = AgentClient.connect()
            // 第二次连接（应该复用）
            const p2 = AgentClient.connect()

            // 关键验证：fetch 只调用了一次（证明复用了连接）
            expect(global.fetch).toHaveBeenCalledTimes(1)

            // 等待都完成
            await Promise.all([p1, p2])

            // 验证只创建了一个 WebSocket
            expect(MockWebSocket.instances.length).toBe(1)
        })

        it('should throw error if ticket fetch fails', async () => {
            // Mock fetch 失败
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            } as Response)

            await expect(AgentClient.connect()).rejects.toThrow(/Ticket failed/i)
        })
    })

    describe('send', () => {
        it('should connect automatically if not connected', async () => {
            const msg: GatewayEnvelope = {
                event: 'test',
                version: '2.0',
                conversationId: 'c1',
                payload: {}
            }

            // 直接调用 send，内部应该触发 connect
            await AgentClient.send(msg)

            // 验证是否触发了连接逻辑
            expect(global.fetch).toHaveBeenCalled()

            // 验证是否发送了数据
            await waitFor(() => {
                const ws = MockWebSocket.instances[0]
                expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg))
            })
        })

        it('should send correct JSON payload', async () => {
            // 先连接
            await AgentClient.connect()

            const msg: GatewayEnvelope = {
                event: 'user_message',
                version: '2.0',
                conversationId: 'c1',
                payload: { text: 'hello' }
            }

            await AgentClient.send(msg)

            const ws = MockWebSocket.instances[0]
            expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg))
        })
    })

    describe('onMessage', () => {
        it('should receive and parse messages', async () => {
            const handler = vi.fn()
            AgentClient.onMessage(handler)

            await AgentClient.connect()

            await waitFor(() => {
                expect(MockWebSocket.instances.length).toBe(1)
            })

            const ws = MockWebSocket.instances[0]

            // 模拟收到消息
            const eventData = { event: 'pong', payload: { ok: true } }
            ws.emitMessage(eventData)

            expect(handler).toHaveBeenCalledWith(expect.objectContaining(eventData))
        })
    })
})
