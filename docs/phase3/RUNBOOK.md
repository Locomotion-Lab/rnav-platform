# Phase 3 生产迁移 Runbook（2026-11-02）

**当前是可审阅、可演练的候选方案，不是执行授权。正式迁移当前 No-Go。** 所有生产写入、真实数据/私有文件/凭证复制、重启、隧道和流量操作须先批准 [变更单](APPROVALS.md) 的对应编号及维护窗口。下文生产命令不得提前运行。开发分支为 `codex/production-readiness-phase3`，保留旧源码/库/配置及COS。

## 0. 固定位置、账户、时间窗口

| 名称 | 准确位置/值 |
| --- | --- |
| Mac源码 | `/Users/aaron/Projects/rnav-platform`，锁定审阅的Phase3 commit |
| Mac配置 | `/Users/aaron/.config/rnav/production.env`（非秘密参数0600）；`secrets/`（0700目录，0600文件） |
| Mac业务 | `deploy/production/compose.mac.yaml`，project `rnav-production`，API仅`127.0.0.1:14090`；PG无宿主端口 |
| 云旧源码/服务 | `/srv/rnav_platform`，`rnav-platform.service`，4090；旧库`rnav_platform` PG14 |
| 云新源码/配置 | `/srv/rnav_phase3`；`deploy/production/cloud.env`（复制example编辑），`secrets/`仅网关token与签名验证公钥 |
| 云公开/接收 | `/srv/rnav_public`、`/srv/rnav-incoming`；Web UID/GID1000（实际ubuntu UID已核实1000），公开目录由ubuntu激活 |
| 云新服务 | `deploy/production/compose.cloud.yaml`，Linux host网络，Web仅`127.0.0.1:13000`；反向隧道仅`127.0.0.1:14090` |
| 候选Nginx | 回环`127.0.0.1:13080`，不变更正式80/443；正式候选模板`deploy/nginx/rnav`目标13000 |
| 生产备份目录 | `/var/backups/rnav-phase3`（postgres原始dump，仅0700）；`/home/ubuntu/rnav_backups/phase3`（加密副本和校验清单） |

全程记录 UTC 时间、commit、镜像digest、批准人、当前publicationId、source/target manifest hash。命令示例中的日期目录必须由值班人设为当次唯一名称，不复用或覆盖旧目录；例中`FINAL`用当次目录名替换。禁止`down -v`、`--clean`、DROP、TRUNCATE、CASCADE、删除COS或直接覆盖目标数据库。

## 1. Go/No-Go（执行：双方值班人；风险：误把工程测试当真实验收）

只有以下全部满足才可进行步骤8正式开放新写源：

- Phase3 test/lint/build/API check/两架构镜像构建通过，部署镜像锁定digest；生产业务负责人批准P0–P6及窗口。
- 腾讯云证书已续期，`openssl x509 -in /etc/nginx/r-navigation.com_bundle.crt -noout -dates`显示至少30日剩余；现证书北京时间11月13日07:59到期，未续期No-Go。
- 生产备份可读、加密备份异机可解密，原SESSION_SECRET安全保留；不得以新随机SESSION_SECRET替换旧值。
- 独立真实数据克隆的全表manifest在迁移前完全相等；授权COS读取后，所有文件数量/字节/SHA-256验证通过；迁移后非转换表完全保留。
- 实际云到Mac受限隧道验证、断线恢复、Cookie/CSRF/媒体/公开冷启动通过；本地SSH模拟通过不替代这项。
- Mac解锁登录/OrbStack自启已实机演练，FileVault人工解锁值班及恢复时限已约定；不通过关闭FileVault来跳过此门槛。
- 独立加密异地备份接收位置/age接收者/恢复密钥保管已确认，并完成一次取回恢复。候选是腾讯云独立密文目录，后续增加第二供应商；当前仍未配置实际远端。
- 旧4092 session进程和所有可能写库的后台任务已识别；冻结步骤能确保**唯一写源**。

任一项失败：保持旧生产正常，或在维护窗口保持公开快照+内部只读；不启用Mac写入。回退方式见步骤10。

## 2. 软件、目录和独立账户（云P0–P3，未执行）

前置：保留现有SSH会话、已批准软件来源/版本。风险：sshd/Nginx错误影响运维；失败回退新增文件，不修改原运维账号。

