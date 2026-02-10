# **产品需求文档: 数据洞察 (Data Insights)**

状态: Frozen (V5.7) | 优先级: P1 | 关联模块: 工作流市场, 智能工作台

版本说明: V5.7 MVP - 锁定导出格式为 Excel/CSV；通过“明细导出”满足历史记录查询需求，暂不做复杂的在线筛选列表。

## **1. 核心目标 (Core Objective)**

**“ROI 可视化 (Return on Intelligence)”**。

将 AI 的技术消耗（Token）转化为业务价值（Time Saved）。帮助企业管理员回答两个核心问题：

1. 我们采购的数字员工替团队干了多少活？
2. 目前的席位分配是否合理，有无闲置浪费？

## **2. 功能需求 (Functional Requirements)**

### **2.1 效能看板 (Efficiency Dashboard)**

**目标**: 直观展示 AI 带来的“人力增益”。

* **M1. 任务完成数 (Tasks Completed)**:
  * **定义**: 所有 Agent 成功执行并结束的会话总数（排除试错/报错会话）。
  * **展示**: 本月总量 + 环比增长率 (MoM)。
* **M2. 估算节省工时 (Estimated Hours Saved)**:
  * **核心价值**: 这是证明采购价值的“北极星指标”。
  * **计算逻辑**: ∑ (任务完成数 × 该 Agent 的标准人工耗时)。
    * *注: 管理员需在“工作流配置”中为每个 Agent 设定“标准工时”（如：合同审查=0.5小时/次）。若未配置，取默认值 0.1小时。*
  * **可视化**: 大卡片展示 *"本月相当于雇佣了 X 位全职员工"* (按每月 160 工时换算)。
* **M3. \[NEW\] 人类接管率 (Human Intervention Rate)**:  
  * **定义**: 衡量 Agent 交付质量的核心指标。  
  * **计算公式**: (用户点击 "Regenerate" 次数 \+ 编辑器内 "手动修改" 次数) / 总任务数。  
  * **可视化**:  
    * **低接管 (\<10%)**: 显示绿色徽章 "🌟 卓越表现 (L4 Autonomy)"。  
    * **高接管 (\>50%)**: 显示红色警告 "⚠️ 需优化 Prompt"，引导管理员调整工作流配置。  
  * **价值**: 帮助企业识别哪些 Agent 是真的在干活，哪些只是在“添乱”。
* **M4. 任务成功率 (Task Success Rate) [NEW]**:
  * **定义**: `(成功闭环的任务数) / (总启动进程数)`。
  * **排除**: 排除由用户主动取消的任务，主要关注因报错、死循环或逻辑错误导致失败的比例。
* **M5. 自治等级 (Autonomy Level) [NEW]**:
  * **L1 (Copilot)**: 人类发起，人类结束，全程监工。
  * **L2 (Autopilot)**: 人类发起，Agent 执行，仅出错时介入。
  * **L3 (Agentic)**: Agent 基于监控触发主动发起，自主闭环。

### **2.2 原始数据导出 (Raw Data Export)**

**目标**: 替代复杂的在线查询功能，允许管理员下载明细进行二次分析（满足审计与深度盘点需求）。

* **导出内容**:
  * **格式**: **.xlsx (Excel)** 或 **.csv**。
  * **字段包含**:
    * `Task ID` (任务流水号)
    * `Agent Name` (使用的数字员工)
    * `User` (操作员姓名/子账号)
    * `Department` (所属部门)
    * `Start Time` / `End Time`
    * `Status` (Success/Failed)
    * `Estimated Time Saved` (该任务贡献的工时)
* **交互**: 看板右上角提供简单的时间范围选择器 (本月/上月/全部) + **[📥 导出明细]** 按钮。

## **3. 数据埋点 (Analytics)**

* dashboard_view: 查看报表 (Admin only)。
* export_data: 点击导出明细 (参数: range='current_month'|'last_month')。

## **4. 技术约束 (Technical Constraints)**
* **T1. 数据时效性 (Data Freshness)**:
  *管理员看板数据的延迟应控制在 < 15 分钟 (Near Real-time)，无需做到秒级 T+0，但不可接受 T+1。
* **T2. 数据留存 (Retention Policy)**:
  * **原始明细 (Raw Data)**: 保留 180 天（满足半年审计需求）。
  * **聚合指标 (Aggregated Stats)**: 永久保留（用于展示环比趋势）。
