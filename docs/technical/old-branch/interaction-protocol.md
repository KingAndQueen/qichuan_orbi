# **交互协议（Interaction Protocol）- V2 规划**

状态: 规划中 (Planning) \- 即将成为实施标准  
更新日期: 2025-11-27  
描述: 本文档描述了 Workspace Web (Frontend) 与 Agent Bridge (Backend) 之间的通信协议，规定了向 WebSocket First 和 统一事件驱动 架构迁移的标准。

## **Part 1: 核心通信模式 (Architecture)**

### **1.1 传输策略：WebSocket First (WebSocket 优先)**

为了支撑现代 Agent 的深度协作（如打断、人机交互、文件编辑），系统采用 **WebSocket 优先** 的双栈策略。

* **Primary Channel (WebSocket)**:  
  * **用途**: Workspace 中的所有核心交互（对话、打断、协作、文件操作）。  
  * **理由**: 只有 WebSocket 能提供全双工通信，允许用户随时打断 Agent 生成 (interrupt)，支持 Server 主动推送 Human-in-the-loop 请求（如审批卡片），以及 Server 指令 Client 执行本地工具。  
  * **连接生命周期**: 用户进入 Workspace 页面即尝试建立连接，并在页面停留期间保持长连接（Keep-Alive）。  
* **Fallback Channel (HTTP Streaming)**:  
  * **用途**: 仅作为 **降级方案** 或 **只读场景** 使用。  
    * 场景 A: WebSocket 连接因防火墙或网络问题多次失败（重试 \> 3 次）。  
    * 场景 B: 公开分享的只读页面（无需交互，仅需流式加载历史）。  
  * **限制**: 不支持打断、不支持实时文件变更推送、不支持端侧工具调用。

### **1.2 序列化标准 (Serialization)**

* **Format**: **严格统一使用 JSON**。  
  * 所有 WebSocket 帧和 HTTP Chunk 必须是合法的 JSON 对象。  
  * **禁止** 使用 Protocol Buffers (gRPC) 直接暴露给前端，以保持浏览器调试友好性（DevTools 可读）和开发灵活性（动态 Schema）。

### **1.3 校验机制 (The "Soft-Protobuf" Strategy)**

为了弥补 JSON 弱类型的缺陷，前后端必须实施严格的运行时校验：

* **Frontend (Next.js)**: 必须使用 **Zod** 对收到的所有 Event Payload 进行校验。  
  * *Rule*: z.object({...}).parse(payload)。校验失败应记录错误日志并忽略该事件，防止 UI 崩溃。  
* **Backend (Python)**: 必须使用 **Pydantic** 定义所有 Event Model。  
  * *Rule*: 禁止直接返回 dict 或拼凑的 JSON 字符串。

### **1.4 连接资源管理 (Resource Optimization \- MVP)**

为了应对长连接带来的资源消耗 (C10K 问题)，MVP 阶段采取 **“智能休眠”** 策略：

* **Idle Timeout (服务端主动断连)**: 若一个 WS 连接在 **10分钟** 内无任何业务消息（Ping/Pong 除外），Server 将主动关闭连接以释放文件描述符。  
* **Lazy Reconnect (客户端按需重连)**: 前端检测到连接因 Idle 关闭后，进入“休眠状态”。仅当用户**再次激活窗口**（focus）或**发起操作**（click/type）时，才触发重连。禁止在后台无限重试。

## **Part 2: 接口定义 (Endpoints)**

### **2.1 WebSocket 握手 (Agent Chat)**

* **URL**: ws://\<api\_host\>/api/agent/ws/chat  
* **Query Params**:  
  * ticket=\<ws\_ticket\> (必填，详见安全文档)  
  * agent\_id=\<agent\_id\> (可选，指定当前会话绑定的工作流/Bot ID)  
* **Protocol**: v2.json

### **2.2 HTTP 降级接口 (Fallback)**

* **URL**: /api/agent/chat/workflow \-\> POST /chat/workflow  
* **Method**: POST  
* **Content-Type**: application/json  
* **Response**: text/event-stream (Server-Sent Events)

### **2.3 文件上传 (File Upload)**

