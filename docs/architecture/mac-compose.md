# 第一阶段：隔离 Mac API 演练

仅适用于本地空库。不是生产部署说明；当前官网仍是原一体化架构。该阶段不提供云端公开快照或完整 AI，不应把云端 API URL 直接指向 Mac 后就切换生产。

## 启动

```bash
cp deploy/docker/mac.env.example .env.mac
chmod 600 .env.mac
# 为四个秘密字段分别生成随机值（例如 openssl rand -hex 32），填写 .env.mac。
# POSTGRES_PASSWORD 使用十六进制字符；DATABASE_URL 中不接受未编码的特殊字符。
# 演练保持 SCHOLARLY_SYNC_ENABLED=false，不填写生产 COS 凭证。
docker compose --env-file .env.mac -f compose.mac.yaml config --quiet
docker compose --env-file .env.mac -f compose.mac.yaml up --build -d --wait api
curl --fail http://127.0.0.1:14090/api/health
```

迁移在独立 `migrate` 一次性任务中完成后 API 才启动，应用启动本身不自动迁移。SQL 及编译迁移器均包含在镜像中。API-only 模式不会导入/prepare Next；官网仍可按原命令运行。迁移会写入本地空库，不应用生产 DATABASE_URL。

PG 不发布宿主机端口；API 只绑定 Mac 127.0.0.1:14090。容器 bridge 允许访问 COS/学术服务；不是出站隔离沙箱。首次初始化使用 POSTGRES_USER=rnav（PG 镜像的引导超级用户），仅供隔离演练；生产须分离迁移角色和受限应用角色后才能采用，不把该 Compose 直接作为生产最终配置。

`postgres_data` 命名卷保留主库数据。媒体继续由 COS 持久化；此版本没有本地媒体文件后端。未来 RAG/Agent 的文件卷、限额、运行镜像和鉴权须在对应阶段明确，当前不拉取占用内存的模型/向量库占位服务。

后台任务手动调用（确认使用隔离库和隔离凭证后）：

```bash
docker compose --env-file .env.mac -f compose.mac.yaml --profile jobs run --rm scholarly-sync
```

不在容器里运行 cron；未来在宿主机 scheduler 或专用任务服务调用同一命令，确保单实例及任务锁。第一阶段尚未接管云端 timer。

## 本地备份与恢复演练

```bash
bash scripts/ops/backup-mac.sh
# 脚本只操作上述本地 Compose DB；生成 0600 custom dump，验证目录可读取并附 SHA-256。
# 完整可恢复性还必须执行以下恢复演练。
```

备份含内部数据，应加密并复制到异地；根目录 backups 已忽略。更改输出路径时仍须放在仓库外或 backups 下，禁止上传。sha256 文件应随归档保存。

恢复到**另一个不存在的演练库**（按实际备份路径替换）：

```bash
shasum -a 256 -c backups/mac/REPLACE.dump.sha256
docker compose --env-file .env.mac -f compose.mac.yaml exec -T db createdb -U rnav rnav_restore_rehearsal
docker compose --env-file .env.mac -f compose.mac.yaml exec -T db pg_restore -U rnav -d rnav_restore_rehearsal --exit-on-error --single-transaction --no-owner --no-privileges < backups/mac/REPLACE.dump
docker compose --env-file .env.mac -f compose.mac.yaml exec -T db psql -U rnav -d rnav_restore_rehearsal -c 'SELECT count(*) FROM schema_migrations;'
```

已有目标库会导致 createdb 失败，应停止检查，不执行 drop/reset。重跑迁移是显式运维操作；不编辑已应用 SQL。备份不会包含 COS 对象或未来知识库卷，需按架构审计文档单独备份并记录一致性时间。

停止演练用 `docker compose --env-file .env.mac -f compose.mac.yaml stop`。保留卷，不使用 `down -v`；不清理其他项目容器、镜像或数据。
