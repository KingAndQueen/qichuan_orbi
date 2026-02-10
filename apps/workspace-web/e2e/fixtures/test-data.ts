/**
 * 测试数据定义
 * E2E 测试使用的 mock 数据和配置
 */

export const TEST_USERS = {
    userA: {
        identifier: 'test-user-a@example.com',
        password: 'TestPassword123!',
        userId: 'user-id-a-001',
        masterAccountId: 'master-account-a',
        token: 'mock-token-user-a-valid',
    },
    userB: {
        identifier: 'test-user-b@example.com',
        password: 'TestPassword456!',
        userId: 'user-id-b-002',
        masterAccountId: 'master-account-b',
        token: 'mock-token-user-b-valid',
    },
}

export const TEST_CONVERSATIONS = {
    userAConversation: {
        conversationId: 'conv-user-a-001',
        sessionId: 'session-user-a-001',
        title: 'User A 的财务分析会话',
        ownerId: TEST_USERS.userA.userId,
    },
    userBConversation: {
        conversationId: 'conv-user-b-001',
        sessionId: 'session-user-b-001',
        title: 'User B 的私有会话',
        ownerId: TEST_USERS.userB.userId,
    },
}

export const TEST_WORKFLOWS = {
    financialAssistant: {
        id: 'w-financial-assistant',
        name: '财务分析助手',
        description: '智能财务报表分析与洞察生成',
        category: 'internal',
        price: 99,
        trialCount: 3,
        icon: '📊',
    },
    crisisPR: {
        id: 'w-crisis-pr',
        name: '危机公关助手',
        description: '快速响应舆情危机',
        category: 'customer_driven',
        price: 99,
        trialCount: 3,
        icon: '🛡️',
    },
}

export const MOCK_FINANCIAL_DATA = `
请分析以下财务数据：
- Q1 营收：¥1,250,000
- Q2 营收：¥1,480,000
- Q3 营收：¥1,320,000
- Q4 营收：¥1,890,000
请生成季度对比分析报告。
`

export const MOCK_TASK_STEPS = [
    { stepName: '解析财务数据', status: 'succeeded' as const, progress: 100 },
    { stepName: '计算季度增长率', status: 'succeeded' as const, progress: 100 },
    { stepName: '生成可视化图表', status: 'running' as const, progress: 60 },
    { stepName: '撰写分析报告', status: 'pending' as const, progress: 0 },
]

export const MOCK_HISTORY_REPORTS = [
    {
        id: 'report-001',
        title: 'Q4 财务分析报告',
        createdAt: '2026-01-30T10:00:00Z',
        summary: '全年营收同比增长 18%，Q4 表现最佳',
        totalRevenue: 5940000,
        growthRate: 18.5,
    },
    {
        id: 'report-002',
        title: 'Q3 财务分析报告',
        createdAt: '2026-01-15T10:00:00Z',
        summary: 'Q3 营收小幅回落，需关注成本控制',
        totalRevenue: 4050000,
        growthRate: -10.8,
    },
]