1. 按Docker官方Ubuntu安装流程安装Engine/Compose，记录版本，**不执行发行版升级或重启原服务**。安装`age`，现有rsync/rrsync已只读核实存在。用`docker version`、`docker compose version`确认。
2. 创建锁密码、无sudo的`rnav-tunnel`用户；Mac新建专用Ed25519密钥（先`test ! -e ~/.ssh/rnav-business-tunnel`，禁止覆盖）。公钥放云该用户`.ssh/authorized_keys`，权限700/600；不复制私钥到云。
3. 将`deploy/ssh/sshd-rnav-tunnel.conf`安装到`/etc/ssh/sshd_config.d/60-rnav-tunnel.conf`，先`sudo sshd -t`，再在保留原会话下reload ssh。新账号`MaxSessions 0`、`PermitListen 127.0.0.1:14090`、禁exec/agent/X11/其他转发。原运维账号不变。
4. 创建`/srv/rnav_phase3`、`/srv/rnav_public`由ubuntu1000拥有，权限750。接收目录`/srv/rnav-incoming`通过专用发布账号/共享受限组让ubuntu可读取。发布key可用`restrict,command="/usr/bin/rrsync -wo /srv/rnav-incoming"`；不赋sudo、不允许任意远程命令。包传输使用`--chmod=D750,F640`，由ubuntu执行签名验证/激活；Web不直接读取incoming。
5. 云只安装用于验证签名的**公钥**及网关token，均位于0600配置中；签名私钥、DB密码、COS私钥、age解密私钥均不进Web容器。Cloud Compose只挂载公开目录（ro）和这两个密钥文件。

验证：`sshd -T -C user=rnav-tunnel,host=localhost,addr=<Mac出口地址>`，核对Match结果；登录/exec被拒绝、非14090转发被拒绝。回滚新增Match文件后`sshd -t`并reload，不关闭旧SSH会话。

## 3. 镜像与Mac空节点准备（Mac；尚不用生产数据）

```bash
cd /Users/aaron/Projects/rnav-platform
npm ci
npm test && npm run lint && npm run build && npm run api:check
# Mac ARM与云amd64分别构建、记录image ID；正式使用固定digest。
docker build -f deploy/docker/Dockerfile.api -t rnav-backend:phase3 .
docker build --platform linux/amd64 -f deploy/docker/Dockerfile.web -t rnav-web:phase3-amd64 .
docker build -f deploy/production/Dockerfile.dbtools -t rnav-dbtools:phase3 .
```

镜像可通过加密SSH传`docker save`归档，先SHA-256，再经批准在云`docker load`；或用授权私有registry。镜像不含真实secret/data/publication。云不现场构建，避免2vCPU/3.6GiB资源争用。

先复制`deploy/production/mac.env.example`到Mac操作配置文件并填非秘密值；最终`BACKEND_WRITE_ENABLED=false`。必须先完成步骤4的秘密导入，以下启动命令才能执行。预演使用 rnav-candidate，保留 rnav-production 供最终空库恢复。配置以下命令统一使用同一文件：

```bash
export RNAV_SECRETS_DIR=/Users/aaron/.config/rnav/secrets
# 以下简写 MAC 仅用于当前shell；任何新shell先设置相同配置，禁止漏掉env-file。
MAC=(docker compose -p rnav-candidate --env-file /Users/aaron/.config/rnav/production.env -f deploy/production/compose.mac.yaml)
"${MAC[@]}" config --quiet
"${MAC[@]}" up -d --wait db
```

**真实恢复前只启动db，不启动migrate/api**；bootstrap只创建空库与三种角色，不建业务表。`rnav_migrator`是非super/非CREATEDB库所有者；`rnav_app`仅DML、无schema CREATE、无migration/catalog/退休表写入。此前已初始化的卷不会重新执行init脚本；不满足空库条件就另建project/卷，禁止重置旧卷。

## 4. 生产基线与备份、秘密安全保管（云P4；未执行）

正式源库在冻结后才是最终数据；可先经授权做一次克隆演练，之后在步骤8冻结后重做以下最终备份。

