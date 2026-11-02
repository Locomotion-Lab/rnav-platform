# 精简架构本地操作与待审批切换

适用分支 `codex/modular-platform-phase2`。11 月 1 日审计和 phase1-validation 是历史记录；最终目标以 [11 月 2 日方案](target-2026-11-02.md) 为准。不要把旧 README 的 unified 启动用于此分支。

## 独立开发、构建与部署

```bash
npm ci
npm run dev:server           # Express，默认 127.0.0.1:4090
npm run dev:web              # 另一个终端：Next，默认 3000
npm run build:backend       # 不构建 Next；同时打包 SQL 和 API 契约
npm run build:web           # 不编译 Express
npm run test:backend
npm run test:web
npm run api:check
```

逻辑模块 rnav-web / rnav-backend 保留 apps/web / server 目录；共享 `packages/publication` 只有发布协议和验证器，不包含 DB、权限或业务 service。后端 Docker 仅安装 server workspace 及所需共享包，不安装 Next；前端 standalone 镜像不含 Express 业务代码或数据库凭证。

Mac：复制 `deploy/docker/mac.env.example` 到 `.env.mac`（chmod 600），分别填写随机密码/秘密。首次隔离空库仍用 PG14，执行 `docker compose --env-file .env.mac -f compose.mac.yaml up --build -d --wait api`。43 号迁移仅增加 storage_provider 和 owner_user_id，旧对象默认 COS，不修改历史 URL/文件。引导 PG 角色仍是演练超级用户；上线前必须分离应用与迁移权限。

Web：`docker compose -f compose.web.yaml up --build -d`，挂载 `RNAV_PUBLIC_HOST_ROOT` 到 `/data/public:ro`。必须配置 `RNAV_WEB_ORIGIN=https://实际域名` 以确定公网同源边界；本地 Compose 默认 http://127.0.0.1:13000。生产模式 `RNAV_PUBLIC_SOURCE=snapshot`，无数据库环境变量；开发可用 `RNAV_PUBLIC_SOURCE=api` 预览后端公开投影。未发布快照的站点会显示显式降级内容/公开 API 503，不拿主库作隐式 fallback。

## 公开发布：生成、检查、批准、同步、激活

```bash
# 只在内部后端节点运行；本地 .env 或容器环境提供 DB 和 StorageProvider 配置。
npm run publication -- prepare /ABS/PRIVATE/STAGING/new-version
# 阅读 snapshot.json、对比上一版、核实成员公开字段和媒体清单；命令输出待审核 SHA-256。
npm run publication -- approve /ABS/PRIVATE/STAGING/new-version REVIEWED_SHA256
# 在目标节点：包已通过受限私网/SSH传入非公开 staging 后执行。
npm run publication -- activate /ABS/CLOUD/STAGING/new-version /ABS/CLOUD/PUBLIC_ROOT none
# 后续激活必须传入实际当前 publicationId，过期版本比较失败会保持 current。
```

生成使用 REPEATABLE READ READ ONLY 的业务投影；媒体字节在事务后复制，缺失/删除/大小或类型异常导致包失败，不会自动批准。当前允许取回既有固定 COS、学校 HTTPS 域名的图片/PDF，禁止跳转与任意 URL，未知域必须先审查代码白名单。内部 URL 通过 provider 读取，不开放整个私有目录。发布仅复制清单列出的文件，多余临时文件不进入云端 reader。

approve 通过 hash 把人工确认绑定到完整 snapshot.json（其中含媒体哈希）；它不是数字签名。包传输及云端激活权依赖受控 SSH/本地运维身份，没有开放公网上传 API；新增自动推送前需实现传输认证/签名与发布权限审计。当前 CLI 是手动确认点，不是已有 Web 发布按钮。

云端保存 `versions/<publicationId>`，校验完成再原子切换 current symlink。激活锁和 expected current ID 阻止并发覆盖；异常不删除上一版。中断产生的锁/未完成目录须人工检查，不自动 force 清理。回滚到已批准旧包使用同一 activate 命令并传实际当前 ID；同 ID 不允许替换不同内容。

公开媒体走 Next `/published-media/<id>/<hash.ext>`，没有 Nginx 对整个发布根的静态映射。旧版本媒体只有当其内容哈希仍在当前公开清单中才可读取；撤回后的源站请求 404。缓存最多 60 秒，不保证收回用户已下载的副本。旧版本完整文件可保留于受控目录供恢复，不能直接公开目录列表。

