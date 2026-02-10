# Docs Map （文档地图与治理规范）
文档状态: Active
最后更新: 2026-01-21
适用范围: Orbitaskflow 项目所有产品、技术、规范与测试文档

---
## 1. 文档目标（Goals）
1. **文档可找(Findability)**：
- 任何一个产品、技术、规范、测试问题，都能快速定位“应该看哪份文档”。
2. **单一事实来源（Single Source of Truth, SSOT）**：
- 同一事实只在一个地方定义，其他文档只引用。
- 冲突解决：
  - 业务目标/用户体验/验收口径：L1/L3为准
  - 技术契约（API/协议/数据模型）：L2为准（L1只能引用，不可重定义）
  - 实现细节（代码结构/部署脚本）：L4为准（但不得违反L2/L3契约与验收） 
- 执行与规范对齐：操作流程应引用规范文档的要求。
3. **可演进(Evolvability)***：
- 支持从MVP 阶段到规模化阶段再到逐步升级阶段的迭代。
- 不产生重复与冲突。当产品需求变更、技术架构演进、规范标准调整、增加新的测试方案或用例，文档结构能清晰反映变化。
4. **AI 友好**：
- 文档结构稳定、字段明确、利用标准模版。
---
## 2. 本文档用途与范围（Usage&Scope）
### 2.1 本文档用于
规划 Orbitaskflow 项目整体文档体系的分层、归属、模板标准与引用规则。它是项目文档的“宪法”和“索引地图”。
### 2.2 范围（In Scope）
- **L0 规范与模板 (Meta-Standards)**：包含 智能原生公司核心理念、SSOT术语表、通用文档编写规范、PRD编写模版、技术设计编写模版、测试计划编写模版。
- **L1 产品与业务 (Product SSOT)**：包含 平台总台概览、具体的PRD。
- **L2 技术与架构 (Technical SSOT)**：包含架构设计、交互协议、API 契约、数据模型。
- **L3 测试与质量 (Verification & Quality)**：包含总体计划、测试策略、验收标准、发布清单。
- **L4 实现与运维 (Implementation & Ops)**：包含服务设计、部署手册、排障指南、开发环境。
- **专题与归档 (Special Topics)**：包含关键资料、历史归档
### 2.3 边界（Out of Scope）
- 具体的测试用例执行细节（测试策略在 L3 引用，具体 Case 另行管理）。
- 非技术/产品类的行政文档。
- 未收敛的临时文档。
---
## 3. 核心原则
为了保证信息的一致性，我们定义了两条核心依赖路径：
- A 纵向依赖链（The Build Chain）：逻辑流向：定义->设计->验收->实现。原则：下游必须满足上游，下游不得重新定义上游已确定的真理。
  - L1 （Product SSOT）：定义业务目标与用户价值。
    - 下游L2必须引用L1，设计出满足业务的架构。
  - L2 （Technical SSOT)：定义系统架构与技术契约。
    - 下游L3必须引用L2和L1，制定出覆盖契约与业务的验收标准。
  - L3 （Verification & Quality)：定义验收标准。
    - 下游L4必须引用L3，代码实现的目标是通过L3的测试。
  - L4 (Implementation & Ops)：执行具体实现，服务运维部署。
    - 处于依赖链末端，是上述所有定义的落地。     
- B 横向约束面（The Governance Plane）：逻辑流向：全局 -> 局部。原则：所有层级必须继承并遵守全局规范。
  - L0 （Meta-Standards）：定义格式、命名、术语与流程。
    - 全员约束：L1 的 PRD 必须用 L0 的模版；L4 的代码必须守 L0 的规范；所有文档的术语必须查 L0 的 Glossary。
---
## 4. 文档注册表（Doc Registry）
> 说明：此表是“职责划分”的核心，也是**唯一 SSOT**。新增文档必须先登记到这里。
### 4.1 成熟度定义 (Status)
- Stable: 内容稳定，可作为 SSOT 引用。
- Draft: 草稿状态，主逻辑完整但细节可能变动。
- Reference: 参考资料，仅供查阅，不作为最新依据。
### 4.2 L0 规范与模板 (Meta-Standards)
- 物理位置：docs/standards/