```bash
# 腾讯云（全部须P4批准）：新目录不可复用
sudo install -d -m 700 -o postgres -g postgres /var/backups/rnav-phase3/FINAL
install -d -m 700 /home/ubuntu/rnav_backups/phase3/FINAL
sudo -u postgres pg_dump -d rnav_platform -Fc -f /var/backups/rnav-phase3/FINAL/database.dump
sudo -u postgres pg_restore --list /var/backups/rnav-phase3/FINAL/database.dump >/dev/null
sudo sha256sum /var/backups/rnav-phase3/FINAL/database.dump
# 使用事先核验的age接收者公钥加密；解密私钥不放云端。
sudo cat /var/backups/rnav-phase3/FINAL/database.dump | age -r "$AGE_RECIPIENT" -o /home/ubuntu/rnav_backups/phase3/FINAL/database.dump.age
sudo cat /srv/rnav_platform/.env | age -r "$AGE_RECIPIENT" -o /home/ubuntu/rnav_backups/phase3/FINAL/legacy.env.age
sha256sum /home/ubuntu/rnav_backups/phase3/FINAL/*.age
```

把checksum保存到受控manifest，确认加密归档非空；不要把秘密打印到终端、命令行参数、工单或Git。COS此时保留全部原始对象，清单工具`cos-inventory.mjs`只输出总数/字节/引用匹配。需要真实对象复制的操作须P4明确包括私有文件及短期只读COS凭证。

在Mac受控目录取回密文，先核对密文SHA，再`age -d -i <独立恢复密钥文件>`解密到0700目录内的0600文件。数据库原始hash再次核对。使用**新目录**生成DB新凭据并保留旧环境中的业务加密秘密：

```bash
# Mac：下列legacy.env是获批安全解密文件，绝不source或cat。
node scripts/phase3/init-secrets.mjs /Users/aaron/.config/rnav/secrets --legacy-env=/ABS/PRIVATE/TRANSFER/legacy.env
# 工具拒绝已有目录；如已有演练secrets，另用新的生产目录，不覆盖。
```

SESSION_SECRET/PASSWORD_PEPPER保留旧值；DB角色密码、网关token和签名密钥为新值。COS secret仅给一次性迁移pod，不给正常后端。恢复解密密钥另存在密码管理器/离线介质；不得把它与加密包一起存放。

## 5. 空库恢复、角色与COS迁移（Mac P4；未用真实数据执行）

`db-transfer.mjs`默认dry-run；`--apply`仅用于明确授权目标。将原始dump和database.sha256，或联合备份格式checksums.json置于配置的`RNAV_BACKUP_DIR/FINAL`。pg14工具在dbtools镜像中，不依赖Mac宿主机版本。

```bash
"${MAC[@]}" --profile maintenance run --no-deps --rm dbtools node scripts/phase3/db-transfer.mjs restore /backups/FINAL
"${MAC[@]}" --profile maintenance run --no-deps --rm dbtools node scripts/phase3/db-transfer.mjs restore /backups/FINAL --apply
```

工具要求public Schema没有任何表/函数，checksum正确，恢复为单事务/exit-on-error/no-owner/no-privileges；不清理或覆盖已有对象。恢复失败保留失败环境，改新空project重试。

源和目标都运行`db-manifest.mjs`（只读、UTC时间标准化、每表计数/排序行指纹/迁移校验和）。源可经批准通过SSH stdin运行脚本，输出只写私有manifest文件；目标用迁移pod运行。同一源freeze窗口的两个manifest必须在**升级Schema前**完全相等：

```bash
node scripts/phase3/verify-manifests.mjs /ABS/PRIVATE/source.json /ABS/PRIVATE/restored.json
"${MAC[@]}" run --no-deps --rm migrate
```

migrate安装43/44/45增量SQL及app grants，不改42个历史SQL。随后媒体迁移先dry-run再获批apply：

```bash
"${MAC[@]}" --profile migration run --no-deps --rm media-migrate
"${MAC[@]}" --profile migration run --no-deps --rm media-migrate node_modules/.bin/tsx scripts/phase3/migrate-media.ts --apply
# 再跑一次应只剩0个COS行；已迁移对象不会重写或重新下载。
"${MAC[@]}" --profile migration run --no-deps --rm media-migrate
```

