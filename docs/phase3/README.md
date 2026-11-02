# Phase 3：正式迁移前准备

入口：[正式Runbook](RUNBOOK.md) · [待审批变更单](APPROVALS.md) · [验证报告](VALIDATION.md) · [实际盘点](ENVIRONMENT.md) · [就绪门槛](READINESS.json)

当前分支 `codex/production-readiness-phase3`，继承 Phase2 `62d53af`。本地工程/隔离演练完成不等于生产迁移批准。`node scripts/phase3/readiness.mjs` 当前按设计返回No-Go及阻塞门槛，不会调用部署命令。

本阶段新增：外部论文链接分类；严格公开字段、源字节哈希、签名/独立发布权限/审核审计、只传白名单文件；v1核心Zod输入Schema/OpenAPI/生成客户端类型；可信网关token、CSRF/会话/上传限制、写冻结；生产Mac/云Compose、三种DB角色、SSH限制/启动/探针；COS断点/去重/重试/安全映射回退；联合备份、空库恢复、全表指纹、加密异地传输和受控切换手册。

发现并修复的迁移缺陷包括：arXiv PDF被误下载；设备更新SQL未使用$22参数导致真实PG500；旧profile默认public_fields含039已禁止的academic；历史CMS monitor字段残留；个人资料可绑定非本人私有图片；文件内容类型伪装；依赖已知漏洞。已有42个生产迁移和Phase2的43号内容保持不变，44/45为新增目标库迁移，生产未应用。

异地备份候选方案是腾讯云独立密文目录，之后扩展第二供应商。用户尚未选定或授权远端写入；本次仅本地age加解密和隔离恢复验证。FileVault首次人工解锁、生产TLS续期及真实数据/链路验收属于明确上线门槛。