| 标准路径(Target Path) | 中文标题 | 核心职责&SSOT约束 | 状态 |
| :--- | :--- | :--- | :--- |
| `docs/standards/doc-guidelines.md` | 通用文档编写规范 | [底座] Markdown/Mermaid 格式、文件名命名、目录结构规范。所有文档均需继承。 | Draft |
| `docs/standards/ssot-glossary.md` | SSOT术语表 | [命名立法] 全项目的中英文术语定义。所有文档、代码命名、测试用例均需严格遵循此表，禁止发明新词。 | Draft |
| `docs/standards/ai-native-concept.md` | AI Native 核心理念 | [世界观/宪法] 定义“智能原生”的运作模式。所有业务设计必须符合此理念（优先 Agent 执行），AI 生成方案时必读。 | Draft |
| `docs/standards/prd-template.md` | PRD撰写模版 | [产品模版] 扩展用户故事、验收标准等产品章节。 | Draft |
| `docs/standards/tech-design-template.md` | 技术设计编写模板 | [技术模版] 扩展架构图、接口定义、数据库设计等技术章节。用于写 L2/L4 文档。 | Draft |
| `docs/standards/test-plan-template.md` | 测试计划编写模板 | [测试模版] 扩展测试范围、策略、通过标准章节。用于写 L3 文档。 | Draft |
| `docs/standards/contributing.md` | 贡献指南 |[代码规范] 人与 AI 共同遵循的代码风格、Git 工作流与提交规范。 | Draft |
| `docs/standards/api-style-guide.md` | API架构风格 |[技术] API 风格唯一 SSOT。定义 RESTful 规范、错误码结构、版本策略。其他文档只引用，不复述。 | Draft |
### 4.3 L1 产品与业务 (Product SSOT)
- 物理位置：docs/features/ DoD: 必须基于 docs/standards/prd-template.md。包含用户故事、验收标准；禁止包含 DB/API 细节。

| 标准路径(Target Path) | 中文标题 | 核心职责&SSOT约束 | 状态 |
| :--- | :--- | :--- | :--- |
| `docs/features/platform-overview.md` | 平台总体概览 | [产品全景] 宏观价值主张、核心能力大图与演进路线| Draft |
| `docs/features/prd-identity-access.md` | 身份与访问 PRD | [身份底座] 定义全局多租户模型、用户身份认证 (AuthN) 与访问控制 (AuthZ) 的业务规则。| Draft |
| `docs/features/prd-workspace.md` | 工作台交互与执行 PRD | [生产力核心] 定义协作对话空间、智能体执行层与任务编排逻辑。 | Draft |
| `docs/features/prd-marketplace.md` | 工作流市场 PRD | [生态分发] 定义标准连接端点、外部智能体桥接与数字化雇佣机制。 | Draft |
| `docs/features/prd-insights.md` | 数据洞察 PRD | [数据价值] 定义业务洞察指标与治理观测能力。 | Draft |
### 4.4 L2 技术与架构 (Technical SSOT)
- 物理位置：docs/technical/{architecture, data, protocols, api}/ DoD: 必须基于 docs/standards/tech-design-template.md。包含架构决策、ER 图、API 契约。

| 标准路径 (Target Path) | 中文标题 | 核心内容 & SSOT 约束 | 状态 |
| :--- | :--- | :--- | :--- |
| `docs/technical/architecture/fullstack-architecture.md` | 全栈架构设计 | 前后端架构图、交互组件。 | Draft |
| `docs/technical/data/database-design.md` | 数据库设计 | 数据模型唯一 SSOT。ER 图、表结构。 | Draft |
| `docs/technical/protocols/interaction-protocol.md` | 交互协议 | 动态协议唯一 SSOT。WebSocket 消息格式。 | Draft |
| `docs/technical/protocols/agent-interface-spec.md` | Agent 接口规范 | 语义对象唯一 SSOT。Agent 接入 Schema。 | Draft |
| `docs/technical/api/core-service.md` | Core Service API | 接口契约唯一 SSOT。OpenAPI 定义。 | Draft |
| `docs/technical/api/agent-bridge.md` | Agent Bridge API | Bridge 服务 API 契约。 | Draft |
### 4.5 L3 测试与质量 (Verification & Quality)
- 物理位置：docs/test/ DoD: 必须基于 docs/standards/test-plan-template.md。包含测试范围、测试策略、通过标准。