工具按原SHA-256内容寻址、本地.partial+源ETag/长度断点、1MiB分块、3次失败重试、完成后源身份及SHA校验、exclusive发布、数据库CAS+迁移journal事务更新。冲突/校验失败不改目标DB，部分文件保留供检查/续传。重复内容共用字节，但journal阻止未经归档审批的物理删除；旧COS对象不删除、旧URL保留，公开发布器可通过原URL注册记录读取本地副本。COS迁移只处理注册对象，不抓取外部论文URL。

迁移后生成新manifest，用`verify-preservation.mjs`核实除schema_migrations/permissions/media_assets/journal外全部核心和历史表不变；媒体条数不变，并按DB checksum逐对象验证本地文件。真实system_secrets必须在保留旧SESSION_SECRET的容器中做受控解密健康验证，不输出内容，不调用真实外部AI/学术任务。

文件映射单独回退可先运行`revert-media.mjs` dry-run，获批后`--apply`仅将当前仍匹配journal的provider/key恢复COS，保留本地字节及journal；不得据此删除新上传数据。业务已发生新写入的整站回滚按步骤10处理。

## 6. 首次发布与候选独立Web（Mac/云P3/P5）

目标DB已恢复/升级并验证，Mac仍写冻结。因所有POST含登录/发布都会冻结，**仅在隔离克隆演练或受控首次准备窗口**先使用迁移pod的CLI生成包和签署；上线后正式运营使用具有`site.publish`权限的API并写DB审计。

```bash
# Mac CLI：保留公共投影边界，不从完整private-media目录递归拷贝
"${MAC[@]}" run --no-deps --rm api node_modules/.bin/tsx scripts/publication/cli.ts prepare /data/publications/FIRST
# 阅读快照/媒体清单，与公开基线对比；确认成员public_fields、设备public_profile、完整PDF和撤回差异。
"${MAC[@]}" run --no-deps --rm api node_modules/.bin/tsx scripts/publication/cli.ts approve /data/publications/FIRST REVIEWED_SHA256
```

服务环境为签名key文件设置PUBLICATION_SIGNING_KEY_FILE；CLI首次签名的PUBLICATION_REVIEWER应设为批准工单/值班身份。正式API `/api/v1/publications/prepare`、`GET /:id`、`POST /:id/approve`需要独立site.publish权限、Session、同源，数据库记录审核事件；普通CMS编辑不能批准。

Mac先设置`PUBLICATION_VERIFY_KEY_FILE`为本机可信公钥。通过受限rsync账号将**仅含snapshot.json、approval.json、清单媒体的目录**传至云incoming；工具验证签名后另建临时白名单目录，多余文件不会传输。云端目录名为工具输出的真实publicationId（下文FIRST需换成此ID，Mac原草稿目录名可以不同）。`sync-publication.sh`默认dry-run，只接受已核验的rnav-publication SSH alias，`--apply`后才传输。签名私钥不传云，验证公钥及网关token通过独立秘密通道传入云secrets。云端由ubuntu核对目录权限后激活：

```bash
cd /srv/rnav_phase3
export PUBLICATION_REQUIRE_SIGNATURE=true
export PUBLICATION_VERIFY_KEY_FILE=/srv/rnav_phase3/secrets/publication-verify.pem
npm run publication -- activate /srv/rnav-incoming/FIRST /srv/rnav_public none
# 后续必须把none替换为当时current的真实publicationId；过期expected-current拒绝，不覆盖。
CLOUD=(docker compose --env-file deploy/production/cloud.env -f deploy/production/compose.cloud.yaml)
"${CLOUD[@]}" config --quiet
"${CLOUD[@]}" up --no-build -d --wait web
```

CLI激活需Node/npm及workspace操作依赖；云已有Node24.18/NPM11.16，非登录SSH须显式NVM PATH。可在候选源码目录受控npm ci安装操作依赖（P1/P3批准），不在旧部署目录安装。激活强制签名、checksum、正向字段白名单、媒体清单/类型/大小/哈希、当前版本CAS及激活日志；失败保留上版。Nginx无发布根目录alias。

断开隧道并重启候选Web；用Host头经13080访问7个公开页面、34个当前成员详情、所有图片/PDF及Next图片优化接口。GET公开API/媒体不能依赖Mac/COS。撤回后源站旧媒体404（缓存60秒），回滚旧批准版本需显式expected-current，保留审计。外部arXiv等链接可跳往外站，不将其正文复制列为发布前提。

## 7. 安全通信、并行网关和真实链路验收（P2/P5）

