import { Page, Locator } from '@playwright/test'

/**
 * Marketplace Page Object Model
 * 工作流市场页面的封装
 * 
 * 对照 components/marketplace/WorkflowCard.tsx 和 CategoryTabs.tsx
 */
export class MarketplacePage {
    readonly page: Page
    readonly pageTitle: Locator
    readonly customerDrivenTab: Locator
    readonly internalTab: Locator
    readonly strategicTab: Locator
    readonly workflowCards: Locator

    constructor(page: Page) {
        this.page = page
        // 页面标题 - 对应 marketplace/page.tsx:110-112
        this.pageTitle = page.getByRole('heading', { name: '工作流市场' })
        // 分类 Tab - 对应 CategoryTabs.tsx 使用 role="tab"
        this.customerDrivenTab = page.getByRole('tab', { name: '客户需求驱动' })
        this.internalTab = page.getByRole('tab', { name: '内部使用驱动' })
        this.strategicTab = page.getByRole('tab', { name: '战略规划驱动' })
        // 工作流卡片 - WorkflowCard.tsx 使用 div.rounded-lg
        this.workflowCards = page.locator('.rounded-lg.border').filter({
            has: page.getByRole('button')
        })
    }

    async goto() {
        await this.page.goto('/marketplace')
    }

    async waitForLoad() {
        await this.pageTitle.waitFor({ timeout: 10000 })
    }

    async switchToCustomerDrivenCategory() {
        await this.customerDrivenTab.click()
    }

    async switchToInternalCategory() {
        await this.internalTab.click()
    }

    async switchToStrategicCategory() {
        await this.strategicTab.click()
    }

    getWorkflowCard(workflowName: string): Locator {
        // 通过卡片中的标题文字找到卡片
        return this.page.locator('.rounded-lg.border').filter({
            has: this.page.getByRole('heading', { name: workflowName }),
        })
    }

    getTrialButton(workflowName: string): Locator {
        const card = this.getWorkflowCard(workflowName)
        // 按钮文本格式：免费试用 (3次)
        return card.getByRole('button', { name: /免费试用/ })
    }

    getSubscribeButton(workflowName?: string): Locator {
        if (workflowName) {
            const card = this.getWorkflowCard(workflowName)
            return card.getByRole('button', { name: /订阅 ¥/ })
        }
        // 获取页面上第一个订阅按钮
        return this.page.getByRole('button', { name: /订阅 ¥/ }).first()
    }

    getContinueUseButton(workflowName?: string): Locator {
        if (workflowName) {
            const card = this.getWorkflowCard(workflowName)
            return card.getByRole('button', { name: /继续使用/ })
        }
        return this.page.getByRole('button', { name: /继续使用/ }).first()
    }

    getSubscribedBadge(workflowName?: string): Locator {
        if (workflowName) {
            const card = this.getWorkflowCard(workflowName)
            return card.getByText('✓ 已订阅')
        }
        return this.page.getByText('✓ 已订阅').first()
    }

    async startTrial(workflowName: string) {
        const button = this.getTrialButton(workflowName)
        await button.click()
    }

    async subscribe(workflowName: string) {
        const button = this.getSubscribeButton(workflowName)
        await button.click()
    }

    async isWorkflowSubscribed(workflowName: string): Promise<boolean> {
        const badge = this.getSubscribedBadge(workflowName)
        return badge.isVisible()
    }

    async getTrialRemainingCount(workflowName: string): Promise<number | null> {
        const button = this.getContinueUseButton(workflowName)
        try {
            const text = await button.textContent()
            const match = text?.match(/剩余(\d+)次/)
            return match ? parseInt(match[1], 10) : null
        } catch {
            return null
        }
    }
}