* **URL**: /api/agent/files/upload  
* **Method**: POST (Multipart/Form-Data)  
* **说明**: 二进制大文件不通过 WebSocket 传输，通过 HTTP 上传后获取 file\_id，再通过 WebSocket 发送引用。

### **2.4 对话导出 (Conversation Export)**

* **URL**: /api/agent/conversations/{conversation\_id}/export  
* **Method**: GET  
* **Query Params**: format=md|html|pdf  
* **Response**: 文件流 (Blob/Download)

## **Part 3: 统一事件信封 (Unified Event Envelope)**

V2 协议**废弃**旧版的 Provider 透传模式。所有下行消息（Server \-\> Client）和上行消息（Client \-\> Server）都必须遵循标准信封。

### **3.1 信封结构 (Envelope Schema)**

interface AgentEvent {  
  // 1\. 鉴别器：决定 payload 的类型  
  // 命名规范: \<domain\>.\<action/type\>  
  event:   
    // \--- Server to Client \---  
    | 'message.delta'        // 基础对话增量  
    | 'message.complete'     // 消息完成  
    | 'message.user'         // 用户消息广播 (多端同步)  
    | 'chat.typing'          // 输入状态指示器 (瞬态)  
    | 'agent.thought'        // 思考/推理过程  
    | 'agent.tool\_call'      // 服务端请求客户端执行工具  
    | 'agent.guardrail'      // 安全护栏拦截通知  
    | 'agent.suggestion'     // (New) 快捷建议/下一行动  
    | 'workflow.step'        // 工作流步骤更新  
    | 'interaction.card'     // 富交互卡片  
    | 'resource.artifact'    // 文件或代码制品 (支持分块)  
    | 'error'                // 系统级错误  
    | 'ack'                  // 消息回执
    | 'notification.push'    // 异步通知在线推送
    | 'job.status'           // 长时任务状态变更
    | 'pong'                 // 心跳响应
    // \--- Client to Server \---  
    | 'chat.input'           // 用户输入消息  
    | 'chat.typing'          // 客户端发送输入状态  
    | 'agent.interrupt'      // 打断信号  
    | 'agent.tool\_result'    // 客户端回传工具执行结果  
    | 'interaction.response' // 卡片操作反馈  
    | 'message.feedback'     // 用户反馈  
    | 'session.update'       // 会话元数据更新
    | 'message.pin'          //消息置顶操作
    | 'ping';                // 应用层心跳 

  // 2\. 追踪元数据  
  // 关键更新：Client 发送消息时必须生成 UUID 作为 id，Server 返回的 ack 将引用此 id  
  id: string;               // UUID, 事件唯一ID (Correlation ID)  
  conversation\_id: string;  // 关联的会话ID  
  ts: string;               // ISO8601 时间戳 (UTC)  
    
  // 可观测性支持  
  trace\_id?: string;        // W3C Trace Context ID  
  span\_id?: string;         // W3C Span ID

  // 3\. 数据载荷 (Strictly Typed)  
  payload: any;             // 见下方具体定义  
}

### **3.2 Server \-\> Client 事件定义 (Downlink)**

#### **A. 基础对话类 (Conversational Events)**

**message.delta**

* **用途**: AI 文本生成过程中的增量输出。  
* **Payload**:  
  {  
    "text": "Hello",        // 增量文本片段  
    "message\_id": "msg\_1",  // 所属的消息ID  
    "seq": 10               // 序列号 (用于前端处理乱序)  
  }

**message.complete**

* **用途**: AI 消息生成结束，提供完整内容和统计信息。  
* **Payload**:  
  {  
    "message\_id": "msg\_1",  
    "full\_text": "Hello world.",  
    "usage": { "input\_tokens": 10, "output\_tokens": 5 },  
    "finish\_reason": "stop",  
    "citations": \[          // 引用源支持  
       { "url": "...", "title": "...", "snippet": "..." }  
    \]  
  }

**message.user**

* **用途**: 广播其他用户（或当前用户在其他设备）发送的消息，实现多端同步或多人协作。  
* **Payload**:  
  {  
    "message\_id": "msg\_client\_abc",  
    "text": "Could you explain this?",  
    "files": \[\],  
    "user": { "id": "u\_123", "name": "Alice" }  
  }

