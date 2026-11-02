# RNAV Platform

课题组官网与内部成员、设备和文件管理平台。继续使用 Monorepo；Web 与业务后端独立运行。

| 逻辑模块 | 目录 | 运行位置 |
| --- | --- | --- |
| rnav-web | apps/web | 腾讯云：Next 官网、/console、/ai、同源 API 网关及公开快照 reader |
| rnav-backend | server | Mac mini：Express REST v1、账号/权限/成员/设备/文件、PostgreSQL |
| rnav-agent | 后续独立服务 | Mac mini：Agent/RAG 经最小权限 API 访问业务，不直连主库 |
| rnav-miniapp | 暂不开发 | 未来共享后端 API |

Monitor 和 Procurement 的运行代码已移除；历史表、文件、已应用迁移和跨域引用保护保留。开发分支尚未部署到生产，线上仍运行原版本。

## 开发与验证

```bash
npm ci
cp .env.example .env
# 填写本地数据库连接和独立随机秘密，不使用生产凭证。
npm run db:migrate
npm run dev:server
# 另一个终端
npm run dev:web
```

Express 默认为 `127.0.0.1:4090`，Next 为 `3000`。不再存在 unified 启动或 Next fallback。`RNAV_API_INTERNAL_URL` 配置独立业务后端；云端 Web 设置 `RNAV_PUBLIC_SOURCE=snapshot`、`RNAV_PUBLIC_ROOT` 后完全从本地发布版本读取公开数据和媒体。

```bash
npm run build:backend
npm run build:web
npm test
npm run lint
npm run api:check
```

## 架构与操作文档

- [最新目标、阶段计划与历史归档边界](docs/architecture/target-2026-11-02.md)
- [独立 Compose、发布、备份恢复与待审批切换方案](docs/architecture/modular-operations.md)
- [API v1 契约及当前覆盖边界](docs/api/README.md)
- [本阶段改动及验证记录](docs/architecture/phase2-validation.md)
- [Phase 1 实际环境审计（历史）](docs/architecture/audit-2026-11-01.md)
- [论文同步操作](docs/scholarly-sync-operations.md)

Mac 配置见 compose.mac.yaml；独立云端 Web 配置见 compose.web.yaml。数据库、内部文件、发布包和秘密不提交 Git。生产写入、重启、部署、历史数据或 COS 清理必须另行明确批准。
