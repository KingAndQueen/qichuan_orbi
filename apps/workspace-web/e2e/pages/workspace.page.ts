import { Page, Locator } from '@playwright/test'

/**
 * Workspace Page Object Model
 * 主工作台页面的封装
 */
export class WorkspacePage {
    readonly page: Page
    readonly composer: Locator
    readonly composerTextarea: Locator
    readonly sendButton: Locator
    readonly messageList: Locator
    readonly taskProgressPanel: Locator
    readonly sidebar: Locator
    readonly newChatButton: Locator

    constructor(page: Page) {
        this.page = page
        this.composer = page.locator('[data-testid="composer"]').or(
            page.locator('form').filter({ has: page.getByRole('textbox') })
        )
        this.composerTextarea = page.getByRole('textbox', { name: /输入消息|发送消息|请输入/ }).or(
            page.locator('textarea')
        )
        this.sendButton = page.getByRole('button', { name: /发送/ }).or(
            page.locator('button[type="submit"]')
        )
        this.messageList = page.locator('[data-testid="message-list"]').or(
            page.locator('[role="log"]')
        )
        this.taskProgressPanel = page.getByLabel('任务进度')
        this.sidebar = page.locator('[data-testid="sidebar"]').or(
            page.locator('nav')
        )
        this.newChatButton = page.getByRole('button', { name: /新对话|新建/ })
    }

    async goto() {
        await this.page.goto('/')
    }

    async waitForLoad() {
        await this.composerTextarea.waitFor()
    }

    async sendMessage(message: string) {
        await this.composerTextarea.fill(message)
        await this.sendButton.click()
    }

    async waitForTaskProgress() {
        await this.taskProgressPanel.waitFor({ timeout: 10000 })
    }

    async isTaskProgressVisible(): Promise<boolean> {
        return this.taskProgressPanel.isVisible()
    }

    async getTaskProgressStatus(): Promise<string | null> {
        try {
            const statusElement = this.taskProgressPanel.locator('text=正在处理').or(
                this.taskProgressPanel.locator('text=已完成')
            ).or(
                this.taskProgressPanel.locator('text=执行失败')
            )
            return statusElement.first().textContent()
        } catch {
            return null
        }
    }

    async expandTaskProgressPanel() {
        const toggleButton = this.taskProgressPanel.getByRole('button')
        const isExpanded = await toggleButton.getAttribute('aria-expanded')
        if (isExpanded === 'false') {
            await toggleButton.click()
        }
    }

    async getTaskSteps(): Promise<string[]> {
        await this.expandTaskProgressPanel()
        const steps = this.taskProgressPanel.locator('[data-testid="step-name"]').or(
            this.taskProgressPanel.locator('li')
        )
        return steps.allTextContents()
    }

    getHistoryReportButton(): Locator {
        return this.page.getByRole('button', { name: /查看历史报告|历史/ }).or(
            this.page.getByRole('link', { name: /历史报告/ })
        )
    }

    async navigateToHistoryReports() {
        const button = this.getHistoryReportButton()
        await button.click()
    }

    async startNewChat() {
        await this.newChatButton.click()
    }

    getLatestMessage(): Locator {
        return this.messageList.locator('[data-testid="message"]').last().or(
            this.messageList.locator('article').last()
        )
    }

    async getMessageCount(): Promise<number> {
        const messages = this.messageList.locator('[data-testid="message"]').or(
            this.messageList.locator('article')
        )
        return messages.count()
    }
}