## 本地私有文件与历史兼容

StorageProvider 支持 local/COS；每条媒体记录带 provider，新文件进入 private_media 命名卷。local 文件只经 Session、owner 或媒体/成员管理员授权读取，不做 express.static。旧 COS URL 继续工作；此阶段没有批量下载/改写/删除历史 COS。永久删除仍检查核心及历史采购引用，已有资产采购来源 FK 保留而新导入参数移除。

当前支持头像/图片和 PDF，未实现任意附件 ACL、分块上传、病毒扫描、配额或知识库索引。Agent/RAG 服务不启动空壳容器；后续在独立服务定义原始文件、索引和元数据卷。

## 联合备份与完整恢复

`backup-mac.sh` 只备份 DB。需要数据库 + local 文件/待发布包时，停止写入服务和外部 scheduler，运行：

```bash
docker compose --env-file .env.mac -f compose.mac.yaml stop api
bash scripts/ops/backup-mac-bundle.sh
# 或 RNAV_COMPOSE_PROJECT=另一个隔离项目名 bash scripts/ops/backup-mac-bundle.sh
```

脚本拒绝有 api/migrate/scholarly-sync 写入容器运行的项目；同一窗口不要运行导入/发布等外部写任务。包含 database.dump、files.tar、SHA256SUMS，0600 权限；完成后将整包用 age/GPG 加密并复制到异地，保存恢复密钥在独立密码管理器。环境秘密尤其 SESSION_SECRET 单独加密保存，不能和 Git 一起传输。本地校验成功不等于已有异地副本，异地地址与密钥尚未配置。

完整恢复应在新项目或全新数据库/文件卷中：校验 SHA256SUMS → 使用匹配 PG14 创建空库 → pg_restore --exit-on-error --single-transaction --no-owner --no-privileges → 用新卷还原 files.tar → 配置 STORAGE_ROOT 指向恢复的 private-media → 对比全部表计数/43 个迁移 checksum/FK/媒体字节 SHA-256 → 测试 Session、权限、成员、设备、发布。保留原卷及原服务，不使用 down -v、DROP 或覆盖已有目录。

数据库 dump 不包含 COS 字节，历史 COS 需独立备份版本/对象清单。建议每日加密备份、7 日+4 周保留、月度恢复演练；需更低 RPO 时再规划 WAL。RTO/RPO 以真实演练实测为准。恢复 DB+文件应来自同一写冻结窗口，不能把两个任意日期包拼接。

## 跨节点与生产变更单（待确认、未执行）

1. 腾讯云部署独立 Web 作为候选端口，保留原 systemd/4090、旧库和 COS；受限 SSH 帐号只写指定 staging，不能修改系统配置。Mac 主动连接 SSH 私网隧道，密钥不进入项目；HostKey 固定，禁止 StrictHostKeyChecking=no。
2. 推荐云 loopback 网关 14090 经受认证出站隧道接 Mac 127.0.0.1:14090，设置 Web RNAV_API_INTERNAL_URL 指向该 loopback 地址。PG 不转发；不把 compose 内端口直接绑公网。当前未创建、配置或长期验证隧道，不能假定云已能连 Mac。
3. 本仓库 deploy/nginx/rnav 仅是候选：HTTPS 入口转发独立 Next 3000，Next BFF 再转发内部 API；覆盖 Host/Origin 及转发头，15 秒业务超时。确认上传大小、Cookie Secure、登录/改密/上传/CSRF 和恶意转发头验收后，才应用到生产。
4. 获批维护窗口：旧业务写冻结 → 加密最终 full dump、COS清单、秘密备份 → Mac 隔离恢复并逐表验证 → 新公开包审核/云端激活 → 断开 Mac并重启候选Web验证官网 → 恢复安全隧道 → 业务切换。明确停止旧 Monitor/Procurement 的请求入口/设备推送，旧历史不删除。
5. 确认新写源后再开放内部管理；只允许一个主写节点。切换后回滚须先冻结新写、备份/核对增量并演练回灌，禁止直接恢复旧可写数据库。数据清理和 COS 删除另立审批，不在此切换中处理。

上述生产备份落盘、创建账号/隧道、部署/重启或 Nginx 切换均没有执行，必须提交具体主机、路径、命令和回滚点后由用户明确确认。
