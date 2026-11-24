# 云端版上线与清理记录

当前代码使用同一腾讯云服务器上的 Nginx、Next.js、Express 和现有 PostgreSQL。Web 和 API 监听回环端口，分别为 13000 与 14090。保留现有 COS 和账号数据。

## 域名与上线

1. **DNSPod**：`r-navigation.com`、`www.r-navigation.com` 和 `console.r-navigation.com` 已解析到腾讯云 `82.156.156.43`。
2. **HTTPS**：2026-11-24 安装了覆盖三个域名的 Let’s Encrypt 证书，有效至北京时间 2027-02-22 15:45:41。证书使用 `/etc/letsencrypt/live/r-navigation-com-rnav/`，由 Certbot 定时续期。HTTP 验证目录 `/var/www/rnav-acme` 必须随 Nginx 配置保留，续期成功后会校验并 reload Nginx。本次 `certbot renew --cert-name r-navigation-com-rnav --dry-run` 已通过。
3. **云服务器候选应用**：按 [deploy/cloud](../../deploy/cloud/) 的两个 unit 和两个环境示例组织运行配置。编译 Linux 发布件，保留旧版本及 Nginx 配置。Web 发布包采用 [Dockerfile.web](../../deploy/docker/Dockerfile.web) 同样的文件布局，将 Next standalone 内容、静态文件、`public/` 和 `service-entry.mjs` 放在 unit 指定的 Web 目录。后端目录包含编译的 `server/dist` 及运行依赖。Node 安装到 unit 指定的 `/opt/rnav/node`。写入环境文件时保留原库连接、会话与 COS 秘密，生成新网关 token 和签名密钥。
4. **数据与首发**：用现有备份方式做一次云端 PostgreSQL 备份并验证可读，在隔离库验证增量迁移 043–046 后再应用到现有云库。迁移命令需从专用运行环境提供 `DATABASE_URL`。部署首版时保留 `RNAV_FACULTY_PAPERS_ONLY=false`，以防历史论文未复核时整页清空。用控制台发布权限或 `npm run publication -- prepare/approve/activate` 分步准备、签署并激活首份快照，验证两域后再替换生产 Nginx。保留旧同步 timer，切换时将其指向新代码，避免旧任务继续按成员同步。
5. **切换与回退**：应用 [Nginx 配置](../../deploy/nginx/rnav) 前核对两个生产上游、证书和 HTTP 验证路径，执行 `nginx -t` 后再 reload。检查官网主页、成员详情、论文和文件；检查控制台登录 Cookie、普通用户与管理员权限、成员及设备管理。失败时恢复旧 Nginx 站点、服务与 timer 的版本，保持同一个云库，保留新数据和新证书。快照可通过现有 CLI 激活上一个已签名版本。
6. **论文复核**：在对外展示信息管理配置已核验的老师来源，从审核队列收录论文，复核现有论文的老师归属并勾选“已核实”。作者编辑器根据中英文姓名给出成员建议，由编辑确认关联。核对首页精选与论文数量后开启 `RNAV_FACULTY_PAPERS_ONLY=true`，生成新预览并发布。历史未通过复核的记录留在数据库和编辑器。

## 小砺接口

- `GET /api/v1/assistant/capabilities` 提供数据源状态与当前账号权限。用真实会话和控制台权限，强制改密期间禁止调用。
- `GET /api/v1/assistant/equipment` 沿用设备阅读权限，只提供查询用字段，省略借用人联系方式、序列号等内部信息。
- 后续在云上接入语雀和远程使用系统。语雀按课题组批准的知识库范围做只读检索，并返回引用链接。远程使用只提供成员可见的资源和使用说明。服务端保管外部凭证，查询始终按发起人的业务权限执行。
- 当前接口只有读取。后续新增、修改、清理工具只可由管理员（现有 `super` 账号）使用，后端还要检查对应业务权限。普通用户保留问答和检索。执行请求通过明确的业务操作传递，账号、数据库、文件的通用写入能力留在原业务服务。

## 2026-11-24 云端候选验收

已在腾讯云构建并启动 `ffba6d0`。候选源码位于 `/srv/rnav-candidate/ffba6d0`，配置在 `/etc/rnav-candidate`，数据在 `/var/lib/rnav-candidate`。systemd 单元为 `rnav-candidate-web`、`rnav-candidate-backend` 和 `rnav-candidate-db`。候选 HTTPS 监听 `127.0.0.1:13443`，Web/API 监听回环，候选数据库仅开放独立 Unix socket。

通过云端候选 HTTPS 验证分域跳转、Cookie、跨域拒绝、设备只读权限、签名发布、论文过滤、作者高亮、成员详情和注销。候选数据库只装入合成数据并应用到 046。公网主域和 `www` 仍指向现有应用，均返回 200；公网控制台已支持可信 HTTPS，返回 503 待上线。旧 Nginx 配置备份在 `/var/backups/rnav-certificate-20261124`，正式切换时使用保留新证书的版本作为回退起点。

## 2026-11-24 只读盘点

| 对象 | 生产观测 | 处理 |
| --- | --- | --- |
| PostgreSQL | 68 张表，已应用到 042。11 张监控或采购前缀表。 | 历史表保留，已应用迁移原样保存。设备对采购单仍有外键，即使当前引用行数为 0。 |
| 采购目录图片 | 1,189 条引用，指向 10 个不同媒体对象。 | 先归档并重新核对跨模块引用，再决定文件清理。 |
| COS | 56 个对象共 59,664,647 字节，56 个登记键均匹配。50 个活跃、6 个回收状态。 | 没有发现未登记的对象。回收状态本身不足以删除，需确认引用与回收保留期限。 |
| 论文 | 154 条公开库记录，当前有 1 位启用同步的老师。 | 完成老师归属复核后才切换公开筛选。 |
| 过期会话 | 138 条。 | 可在批准的维护窗口小批清理，检查条件始终为 `expires_at < now()`。 |
| 云端备份 | 约 3.3 GB，含 5 个备份内的 `node_modules`，合计约 2.57 GiB。 | 优先复核这 5 份可重装的依赖副本。确认各备份的锁文件及恢复用途后，再按目录批准清理。 |

本轮移除仓库中停用的双节点生产部署、隧道与自动启动配置，以及旧个人学术档案和全员自动同步入口。保留可复用的本地隔离演练、备份恢复和历史迁移记录。生产环境的文件、数据库、COS 和 Nginx 仍待针对具体操作批准。

隔离验收使用 PostgreSQL 14、独立生产模式 Next.js 与 Express、合成账号和论文。实际测试双域名跳转、登录 Cookie、跨域拒绝、普通用户与管理员权限、论文库修改、成员高亮与团队页链接、未公开成员与未核实论文过滤，以及签名快照审核、激活和官网读取。426 项测试、前后端构建、API 契约和 Nginx 候选语法检查通过。Lint 有 4 条既有图片用法警告。Next.js 更新至 16.4.6，生产依赖审计通过。
