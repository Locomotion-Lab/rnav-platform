# Phase3验证报告（2026-11-02）

基线62d53af，分支codex/production-readiness-phase3。所有写入仅限新建项目Docker/合成数据/仓库；腾讯云仅只读SSH。没有生产备份落盘、私有文件下载、真实数据库复制、服务重启、生产隧道或流量切换。

## 已实际完成

| 项目 | 结果/证据 |
| --- | --- |
| 全量测试 | 430项：Web88、Backend323、publication6、scripts13，全部通过 |
| lint/build/API check | lint 0错误、4个既有img警告；Next与TS完整生产构建成功；OpenAPI及生成客户端类型漂移校验成功 |
| Docker | backend/web ARM与linux/amd64均构建成功；dbtools PG14+Node+age构建成功；本地amd64采用仿真构建，不宣称云端容器已运行 |
| 依赖安全 | 修复Next、Express依赖、multer、sharp及Zod；Next16.4.3、Zod4.6.7，production npm audit 0；含开发工具全树仍17个moderate（0 high/critical），列入非运行时剩余风险；backend prune dev依赖；没有把此结果等同OS/全部供应链无漏洞 |
| 数据库权限 | 独立非super rnav_migrator/rnav_app；实际SQL确认app无schema CREATE、无migration/退休采购写权限、有核心UPDATE；新PG卷初始化、45迁移、应用健康通过 |
| 真实HTTP合成数据 | Session登录/注销、完整资料PUT、设备创建/更新/public profile、文件上传/私有读取/回收/恢复成功；CSRF、无网关、类型伪装、普通成员跨owner读取/绑定图片、无发布权限请求拒绝 |
| 历史/外链兼容 | arXiv链接真实进入发布包而不下载；COS SDK通过隔离HTTP仿真源实际HEAD/GET/Range；真实腾讯COS仅list元数据，没有正文校验（等待P4） |
| 公开审核 | 发布API使用site.publish，普通编辑/普通成员403；Ed25519签名、hash审核、actor/DB/激活日志；错误key、错误hash/旧current/私有未知字段/坏媒体/非法路径/symlink被拒绝；只传白名单文件的stage回归通过 |
| 离线独立官网 | 两个隔离网络命名空间之间实际SSH反向连接；Mac侧真实Backend/PG，云模拟侧独立Web。SSH固定host key，仅允许14090 loopback，exec/其他端口被拒绝；断链503，Web重启后7个公开页/成员详情/PNG优化/PDF仍200，重连401/session入口恢复 |
| 撤回/回滚 | Phase2协议回归继续执行；Phase3签名旧版激活/错误签名拒收通过；当前媒体清单控制撤回，历史已批准版本可回滚且记录审计 |
| 备份恢复 | API停写后联合dump+files；另一个全新PG14 project恢复。全部表计数、UTC排序行指纹、45迁移checksums完全相同；全部local媒体SHA匹配；恢复API默认写冻结503；源卷未覆盖 |
| 加密 | 使用dbtools内age实际加密/解密归档、cmp字节一致；没有向真实异地目标写入 |
| 部署配置 | production Compose config --quiet通过；Nginx候选及正式模板在隔离Nginx1.28 syntax-test通过（http2旧写法仅兼容警告）；3个launchd plist及shell语法检查通过，未安装系统启动项 |
| 生产再盘点 | 68表/96FK/42迁移，COS56对象全部匹配数据库引用；服务0aa4ed8健康；原43个仓库迁移内容未改，44/45只在隔离目标应用 |

## 此轮修复的实际缺陷

1. 外部PDF误分类；源媒体未与DB SHA/size比对；只靠私有字段黑名单；审核无签名/独立权限；传输整个目录可能带出extra文件。
2. BFF登录未做Origin校验、请求体完整缓冲无上限、redirect与网关信任不足；增加有界读取、服务密钥、固定Origin、上传错误和响应头处理。
3. Phase2设备UPDATE漏用$22而绑定$23，实际PG报42P18；已在真实更新流程修复验证。
4. 旧039约束与public_fields默认值不匹配，最小新成员行INSERT失败；045只更改未来默认，不重写已有同意字段。
5. profile仅检查图片存在，允许绑定非本人图片；现在仅owner/原有avatar/有权管理员，普通成员已实测拒绝。
6. 依赖告警的高危/严重漏洞；Zod升级后保留原strict导入行为，修正错误字段结构，并使用其内置JSON Schema生成器。
7. 备份与restore checksum格式不一致、指纹时区差异、启动Agent可能在备份时拉起API、SSH回环到容器网络边界、未校验旧CMS monitor遗留字段等准备缺陷。

## 未被这些结果证明的事项（正式迁移门槛）

- 未执行真实云↔Mac反向隧道或长期WAN/断电恢复；没有修改生产sshd/防火墙/服务。隔离SSH测试不能冒充真实跨节点验收。
- 未复制真实生产数据/私有COS字节，不能声明真实56对象SHA已匹配；真实复原、密文解密和兼容性需授权后用同一工具执行。
- 未做真实HTTPS物理浏览器Secure Cookie/手机/Safari/Firefox/辅助技术验收；本轮是实际HTTP/协议/图片优化/字节完整性验证。
- 生产TLS北京时间11月13日07:59到期尚未续期；FileVault开机首次解锁仍需人工；远端加密备份账户/目录/恢复密钥保管未获确认。
- 没有跑生产负载/容量压测、OS镜像CVE全量扫描、真实异地取回恢复；候选容量与基础健康已核查。密码/MIME检查不等于文件恶意内容扫描，后续RAG任意附件应另建扫描/配额。
- 原始发布CLI属于受控运维key权限边界；常规业务发布应走带DB权限审计的API。自动公网接收API、Agent/小程序token认证不在本阶段实现。

**结论：工程与隔离演练具备执行授权迁移演练的基础；正式生产切换仍No-Go。** 只能在APPROVALS与READINESS门槛完成后切换，不将未经授权/未经真实验证的项目填成“通过”。
