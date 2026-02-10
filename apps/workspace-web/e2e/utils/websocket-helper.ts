import { Page } from '@playwright/test'

interface TaskStep {
    stepName: string
    status: 'pending' | 'running' | 'succeeded' | 'failed'
    progress?: number
}

interface TaskProgressEvent {
    runId: string
    steps: TaskStep[]
}

/**
 * WebSocket 测试辅助工具
 * 帮助模拟 WebSocket 消息推送
 */
export class WebSocketHelper {
    constructor(private page: Page) { }

    /**
     * 模拟 WebSocket 任务进度更新事件
     * 通过页面注入的方式触发 Store 更新
     */
    async simulateTaskProgressUpdate(taskProgress: TaskProgressEvent) {
        await this.page.evaluate((payload) => {
            // 触发自定义事件，模拟 WebSocket 消息接收
            const event = new CustomEvent('e2e:ws-message', {
                detail: {
                    type: 'workflow.step',
                    data: payload,
                },
            })
            window.dispatchEvent(event)

            // 直接更新 Store（如果可访问）
            const win = window as any
            if (win.__E2E_TASK_PROGRESS_CALLBACK__) {
                win.__E2E_TASK_PROGRESS_CALLBACK__(payload)
            }
        }, taskProgress)
    }

    /**
     * 模拟任务开始
     */
    async simulateTaskStart(runId: string, steps: string[]) {
        const taskProgress: TaskProgressEvent = {
            runId,
            steps: steps.map((stepName, index) => ({
                stepName,
                status: index === 0 ? 'running' : 'pending',
                progress: index === 0 ? 10 : 0,
            })),
        }
        await this.simulateTaskProgressUpdate(taskProgress)
    }

    /**
     * 模拟步骤完成
     */
    async simulateStepComplete(runId: string, steps: TaskStep[]) {
        await this.simulateTaskProgressUpdate({ runId, steps })
    }

    /**
     * 模拟任务完成（所有步骤成功）
     */
    async simulateTaskComplete(runId: string, stepNames: string[]) {
        const taskProgress: TaskProgressEvent = {
            runId,
            steps: stepNames.map((stepName) => ({
                stepName,
                status: 'succeeded',
                progress: 100,
            })),
        }
        await this.simulateTaskProgressUpdate(taskProgress)
    }

    /**
     * 模拟任务失败
     */
    async simulateTaskFailed(runId: string, steps: TaskStep[]) {
        await this.simulateTaskProgressUpdate({ runId, steps })
    }

    /**
     * 注入 E2E 测试钩子到页面
     * 用于在测试中捕获和验证 WebSocket 消息
     */
    async injectTestHooks() {
        await this.page.evaluate(() => {
            const win = window as any
            win.__E2E_WS_MESSAGES__ = []
            win.__E2E_TASK_PROGRESS_CALLBACK__ = null

            // 创建一个 setter 用于测试注入
            win.setE2ETaskProgressCallback = (callback: (data: any) => void) => {
                win.__E2E_TASK_PROGRESS_CALLBACK__ = callback
            }
        })
    }

    /**
     * 获取捕获的 WebSocket 消息
     */
    async getCapturedMessages(): Promise<any[]> {
        return this.page.evaluate(() => {
            return (window as any).__E2E_WS_MESSAGES__ || []
        })
    }
}

/**
 * 创建 WebSocket Helper 实例
 */
export function createWebSocketHelper(page: Page): WebSocketHelper {
    return new WebSocketHelper(page)
}
