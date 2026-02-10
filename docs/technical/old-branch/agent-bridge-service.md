# **智能体与市场服务规范 (Agent Bridge Service)**

文档版本：v1.7  
最后修改日期：2025-11-29  
作者：JeafDean  
相关文档：docs/technical/api/api-architecture.md  
文档目的：定义 agent-bridge (Python) 服务在智能体运行时、应用市场、资产管理及会话历史方面的核心职责与接口契约，特别强调对\*\*多云环境（AWS/GCP/Aliyun/Volcengine）**和**多区域合规（CN/Global）\*\*的支持。

# **1\. 概述 (Overview)**

Agent Bridge Service 是系统的“大脑”，其核心职责是构建一个 **统一智能体网关 (Unified Agent Gateway)**。该网关在架构上明确区分了两类智能体：

1. **外部托管智能体 (External Managed Agents)**：通过适配器模式接入 **Coze (CN/Global)**、**Google Vertex AI Agent Builder** 等成熟 Agent 平台，实现能力的快速复用。  
2. **原生自研智能体 (Native Custom Agents)**：提供一个兼容 **LangChain**、**AutoGen** 及 **Google ADK (Python SDK)** 等主流框架的 Python 运行时环境，并屏蔽底层 **基础模型服务** (Gemini/Qwen/Doubao) 和 **云基础设施** (AWS/Aliyun/Volcengine) 的差异，向上层前端提供标准化的 SSE 流式交互接口。

# **2\. 职责 (Responsibilities)**

* **混合运行时环境 (Hybrid Runtime Environment)**:  
  * **External Agents**: 代理调用外部平台 API（支持 Coze CN/Global, Google Vertex, Aliyun Bailian）。  
  * **Internal Agents**: 运行自研 Python 代码，支持集成 LangChain/AutoGen 并调用本地或云端模型。  
* **多云适配 (Multi-Cloud)**:  
  * **Model Layer**: 统一封装 Gemini (Google), Qwen (Aliyun), Doubao (Volcengine) 的调用接口。  
  * **Storage Layer**: 统一封装 AWS S3, Aliyun OSS, Volcengine TOS 的对象存储接口。  
* **协议归一化 (Normalization)**: 将不同区域、不同厂商的流式响应转换为标准 SSE 格式。  
* **应用市场 (Marketplace)**: 提供 Agent/Workflow 的全文本搜索、分类筛选、排序及详情查询。  
* **资产管理 (Assets)**: 生成兼容多云厂商的预签名 URL (Presigned URL)。

# **3\. 数据结构 (Data Structures)**

## **3.1 核心实体**

* **Workflow**: 定义 Agent 的静态属性。  
  * **type**: external | internal  
  * **provider**: coze | google\_vertex | aliyun\_bailian | volc\_ark | native\_python  
  * **config**: JSONB  
    * Coze: { "botId": "...", "region": "cn" | "global" }  
    * Google: { "projectId": "...", "location": "us-central1" }  
    * Aliyun: { "appId": "...", "region": "cn-hangzhou" }  
* **Run**: 代表 Agent 的一次完整执行实例。  
* **Message**: 聊天记录单元。

## **3.2 SSE 事件流结构 (Event Stream)**

遵循 V1.8 API 架构的双层协议：

* run\_start: { runId: "..." }  
* thought: { title: "Searching web", status: "in\_progress" }  
* message\_delta: { content: "Hello", id: "msg\_1" }  
* tool\_call: { tool: "search", input: "..." }  
* run\_completed: { usage: { tokens: 150 }, cost: 0.002 }

# **4\. API 规范 (API Spec)**

Base URL: /api/agent (由 Nginx 转发)

## **4.1 运行时模块 (Runtime)**

### **POST /v1/runs**

**功能**: 创建并启动一个新的 Agent 执行任务 (Run)。

* **Request**:  
  {  
    "workflowId": "uuid-workflow-1",  
    "input": "生成周报",  
    "files": \["file-uuid-1"\]  
  }

* **Response**: Content-Type: text/event-stream  
* **Behavior**:  
  * 根据 workflow.config.region 自动选择调用的 API 端点（如 api.coze.cn 或 api.coze.com）。  
  * 使用配置好的 HTTP Proxy (若部署在受限网络环境)。

### **POST /v1/runs/{runId}/cancel**

**功能**: 强制停止正在运行的任务。

## **4.2 应用市场模块 (Marketplace)**

### **GET /v1/workflows**

**功能**: 搜索和筛选 Agent。

* **Query**: q=report\&filter\[category\]=office

### **POST /v1/workflows/{id}/reviews**

**功能**: 用户评价 Agent。

## **4.3 资产管理模块 (Assets)**

### **POST /v1/files/upload-url**

**功能**: 获取对象存储预签名上传链接。

* **Request**: { "filename": "doc.pdf", "sizeBytes": 102400 }  
* **Response**:  
  {  
    "data": {  
      "uploadUrl": "\[https://oss-cn-hangzhou.aliyuncs.com/\](https://oss-cn-hangzhou.aliyuncs.com/)...", // 自动适配当前云环境  
      "fileId": "..."  
    }  
  }