**chat.typing**

* **用途**: 广播用户的输入状态（瞬态事件，不持久化）。  
* **Payload**:  
  {  
    "user\_id": "u\_123",  
    "typing": true // true=正在输入, false=停止输入  
  }

**agent.thought**

* **用途**: 展示现代模型（如 o1）的内部推理/思考链（Chain of Thought）。前端通常将其渲染为可折叠的灰度文本块。  
* **Payload**:  
  {  
    "message\_id": "msg\_1",  
    "thought\_text": "Analyzing user request...", // 增量思考文本  
    "stage": "planning", // planning, reasoning, criticizing  
    "status": "ongoing"  // ongoing, completed  
  }

**agent.guardrail**

* **用途**: 通知前端内容触发了安全护栏或合规策略（非系统错误，而是业务拦截）。  
* **Payload**:  
  {  
    "policy\_id": "no\_financial\_advice",  
    "action": "block", // block, flag, redact  
    "message": "I cannot provide financial advice.",  
    "details": { "detected\_terms": \["stock", "buy"\] }  
  }

#### **B. 工作流执行类 (Marketplace/Execution Visibility)**

**workflow.step**

* **用途**: 告知前端 Agent 当前的执行状态（思考、搜索、调用工具）。驱动进度条或思维树显示。  
* **Payload**:  
  {  
    "run\_id": "run\_888",  
    "step\_id": "step\_sub\_search\_1",  
    "parent\_step\_id": "step\_main\_research", // 支持树状结构可视化  
    "step\_name": "Google Search",  
    "status": "running",      // running, success, failed  
    "input": { "query": "..." },   
    "output": { "results": "..." }   
  }

#### **C. 富交互与制品类 (Workspace/Rich UI)**

**interaction.card**

* **用途**: 推送一张交互卡片（审批、表单、图表）。通常用于 Human-in-the-loop 场景。  
* **Payload**:  
  {  
    "card\_id": "card\_999",  
    "card\_type": "decision",  // decision, form, chart  
    "title": "Budget Approval",  
    "data": {                   
      "amount": 5000,  
      "requester": "Alice"  
    },  
    "actions": \[                
      { "id": "approve", "label": "Approve", "style": "primary" },  
      { "id": "reject", "label": "Reject", "style": "danger" }  
    \]  
  }

**agent.suggestion (New)**

* **用途**: 在 AI 回复后，提供“猜你想问”或“快捷回复”选项 (Chips)。通常渲染在消息气泡下方。  
* **Payload**:  
  {  
    "items": \["Summarize this", "Email to team", "Retry"\]  
  }

**resource.artifact**

* **用途**: 推送生成的文件、代码文件或复杂制品。  
* **分块传输**: 对于 \>10KB 的文本制品，Server 会将其切分为多个事件发送，避免阻塞 WS 通道。  
* **Payload**:  
  {  
    "artifact\_id": "file\_abc",  
    "type": "code", // code, markdown, csv, image  
    "title": "main.py",  
    "content": "print('hello')", // 增量内容片段  
    "is\_partial": true, // true=分块传输中, false=传输结束  
    "seq": 1,           // 分块序列号  
    "language": "python",  
    "version": 1,  
    "operation": "create" // create, update, delete  
  }

#### **D. 端侧工具执行类 (Client-Side Execution)**

**agent.tool\_call**

* **用途**: 服务端指示客户端执行本地工具（Function Calling）。  
* **Payload**:  
  {  
    "call\_id": "call\_abc\_123",  
    "tool\_name": "get\_geolocation", // 或 "take\_screenshot", "read\_clipboard"  
    "arguments": {},  
    "requires\_approval": true // 是否需要用户弹窗确认  
  }

#### **E. 系统控制类 (System Control)**

**ack**

* **用途**: 简单的应用层消息回执。用于确认服务器已收到前端发送的消息。  
* **Payload**:  
  {  
    "reply\_to": "msg\_client\_uuid\_123", // 对应 Client 发送时的 Envelope.id  
    "status": "received"               // received, processing, rejected  
  }

