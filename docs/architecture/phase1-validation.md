# 第一阶段验证记录（2026-11-01）

分支：`codex/hybrid-architecture-phase1`；基线：`0aa4ed8c`。所有写操作仅发生在本地仓库、Docker 镜像及独立 `rnav-mac-dev` 项目，不涉及腾讯云服务或数据。

| 验证 | 结果 |
| --- | --- |
| `npm test` | 521 项通过：Web 110、server 384、scripts 27，无失败 |
| `npm run lint` | 通过；4 个既有 Next img warning，0 error |
| `npm run build` | Next 生产构建与 Express TypeScript 编译通过 |
| `docker build -f deploy/docker/Dockerfile.api -t rnav-api:phase1 .` | linux/arm64 原生构建成功；API 镜像不包含 Next 页面目录/构建 |
| Compose config | `--quiet` 校验通过，不输出秘密展开值 |
| 空库迁移 | PostgreSQL14 应用全部 42 个迁移；96 个外键，与生产结构基线一致 |
| API smoke | `/api/health` DB ok；bootstrap/team/facilities 200；匿名 `/api/auth/session` 401；`/console` 404（API 容器不提供页面） |
| 任务镜像 | scholarly-sync 可选任务启动成功；隔离环境 enabled=false，正确退出，未访问实际同步数据 |
| 本地备份 | `backup-mac.sh` custom dump + `pg_restore --list` + SHA-256 校验成功 |
| 完整恢复 | 备份恢复到独立 `rnav_restore_rehearsal`；42 个迁移和96 个外键一致 |
| 数据持久化 | 重新创建 DB/API 容器，原命名卷中 42 个迁移及恢复演练库仍在；迁移重跑无 checksum 错误 |
| 秘密/差异 | `.env.mac` 被忽略、0600；备份在 ignored backups 下；`git diff --check` 通过 |

备份/恢复只使用本地新建的空业务库（含迁移初始化数据），未复制或恢复生产数据。这验证工具链和卷持久化，不代替真实生产数据迁移演练。尚未测试 x86 容器构建、独立 Next 到 API 的完整浏览器链路、云端快照、跨机网关或断网降级；这些是后续阶段验收项。

本地演练结束后停止该 Compose 项目的服务，保留命名卷、恢复库和备份，不占用常驻 API 端口；原 Minecraft 容器保持运行。`.env.mac` 仅含新生成演练秘密，可按本地说明重启。未推送 GitHub 或部署生产。
