# 精简与独立部署阶段验证（2026-11-02）

分支：`codex/modular-platform-phase2`，基于 Phase 1 `bb9a11c`。目标以 target-2026-11-02.md 为准；前一日“暂留监控/采购、unified 默认”已被新要求替代。

## 实现与实际验证

| 阶段 | 已实现 | 验证结果 |
| --- | --- | --- |
| A 精简与独立进程 | 移除 Monitor/Procurement 页面、路由、服务、WebSocket、离线任务、专用脚本、地图依赖、导航和有效权限；后端不再 import/prepare Next | 保留成员、账号、权限、设备、CMS、论文同步、媒体及历史引用保护；退休 API 404；独立构建和 ARM 镜像成功 |
| B 版本与发布 | REST v1 + legacy 别名；OpenAPI 路由清单和漂移测试；一致性公开投影、人工 hash 批准、媒体复制、原子激活、旧版回滚 | 公开成员详情、图片和 PDF 完整；私有电话和未引用文件未进入包；损坏、路径穿越、symlink、私有敏感键、过期 expected-current 被拒绝 |
| C 官网独立 | standalone Next；snapshot reader、公开 API、媒体路由、/ai 占位、内部 API 同源转发 | 停后端后 7 个公开页面、成员详情、PNG/PDF 200；Web 冷启动后仍可读；Next 图片优化端点也返回200；内部服务不可用返回受控错误；已验证成员/媒体撤回404与旧版回滚 |
| D 存储与恢复基础 | StorageProvider local/COS，43 号 additive 迁移；私有 owner/管理员读取；DB/file 持久卷；联合备份脚本 | 本地上传/授权读取正常，匿名401；数据库与文件包恢复到另一个库和新卷，核心表计数相同、43个迁移、全部3个演练文件哈希匹配 |

全量 `npm test`：417 项通过（Web 87、后端317、共享发布协议5、scripts8）。旧模块测试随退休代码移除；保留的核心测试继续执行，新增发布完整性、回滚、存储边界、v1、代理204和契约漂移测试。`npm run lint` 零错误，4个既有 img warning；`npm run build`、API contract check、独立 Web/backend Docker ARM构建通过。

镜像隔离实测：backend `require.resolve('next')` 不可用；Web `require.resolve('pg'/'express')` 不可用。修复了过去同进程模式掩盖的 BFF 依赖：notifications/console 同源接口、204 空响应和注销 Cookie、私有文件安全响应头，standalone 公网Origin误判，以及业务/SSR超时。

## 演练数据与环境边界

所有写入仅使用新建 `rnav-modular-rehearsal` Compose 项目、随机演练密码、明确标记的合成成员/文件和数据卷，没有复制生产行。公开包和备份在 ignored data/、backups/ 下，未进入 Git。`scripts/ops/smoke-modular.mjs` 是可重复的本地核心链路演练工具，不接受远程数据库地址。

2026-11-02 SSH 仅查询：生产仍是 `0aa4ed8`，Git 工作区干净，rnav-platform active，健康端点 DB ok。没有修改生产源码、环境、数据库、COS、服务或配置，未部署候选 Nginx。

## 尚未完成及下一步

- 真实生产数据迁移、COS 对象完整性及与 local 的迁移映射演练；没有把合成数据演练称作生产恢复验证。
- 云/Mac 私网隧道与长期重连、可信转发头边界、受限 PG 应用角色、常开/断电恢复，以及真实浏览器全流程验收。
- 公网传输与自动发布尚未配置；当前是人工 approve/activate CLI，没有公网包接收 API、数字签名或 Web 发布按钮。发布签名/权限审计与自动任务需在下阶段实现。
- OpenAPI 当前是路径/方法/鉴权/验证源契约；全量 DTO JSON Schema、生成客户端、统一错误和幂等写入尚未完善。
- 异地备份地址、加密接收者和恢复密钥保管尚未配置；仅有本地已验证备份，不能宣称已有灾备能力。
- local 文件读取支持 owner 或媒体/成员管理员；任意知识库附件 ACL、配额/扫描和分块上传未实现。Agent/小程序认证与功能保持预留。
- 生产历史 Monitor/Procurement 数据、外键和 COS 文件全部保留，清理需要单独归档和审批。

后续先完成上述可本地验证的契约/发布权限与迁移演练准备，再提交具体生产变更单。生产备份落盘、帐号/隧道创建、服务变更、部署和数据迁移均须明确批准。
