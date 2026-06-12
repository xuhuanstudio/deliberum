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

当前实现已经包含：协议 schema、追加式事件账本、Topic Contract、密封发散、Extraction Proposal、Process Proposal 生命周期、候选前沿/异议/质量义务投影、Final Audit、Outcome Compilation、CLI final candidate/audit/outcome projection commands、CLI daemon-backed final lifecycle submissions、CLI daemon resource access revocation、本地 daemon、Web UI 壳、safe daemon runtime profile status、daemon-backed session catalog、daemon run workspace、daemon-redacted run event timeline/SSE、CLI daemon resources/evidence projection reads、Web process proposal lifecycle、final lifecycle controls 与 accepted proposal execution controls、session final lifecycle/projection endpoints、session resources projection endpoint、安全资源交付审计历史、session-scoped resource delivery planning endpoint、allowed URL 与 hosted in-memory content delivery 的短 TTL 可撤销 daemon resource access grant、只读 adaptive process proposal 建议、显式 accepted process proposal execution、参与者 adapter 接口、HTTP-template participant adapter/profile、OpenAI-compatible participant/extraction/review/finalization components、Resource Broker / Delivery Planner、实验性 WebGET，以及投影元数据、幂等结果一致性、SSE 幂等发布保护、WebGET 上下文可见性和资源交付安全加固。

项目仍然是本地优先、预生产状态。当前 daemon 支持 in-memory 默认存储、带本地连接级写入串行化的可选 SQLite event ledger/run metadata 持久化，以及 JSON 持久化 fallback。尚未实现的部分包括：durable store 生产级多写者协调、更完整的 accepted process proposal primitive runner 覆盖与自动策略、公开/签名资源托管、MCP adapter、完整交互式 provider setup，以及生产级认证和多人部署。
