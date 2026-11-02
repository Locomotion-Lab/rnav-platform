# RNAV REST v1契约（Phase3）

版本化入口 `/api/v1`，原 `/api` 是过渡别名。公开API由云端snapshot reader提供，业务API经Web BFF/可信私网网关访问Mac。未来Agent/小程序仍未实现Bearer/OAuth，不能给它们super Session或数据库连接。

- [OpenAPI 3.1](../../server/contracts/openapi.json)：真实路由清单，成员/认证/设备/文件/发布的请求与优先响应Schema、错误响应、安全要求与参数。
- [生成TypeScript类型](../../apps/web/lib/api-contract.d.ts)与[businessClient](../../apps/web/lib/businessClient.ts)：从相同的运行时Zod4 Schema生成输入类型，可逐步接替旧调用。
- `npm run api:contract`更新，`npm run api:check`验证OpenAPI及类型漂移；实际Zod仍负责跨字段/权限/并发版本检查，JSON Schema不替代这些检查。

Schema优先覆盖profile/admin member create/import、asset/platform/versioned mutations、Session、multipart upload、授权二进制读取、发布review/approve。领域精细规则不全部能用JSON Schema表达（如中文姓名推导、跨字段身份约束、DB引用/owner检查）；保留业务测试和E2E。旧CMS集合及部分历史管理响应仍有passthrough字段，不宣称所有109+路径都已生成完全封闭的客户端模型。

当前认证：rnav_session HttpOnly/SameSite=Lax，生产Secure；后端另需只在服务间使用的网关token，Web从secret文件注入且从不接受浏览器自带token。写接口强制Origin、首次改密和当前权限；site.publish独立于site.content.write。云端激活要求Ed25519审核签名，私钥只在Mac，发布审计在DB/云端activation日志中分别记录。

BFF丢弃任意Authorization/API-Key/转发头，使用固定RNAV_WEB_ORIGIN、编码路径段、15秒超时、禁止upstream redirect；流式计数限制22MiB请求，后端文件默认20MiB和JSON1MiB，MIME签名检查。保留204、多个Set-Cookie、Cache-Control/CSP/nosniff；身份、业务文件响应不缓存。

主要代码：VALIDATION_ERROR、VERSION_CONFLICT、AVATAR_INVALID、PUBLICATION_CONFLICT、MEDIA_TYPE_INVALID、MEDIA_REFERENCED、MEDIA_NOT_FOUND、MEDIA_SIZE_INVALID、GATEWAY_REQUIRED、WRITE_FROZEN、ORIGIN_DENIED、PAYLOAD_TOO_LARGE、UPSTREAM_UNAVAILABLE；旧接口兼容error文本。409需重读版本，403不得重试提权，503在隧道/冻结状态恢复后重试，幂等只读可有限重试；没有默认重试非幂等写入。