Mac根据`deploy/ssh/mac-config.example`创建受控SSH配置（固定known_hosts中的云host key，不能使用StrictHostKeyChecking=no）。先前只读SSH rnav认证指纹可人工核对后固定到新配置；不能盲信新host key。

```bash
# Mac：只在P2/P5批准后启动，对生产sshd建立转发本身也是写入运行状态。
ssh -F /Users/aaron/.config/rnav/ssh_config -NT rnav-business-tunnel
# 云：另一个会话
ss -lnt | awk '$4 ~ /14090|13000|5432/'
curl --fail --max-time 5 http://127.0.0.1:14090/api/health
```

14090必须仅127.0.0.1；Mac14090亦只loopback，PG无公网/宿主绑定。正常API缺少网关token403；不能用公网curl加伪造forwarded头绕过。只在Web内存注入网关token，浏览器不持有。

安装候选nginx配置前`nginx -t`，reload后通过`127.0.0.1:13080`加`Host: r-navigation.com`模拟HTTPS入口（PUBLIC_ORIGIN仍https）。实际浏览器验收需在经授权的HTTPS测试域名/受控正式窗口完成，不能把HTTP curl看作Secure Cookie浏览器验收。

验证：登录/注销204+Cookie清理、最低权限成员读写自己资料、管理员设备改动、拒绝越权/不可信Origin/超限上传、私有文件owner与非owner、签名发布拒绝、隧道断开503、Web冷启动公开数据200、隧道重连业务恢复。Mac LaunchAgent模板只在验证后安装并bootstrap；正确安装位置和日志见deploy/launchd，不影响Minecraft。备份锁期间mac-start跳过，避免自动拉起写服务破坏一致性。

## 8. 最终冻结、增量收敛和正式切换（P6）

前置：第1节全部通过、负责人批准开始；当前生产数据没有被修改/导出。采用**冻结后完整重导出**，因源库约32MB/媒体约60MB，不冒充已实现CDC。先前克隆只作演练，最终包换新空目标，不能直接覆盖有旧数据的DB。

1. 再次确认rnav_platform_app角色仅用于此平台，已锁定回滚LOGIN命令。通知成员进入维护窗口、设备监控/采购停止使用。停止旧scholarly timer及其正在运行任务；确认4092 session进程的当前PID/cwd/exe，审批后停止该旧写者。保留旧服务定义/目录，不删除。
2. 候选公开包先就位，正式HTTPS路由可先进入“公开快照+内部503”的维护状态。此时Mac BACKEND_WRITE_ENABLED=false，不能出现第二写源。
3. 对旧生产库设置数据库级默认只读，并终止旧连接，防止未发现的旧进程重新写入：

```sql
-- 云：获批后以postgres连接 postgres 数据库执行。必须确认此平台库没有其他共享业务。
ALTER ROLE rnav_platform_app NOLOGIN;
ALTER DATABASE rnav_platform SET default_transaction_read_only = on;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname='rnav_platform' AND pid<>pg_backend_pid();
```

4. 停止旧rnav-platform服务（此时官网已由独立快照保持在线），验证旧API不再有写入连接；`pg_stat_activity`只看用户/状态，不输出查询中的敏感参数。重做步骤4最终dump、source manifest及全部COS引用清单，源保持只读直到观察期结束。
5. 先停候选写者（保留卷），切到未使用的最终project：

```bash
"${MAC[@]}" stop api job
MAC=(docker compose -p rnav-production --env-file /Users/aaron/.config/rnav/production.env -f deploy/production/compose.mac.yaml)
# 若 rnav-production_postgres_data 已存在，No-Go：核实来源或选择新project并同步修改启动/备份配置，不能删除重置。
"${MAC[@]}" up -d --wait db
```

在该新空Mac project/卷重复5–7，确认最终clone与冻结源manifest相等，再升级Schema/迁媒体/签最终包并激活云版。这里无需追增量，因为冻结后的完整导出包含全部最终写入。之前演练卷不覆盖、保留。
6. 将新Mac部署明确设为唯一生产project与备份项目名，改生产env BACKEND_WRITE_ENABLED=true，再`MAC up --no-build -d --wait api`；旧云库仍只读，旧写服务仍停。顺序不能反过来。
7. 云`nginx -t`后在已有SSL server中把upstream从4090改为13000，使用候选`deploy/nginx/rnav`的Host/请求大小/超时/WWW canonical redirect；先将旧完整配置复制到当次备份目录，再reload。只有新增Web路由和网关，没有开放DB/内部端口。

