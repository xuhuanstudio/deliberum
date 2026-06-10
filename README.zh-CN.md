# Deliberum

**Deliberum** 是一个终端优先、质量中心的人机同级审议运行时。它的目标不是做一个多 Agent 聊天 demo，也不是投票系统、中心裁判系统或 MCP 包装器，而是让真人、模型、工具、网页版模型等不同入口的参与者围绕一个主题进行高质量讨论，并产出更高质量的结果。

核心思想：

- 系统发布 **Topic Contract**，而不是让某个用户作为讨论上级发第一句话；
- 所有真人、模型、工具都是同级 Participant；
- 第一轮 **密封发散**，避免早发锚定；
- 当前 **候选前沿** 投影公开的是带有 basis 元数据的 accepted active candidates，不是过早选一个“当前最佳”；完整 non-dominated frontier 语义应通过未来显式、可挑战的比较/移除 proposal 机制实现；
- 维护 **异议账本** 和 **质量义务表**；
- 根据质量缺口自适应选择红队、修复、验证、盲重构、分支、审计等原语；
- 总结、排序、白板视图、最终答案都只是 proposal，不能成为不可挑战的语义中心；
- 白板、引用、可寻址对象、WebGET、MCP 等都是支撑层，服务于最终结果质量。

公开仓库以英文为主。中文文档作为入口和设计补充保留。

## 当前状态

当前实现已经覆盖 Stage 15B runtime，并完成 Stage 16 public-readiness hardening 和 Stage 17 security/readiness hardening：协议 schema、追加式事件账本、Topic Contract、密封发散、Extraction Proposal、候选前沿/异议/质量义务投影、CLI、本地 daemon、Web UI 壳、参与者 adapter 接口、OpenAI-compatible adapter、Resource Broker / Delivery Planner、实验性 WebGET、本地 Outcome Compiler，以及投影元数据、幂等结果一致性、SSE 幂等发布保护、WebGET 上下文可见性和资源交付安全加固。

项目仍然是本地优先、预生产状态。尚未实现的部分包括：daemon 持久化 SQLite、daemon final/resource endpoints、Web final/resource live pages、完整自适应原语调度器、公开/签名资源托管、MCP adapter、HTTP-template adapter，以及生产级认证和多人部署。
