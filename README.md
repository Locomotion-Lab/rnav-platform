# RNAV Platform

课题组官网与内部成员、设备和文件管理平台。继续使用 Monorepo；Web 与业务后端独立运行。

| 逻辑模块 | 目录 | 运行位置 |
| --- | --- | --- |
| rnav-web | apps/web | 腾讯云：Next.js 公开官网 `r-navigation.com`、内部控制台 `console.r-navigation.com` |
| rnav-backend | server | 腾讯云：Express REST v1、账号/权限/成员/设备/文件，与现有 PostgreSQL 和 COS 同属云端架构 |
| 小砺智能体 | 后续功能 | 腾讯云：控制台登录后使用，通过业务 API 访问获准数据 |
| 云服务器远程使用 | 后续功能 | 腾讯云：控制台登录后使用，独立授权 |
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

当前目标是云端单节点和双域名。控制台集中管理官网内容、老师论文、成员账号及设备。该方案尚未部署。

- [云端双域名目标、论文简化与实施顺序](docs/architecture/target-2026-11-24.md)
- [云端上线、小砺接口与生产清理盘点](docs/architecture/cloud-operations.md)
- [实施进度与历史方案](docs/architecture/PROGRESS.md)
- [API v1 契约及当前覆盖边界](docs/api/README.md)
- [Phase 3 双节点准备与验证（历史）](docs/phase3/README.md)
- [老师论文同步与发布操作](docs/scholarly-sync-operations.md)

数据库、内部文件、发布包和秘密不提交 Git。生产写入、重启、部署、历史数据或 COS 清理必须另行明确批准。