**pong**

* **用途**: 响应客户端的 Ping，用于保活和延迟计算。  
* **Payload**:  
  {  
    "reply\_to\_ts": 1732700000123 // 原样返回客户端发送的 ts  
  }

**error**

* **用途**: 传输或处理过程中发生的错误。
* **Payload**:
  {
    "domain": "business", // 修改: 增加 business 域示例
    "type": "business/quota_exceeded", // 明确的配额错误类型
    "message": "Monthly Token quota exceeded.",
    "recoverable": false,
    "details": { 
      "resource": "llm_tokens_monthly",
      "limit": 1000000,
      "used": 1000050
    }
  }

#### **F. 通知与异步状态类 (Notifications & Async Jobs) [NEW]**

**notification.push**

* **用途**: 实时推送异步业务通知（如“邀请到达”、“任务完成”），对应架构 V3.8 的 Notification Delivery 协议。
* **Payload**:
  {
    "notification_id": "notif_123",
    "type": "workflow.completed", // 或 "invite.received"
    "title": "合同审查任务已完成",
    "summary": "耗时 3分钟，发现 2 处风险。",
    "target_url": "/workspace/conv_888", // 点击跳转链接
    "created_at": "2025-12-01T12:00:00Z"
  }

**job.status**

* **用途**: 推送后台长时任务（Async Task）的状态变更，对应数据库 `async_tasks` 表的更新。
* **Payload**:
  {
    "job_id": "job_abc_123",
    "type": "rag.index_document",
    "status": "processing", // pending, processing, completed, failed
    "progress": 45,         // 0-100 进度百分比
    "result": null,         // 完成时包含结果摘要
    "error": null
  }

### **3.3 Client \-\> Server 事件定义 (Uplink)**

**chat.input**

* **用途**: 用户发送文本消息或文件引用。  
* **Constraint**: 客户端必须生成 Envelope id 以支持乐观 UI。  
* **Payload**:  
  {  
    "text": "Please analyze this file.",  
    "files": \["file\_id\_123"\], // 引用通过 HTTP 上传的文件 ID  
    "parent\_id": "msg\_abc\_123", // (New) 父消息 ID，支持会话分支 (Branching)  
    "context": { "timezone": "UTC+8" }  
  }

**chat.typing**

* **用途**: 用户正在输入。前端应配合 Debounce (防抖) 机制发送。  
* **Payload**:  
  {  
    "typing": true  
  }

**agent.interrupt**

* **用途**: 强行打断当前生成过程。  
* **Payload**:  
  {  
    "reason": "user\_stop"   
  }

**agent.tool\_result**

* **用途**: 客户端回传本地工具的执行结果。  
* **Payload**:  
  {  
    "call\_id": "call\_abc\_123", // 对应 agent.tool\_call 的 call\_id  
    "result": { "lat": 37.77, "lng": \-122.41 },  
    "status": "success" // success, error  
  }

**interaction.response**

* **用途**: 用户对 interaction.card 的操作反馈（如点击了“批准”按钮）。  
* **Payload**:  
  {  
    "card\_id": "card\_999",  
    "action\_id": "approve",  
    "form\_data": {} // 若卡片含表单，此处回传数据  
  }

**message.feedback**

* **用途**: 用户对特定消息进行反馈（点赞/点踩/评分），用于 Insights 分析和模型优化。  
* **Payload**:  
  {  
    "message\_id": "msg\_1",  
    "rating": "like", // like, dislike, score (1-5)  
    "reason": "Answers correctly", // optional text  
    "tags": \["accuracy", "tone"\]   // optional tags  
  }

**message.pin**

* **用途**: 用户请求置顶或取消置顶某条消息。
* **Payload**:
  {
    "message_id": "msg_123",
    "action": "pin" // pin, unpin
  }

**session.update**

* **用途**: 更新当前 WebSocket 会话的元数据或上下文配置。  
* **Payload**:  
  {  
    "settings": {  
      "language": "zh-CN",  
      "debug\_mode": true,  
      "timezone": "Asia/Shanghai"  
    }  
  }

**ping**