步骤3后任何异常：维持内部只读/503、公开快照在线，先核实源冻结状态；若新Mac从未开放写入可按步骤10恢复旧库；一旦有新写入进入B分支，禁止直接回旧库。

## 9. 正式切换后验收（双方值班人）

按最低权限普通成员与独立管理员分别验证：登录、强制改密限制、本人资料版本冲突/公开字段、账号权限；设备读取/修改/领用及public profile、历史采购FK仍在；PNG/JPEG/WebP/PDF上传、类型伪装/超限拒绝、私有访问/回收/恢复、被业务引用文件拒删；历史COS迁移后公开图片和论文PDF；签名审核/发布/撤回/回滚与审计。

用真实HTTPS浏览器检查Session Secure/HttpOnly/SameSite，恶意Origin、伪造网关头、任意文件路径均失败。断开Mac网络、Web重启、隧道恢复分别验证官网和内部服务预期。运行`probe.mjs`进行业务健康检测，与公开Web健康分开。记录实际服务耗时、内存、恢复时长，RTO/RPO以实测为准。

验收未通过保持维护模式；不删除旧库、旧目录、COS或备份。观察至少7天并完成一次异地取回恢复后，才单独审批退休数据归档清理。

## 10. 失败、回滚及新数据保全

**A：新节点未接受任何业务写入。** 保留失败节点和日志/包；恢复旧Nginx配置，`nginx -t`；把旧rnav_platform_app恢复LOGIN、旧库default_transaction_read_only恢复off，重启旧主服务和原定时器，再验收。不能在旧服务仍读到只读连接时宣布恢复；旧4092不默认重启，由已核实的原部署责任人确认。保存本次真实dump和失败清单。

**B：新节点已接受写入。** 先把Mac BACKEND_WRITE_ENABLED=false并停止API/任务、取得联合DB/文件/发布包备份和新manifest；旧云库继续只读。优先修复候选Web/隧道或回滚应用代码、继续用新主库。若必须回云，则在云端**新库**完整恢复Mac PG14 dump及所需本地媒体，迁移/兼容性演练后让可兼容Phase3后端读新库；旧一体化0aa代码不支持local provider，不能直接指向新库。生产拓扑回退本身需新审批。没有自动、无损的“把新库合并回旧库”快捷命令；用户增删改不能靠timestamp覆盖或旧库快照恢复。

故障切主期间官网继续读最后批准快照。恢复到已签名旧公开版只变current，不还原内部DB。删除/回收后有历史包持有的媒体仍须保留授权副本，不能用回滚当作丢弃新数据的手段。

## 11. 日常运维与恢复演练

每日03:00项目备份模板为`com.rnav.backup.plist`+`nightly.sh`：项目写者停止、联合dump+files和校验后立即恢复原API运行状态，再age加密并受限SSH上传，避免网络失败延长内部停写。Mac backend Agent发现backup.lock不拉起写者。保持7日+4周副本，不自动删除仅存备份；先验证远端checksum、每月取回在新project恢复，再审批清理策略。

`bundle.py`与`db-transfer.mjs`默认dry-run；恢复只接受新目录/空库，tar拒绝路径穿越/链接/设备节点。`offsite.sh`可使用dbtools镜像内age，不要求宿主安装age；解密身份不进云。日常保留磁盘余量、日志轮转、失败作业告警、certificate到期预警、隧道/内部API单独探针。当前Mac FileVault首次解锁是明确的人为依赖；不得承诺断电后零人工RTO。


联合备份的文件恢复（仅新目录/新卷）：先 `python3 scripts/phase3/bundle.py restore --directory /ABS/VERIFIED/BUNDLE --files-target /ABS/NEW/RESTORED --apply` 做完整checksum和安全tar验证，再将这个新目录的 private-media/publications 重新打包流入新project：`tar -C /ABS/NEW/RESTORED -cf - private-media publications | "${MAC[@]}" run --no-deps --rm -T api tar -C /data -xf -`。随后遍历恢复DB中的local对象校验SHA-256，成功前写入开关保持false。不得直接覆盖当前生产卷。