* **Behavior**: 根据环境变量 STORAGE\_PROVIDER (S3/OSS/TOS) 生成对应的签名 URL。

### **POST /v1/files/{fileId}/confirm**

**功能**: 确认文件上传完成。

## **4.4 会话历史模块 (History)**

### **GET /v1/conversations/{conversationId}/messages**

**功能**: 获取聊天记录 (支持无限滚动)。

### **POST /v1/messages/{messageId}/feedback**

**功能**: 消息级 RLHF 反馈。

### **POST /v1/messages/{messageId}/pin**

**功能**: 置顶/取消置顶消息。

## **4.5 异步任务模块 (Async Jobs) \[NEW\]**

为了避免网关超时，针对耗时 **\> 5秒** 的长时操作（如 RAG 知识库索引、批量文档分析），必须采用 **"异步提交 \+ 状态查询"** 的模式。前端应配合 WebSocket 的 job.status 事件使用。

### **POST /v1/jobs**

**功能**: 提交一个后台任务进入 Arq 队列。

* **Request**:  
  {  
    "type": "rag.index\_document", // 任务类型  
    "payload": {  
      "fileId": "file\_abc\_123",   // 遵循 CamelCase  
      "chunkSize": 500  
    }  
  }

* **Response**: 202 Accepted  
  {  
    "data": {  
      "jobId": "job\_uuid\_888",  
      "status": "pending",  
      "queuePosition": 1  
    }  
  }

### **GET /v1/jobs/{jobId}**

**功能**: 轮询任务执行进度与结果（主要用于离线兜底或详情页展示）。

* **Response**: 200 OK  
  {  
    "data": {  
      "id": "job\_uuid\_888",  
      "type": "rag.index\_document",  
      "status": "processing", // pending | processing | completed | failed  
      "progress": 45,         // 0 \- 100  
      "result": null,         // 成功后返回 (e.g. { "indexCount": 120 })  
      "error": null,          // 失败后返回错误对象  
      "createdAt": "2025-12-01T12:00:00Z",  
      "finishedAt": null  
    }  
  }

### **POST /v1/jobs/{jobId}/cancel**

**功能**: 取消排队中或执行中的任务。

* **Response**: 200 OK

# **5\. 智能体适配器架构 (Agent Adapter Architecture)**

## **5.1 Adapter Interface**

统一抽象类：

class AgentAdapter(ABC):  
    @abstractmethod  
    async def stream(self, input: str, context: List\[Message\]) \-\> AsyncGenerator\[SSEEvent, None\]:  
        pass

## **5.2 支持的 Providers**

### **A. External Providers (API Proxy)**

1. **Coze (ByteDance)**:  
   * **CN**: 对接 api.coze.cn，支持飞书/微信生态。  
   * **Global**: 对接 api.coze.com，支持 Discord/Slack。  
2. **Google Vertex AI**:  
   * 适用于国际市场，提供企业级 Gemini 能力。  
3. **Aliyun Bailian (通义)**:  
   * 适用于中国市场，提供 Qwen-Max 等高性能模型。  
4. **Volcengine Ark (豆包)**:  
   * 适用于中国市场，提供高性价比推理。

### **B. Internal Providers (Self-Hosted)**

1. **Native Python**:  
   * 运行本地代码。  
   * 可集成 **LangChain**, **AutoGen**, **Google ADK (Python SDK)**。  
   * 通过环境变量配置底层的 DEFAULT\_LLM\_MODEL (如切换为 Qwen 或 Gemini)。

# **6\. 安全策略 (Security Model)**

## **6.1 区域合规 (Regional Compliance)**

* **数据驻留**: 中国区部署 (REGION=cn) 时，必须使用中国区的对象存储 (OSS/TOS) 和模型服务，严禁数据跨境。  
* **网络隔离**: 生产环境应配置 VPC Endpoint 连接云服务，避免公网传输。

## **6.2 凭证管理**

* **多套密钥**: 系统需支持同时配置多套 AK/SK (AWS \+ Aliyun \+ GCP)，根据 Workflow 配置动态选择。  
* **Vault 集成**: 敏感凭证必须加密存储。

# **7\. 非职责 (Out of Scope)**

* **用户认证**: 由 site-auth 负责。  
* **计费**: 仅上报 Usage，不处理金额。

# **8\. 与其他服务关系 (Service Relationships)**

* **Site-Auth**: 上游调用方。  
* **Cloud Vendors**: AWS, Google Cloud, Aliyun, Volcengine。  
* **SaaS Platforms**: Coze, Dify。

# **9\. 未来扩展 (Future Work)**

* **Hybrid Deployment**: 支持控制面 (Control Plane) 在一处，数据面 (Data Plane) 分布在多云/多区域。  
* **Model Fallback**: 当主模型 (如 Gemini) 不可用时，自动降级到备用模型 (如 Qwen)。
