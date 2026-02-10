import { createServer, IncomingMessage, ServerResponse } from 'http'
import { TEST_USERS } from './fixtures/test-data'

let server: ReturnType<typeof createServer> | null = null

/**
 * 检查端口是否可用
 */
function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const testServer = createServer()
        testServer.once('error', () => {
            resolve(false)
        })
        testServer.once('listening', () => {
            testServer.close(() => resolve(true))
        })
        testServer.listen(port)
    })
}

/**
 * Mock Auth Server
 * 模拟 Go Auth Service 用于 E2E 测试
 * 
 * API 契约对照：
 * - /api/v1/session (GET) - 会话验证，参考 middleware.ts:40
 * - /api/v1/login (POST)  - 登录认证，参考 actions.ts:55
 */
async function globalSetup() {
    // 检查端口是否可用
    const portAvailable = await isPortAvailable(5175)
    if (!portAvailable) {
        console.log('⚠️ Port 5175 already in use, skipping mock server setup')
        return
    }

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = req.url || ''

        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Workspace-Client')

        if (req.method === 'OPTIONS') {
            res.writeHead(204)
            res.end()
            return
        }

        // Session 验证接口 - GET /api/v1/session
        // 对应 middleware.ts:40 的调用
        if (url.includes('/api/v1/session') && req.method === 'GET') {
            const authHeader = req.headers.authorization || ''
            const token = authHeader.replace('Bearer ', '')

            if (token === TEST_USERS.userA.token) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                    user_id: TEST_USERS.userA.userId,
                    master_account_id: TEST_USERS.userA.masterAccountId,
                    email: TEST_USERS.userA.identifier,
                    valid: true,
                }))
            } else if (token === TEST_USERS.userB.token) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                    user_id: TEST_USERS.userB.userId,
                    master_account_id: TEST_USERS.userB.masterAccountId,
                    email: TEST_USERS.userB.identifier,
                    valid: true,
                }))
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }))
            }
            return
        }

        // 登录接口 - POST /api/v1/login
        // 对应 actions.ts:55 的调用
        // 请求格式: { identifier, identifierType, password }
        // 响应格式: { token, jwtToken?, expiresInSeconds } (成功)
        //          { message, code? } (失败)
        if (url.includes('/api/v1/login') && req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => { body += chunk.toString() })
            req.on('end', () => {
                try {
                    const data = JSON.parse(body)
                    const identifier = data.identifier || ''
                    const password = data.password || ''

                    if (identifier === TEST_USERS.userA.identifier && password === TEST_USERS.userA.password) {
                        res.writeHead(200, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({
                            token: TEST_USERS.userA.token,
                            expiresInSeconds: 86400, // 24 hours
                        }))
                    } else if (identifier === TEST_USERS.userB.identifier && password === TEST_USERS.userB.password) {
                        res.writeHead(200, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({
                            token: TEST_USERS.userB.token,
                            expiresInSeconds: 86400,
                        }))
                    } else {
                        // 登录失败 - 参考 actions.ts:77
                        res.writeHead(401, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({
                            message: '账号或密码错误',
                            code: 'invalid_credentials'
                        }))
                    }
                } catch {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ error: 'Bad Request' }))
                }
            })
            return
        }

        // 默认 404
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not Found' }))
    })

    await new Promise<void>((resolve) => {
        server!.listen(5175, () => {
            console.log('🔧 Mock Auth Server started on http://localhost:5175')
            resolve()
        })
    })
}

export default globalSetup
