# RNAV REST v1 契约

业务后端统一提供 `/api/v1`，保留原 `/api` 别名作为过渡。前端自己的同源 `/api/...` BFF 转发到版本化后端；`/api/v1/...` 也可经 Web 网关访问。公开 API 在 snapshot 模式始终读取云端本地数据，不回退 Mac。生产源代码未切换，不要用这些说明推断线上已采用 v1。

契约：[OpenAPI 3.1 路由清单](../../server/contracts/openapi.json)，运行时 `/api/v1/openapi.json`。`npm run api:contract` 更新，`npm run api:check` 及 scripts 单元测试检测漂移。

当前 OpenAPI 明确覆盖实际路径/方法、参数、Session 与常见响应码；详细 request/response 类型仍由各 domain Zod schema、service 和现有路由测试约束，路径通过 `x-validation-source` 追踪。因此它是可核验路由契约的第一版，不应据此自动生成完整写入客户端或声称所有 DTO 已统一生成类型。下一步逐个将成员、设备、媒体 schema 导出到 JSON Schema，再生成共享客户端类型。

当前认证：`rnav_session` HttpOnly Cookie，SameSite=Lax；生产使用 Secure。写接口沿用权限、首次改密及同源检查，可信网关覆盖转发头。Web BFF 丢弃任意 Authorization/API-Key；不把浏览器上传来的转发头当可信值。内部转发 15 秒超时。大文件后续须流式处理；当前上限 20 MB。

Agent/小程序：尚未实现 Bearer/OAuth，不向其发 super Session 或数据库密码。预留受限服务身份 + 代表用户授权，权限取交集，包含 audience、scope、过期和审计请求 ID。REST v1 为共同入口；新认证适配完成及安全验收前不宣称可直接供微信小程序或无人值守 Agent 使用。

并发：沿用资产 expectedRevision、成员/媒体/CMS 的现有版本控制及审计机制；统一错误 envelope、幂等写入键和全量 DTO schema 留在后续 API 完善阶段，不能在缺少客户端迁移时一次重写全部 API。