| 标准路径 (Target Path) | 中文标题 | 核心内容 | 状态 |
| :--- | :--- | :--- | :--- |
| `docs/test/qa-master-plan.md` |  QA 总体计划 | 测试策略总纲。 | Draft |
| `docs/test/backend-testing.md` | 后端测试计划 | 单元/集成测试覆盖率。 | Draft |
| `docs/test/frontend-testing.md` | 前端测试计划 | 组件/E2E 测试流程。 | Draft |
| `docs/test/agent-bridge-testing.md` | Agent Bridge 测试 | 连接性、并发测试。 | Draft |
| `docs/test/agent-evaluation.md` | Agent 效果评估 | 回答质量评估标准。 | Draft |
| `docs/test/data-insights-testing.md` | 数据洞察测试 | 埋点准确性测试。 | Draft |
| `docs/test/nonfunctional-testing.md` | 非功能测试 | 性能、安全测试。 | Draft |
| `docs/test/release-testing.md` | 发布测试清单 | 上线 Checklsit。 | Draft |
### 4.6 L4 实现与运维 (Implementation & Ops)
- 物理位置：docs/technical/{services, ops, dev, release, opensource}/ DoD: 服务设计建议基于 docs/standards/tech-design-template.md。

| 标准路径 (Target Path) | 中文标题 | 核心内容 & SSOT 约束 | 状态 |
| :--- | :--- | :--- | :--- |
| `docs/technical/dev/local-development.md` | 本地开发指南 | 环境搭建、启动命令。 | Draft |
| `docs/technical/services/platform-core-impl.md` | 核心服务实现 | 模块划分、代码细节。引用 L2 接口定义。 | Draft |
| `docs/technical/services/agent-bridge-impl.md` | Bridge 服务实现 | LLM 对接、Prompt 组装。引用 L2 协议。 | Draft |
| `docs/technical/ops/nginx-gateway-arch.md` | 网关配置 | 路由规则唯一 SSOT。Nginx 端口、反代规则。 | Draft |
| `docs/technical/ops/nginx-troubleshooting.md` | Nginx 排障 | 排障步骤唯一落点。错误定位与恢复。 | Draft |
| `docs/technical/ops/observability-logging.md` | 监控日志 | 监控规范唯一 SSOT。日志字段 Schema、脱敏规则。 | Draft |
| `docs/technical/release/deployment.md` | 部署指南 | Docker 部署步骤。 | Draft |
| `docs/technical/opensource/oss-reference-playbook.md` | OSS 参考手册 | 开源合规检查。 | Reference |
### 4.7 专题与归档 (Special Topics)
- 物理位置：docs/key-info/, docs/features/old-prd/, docs/technical/old-branch/

| 标准路径 (Target Path) | 中文标题 | 核心内容 & SSOT 约束 | 状态 |
| :--- | :--- | :--- | :--- |
| `docs/key-info/` | 关键资料库 |  [静态参考] 存放不可变更的 PDF 架构图、技术评审记录。仅供查阅，不直接维护。 | Reference |
| `docs/features/old-prd/` | 产品历史归档 | [废弃] 存放过期的、被新 PRD 替代的历史需求文档。仅用于回溯决策。 | -- |
| `docs/technical/old-branch/` | 技术历史归档 | [废弃] 存放废弃的技术方案和旧分支文档。 | -- |

---
## 5. 维护流程
- 变更发生时：根据 6.1 全局执行流程 判断影响层级与动作。
- 注册文档：任何新建的文档，必须回到本文件（docs/docs_map.md）的 第 4 章 进行注册，确保索引最新。