* **用途**: 应用层心跳，用于检测连接活性和测算 RTT。  
* **Payload**:  
  {  
    "ts": 1732700000123 // 客户端当前时间戳  
  }

## **Part 4: 客户端实现指引 (Client Implementation Guide)**

1. **Connection & Reconnection Strategy**:  
   * **Initial**: 页面加载时尝试 WebSocket 连接。  
   * **Retry**: 连接异常断开（如网络波动）时，使用指数退避（1s, 2s, 4s...）重试，最大重试 5 次。  
   * **Hibernation (休眠)**: 若检测到错误码为 1000 (Normal Closure) 且原因是 Idle Timeout，**停止自动重试**。  
   * **Wake Up (唤醒)**: 在 window.onfocus 或用户输入时，立即触发重连。  
   * **Fallback**: 仅在 WS 彻底不可用（如返回 403/400）时，降级为 HTTP Streaming。  
2. **Reliability & State Sync (可靠性与状态恢复)**:  
   * **Correlation ID**: 发送 chat.input 时，前端必须生成一个 UUID (id) 并暂存在本地 PendingQueue 中，并在 UI 上乐观展示消息。  
   * **ACK Handling**: 收到 ack 事件后，将对应 ID 的消息标记为“服务器已接收”。若 5秒内未收到 ACK，UI 提示“发送失败”并允许重试。  
   * **State Rehydration (增量同步)**: 当 WebSocket 异常断开并**重连成功后**，客户端**应该**立即发起：
     1. `HTTP GET /history?after_message_id=<local_last_id>`: 拉取断线期间的新消息。
     2. `HTTP GET /api/notifications?unread=true`: [New] 拉取断线期间错过的异步通知（兜底机制）。 
3. **Latency Monitoring**:  
   * 定时（如每 30s）发送 ping 并记录发送时间 t1。  
   * 收到 pong 后记录时间 t2。  
   * 计算 RTT \= t2 \- t1。若 RTT \> 500ms，可在 UI 显示“网络不佳”提示。  
4. **Hybrid Transport for Large Payloads (混合传输 \- 最佳实践)**:  
   * **问题**: WebSocket 不适合传输大体积二进制数据（会阻塞心跳包导致断连）。  
   * **策略**: 若 agent.tool\_result 包含大于 100KB 的数据（如截图、PDF）：  
     1. 先调用 HTTP POST /api/agent/files/upload 上传文件。  
     2. 获得 file\_id。  
     3. 在 WebSocket agent.tool\_result 中仅回传引用：{ "result": { "type": "file\_ref", "file\_id": "..." } }。  
   * **小文件 (\<100KB)**: 允许直接内联 Base64 (Inline Payload) 以减少 RTT。  
5. **Artifact Chunking (分块接收)**:  
   * 针对 resource.artifact，若 is\_partial: true，前端应将内容追加到缓冲区；  
   * 收到 is\_partial: false 时，标记该制品接收完毕并触发渲染/下载。  
6. **Type Safety**: 使用 Zod Schema 对 payload 进行校验。  
   * *Example*: z.object({ text: z.string() }).parse(event.payload)。  
7. **UI Rendering**:  
   * 收到 message.delta \-\> 更新文本光标。  
   * 收到 message.user \-\> 在对话流中插入/更新其他端发送的消息。  
   * 收到 chat.typing \-\> 显示/隐藏 "Alice 正在输入..." 动画。  
   * 收到 agent.thought \-\> 更新思考过程折叠面板。  
   * 收到 agent.guardrail \-\> 显示“内容已拦截”警告，并在 UI 上标红敏感部分。  
   * 收到 agent.suggestion \-\> 在最后一条消息下方渲染快捷操作 Chips。  
   * 收到 workflow.step \-\> 在消息气泡下方更新“思考过程/步骤条”（根据 parent\_step\_id 渲染树）。  
   * 收到 interaction.card \-\> 在流中插入一个 React 组件。  
   * 收到 agent.tool\_call \-\> 检查 requires\_approval。若为 true，弹窗请求用户确认；否则执行本地 JS 逻辑并回传 agent.tool\_result。  
   * 收到 error \-\> 根据 domain 决定是自动重试（System）还是弹窗提示（Business）。
