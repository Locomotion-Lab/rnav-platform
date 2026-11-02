# 待审批生产变更单（本次全部未执行）

批准应指明编号/窗口，不把对方案的讨论视为执行授权。可逐项批准；任一正式流量/数据库步骤都不由此前只读权限推导授权。

| ID | 执行节点与具体内容 | 影响/前置 | 验证与回退 |
| --- | --- | --- | --- |
| P0 | 腾讯云 TLS 证书续期/替换（原证书2026-11-13 07:59（北京时间；UTC为11月12日23:59）到期） | 使用原域名、原签发渠道，证书内容由域名管理人提供/授权；不读取/输出私钥 | openssl dates + HTTPS实测；保留原证书/配置备份，reload前 nginx -t；新证书问题恢复原配置 |
| P1 | 云端安装 Docker Engine/Compose 插件和 age（目前默认PATH没有Docker） | apt来源/具体包版本先验证；需root；不升级整机或卸载原服务 | docker version/compose version、监听检查；无候选运行时可撤销新service，保留原平台 |
| P2 | 创建 rnav-tunnel 仅公钥账号，安装 deploy/ssh/sshd-rnav-tunnel.conf | 允许remote forwarding仅127.0.0.1:14090、禁shell/exec；锁密码，无sudo组；专用新密钥 | sshd -t后reload（保留当前SSH会话）；新账号/端口拒绝测试；回退新增Match文件和账号，原运维账号不改 |
| P3 | 创建 /srv/rnav_phase3、/srv/rnav_public、/srv/rnav-incoming；发布传输账号 | 仅已批准公开包可进入incoming，Ubuntu UID1000负责验证激活；目录不加nginx alias；网关秘密和验证公钥最小传入云端 | signed approve/activate、错误hash拒收、Web UID读权限；回退 current 到已批准旧版；不删历史版本 |
| P4 | 生产DB/COS/秘密的备份、导出和经加密向Mac传输 | 必须明确允许复制真实业务数据/私有文件/凭证；COS使用只读短期凭证；全量dump保留 | pg_restore --list、SHA256、双集群manifest、COS字节哈希；失败停在隔离克隆，不切写源 |
| P5 | 云端并行候选 Web 容器13000及回环Nginx13080；启动Mac出站隧道 | 不改正式443路由；云端有约1.9GiB可用内存、37GiB空间；需要image amd64 | 指定Host HTTPS公网Origin、Cookie/CSRF、公开离线/冷启动测试；停止仅新容器/新增listener和隧道 |
| P6 | 冻结旧业务写入、停旧后台任务/旧一体化进程、最终导出、Nginx正式切换 | 提前通知停用 Monitor/Procurement；已批准变更窗口；旧库设default_transaction_read_only并终止旧连接；不删除表 | 保留数据基线、精确新写源、验收清单；新写出现后必须先保存Mac新数据，不能直接回旧库写入 |
| P7 | 配置每日项目备份、受限异地备份账号/目录 | 候选先使用腾讯云独立目录保存age密文，再加另一供应商；讨论不等于已选定/授权。私钥留离线恢复介质/密码管理器，云端仅收密文 | 本地加密解密已测；还需真实远端传输checksum和取回恢复；失败报警，不删除仅存副本 |

4092遗留进程只读识别为 `/srv/rnav_platform` Node、用户session scope（不是当前systemd主服务）；正式冻结必须再次根据 ss PID/cwd/exe 核实并审批停止，不能凭旧PID直接kill。当前PM2 daemon还在，不清理无关旧数据库或PM2应用。

Mac FileVault开启；保持现有安全设置，不关闭FileVault、不启用自动登录。启动Agent只在用户解锁登录、OrbStack可用后工作。无人值守冷启动的恢复时间由人工解锁流程决定；安装项目LaunchAgent、首次重启演练在P5窗口明确确认后执行。
