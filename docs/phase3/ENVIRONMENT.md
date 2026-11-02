# 2026-11-02实际环境与数据盘点

本次腾讯云只读SSH：源代码仍为0aa4ed8，工作区干净；Ubuntu22.04.5 x86_64，2vCPU/3.6GiB，无swap，可用约1.9GiB；根盘59GiB、已用20GiB、可用37GiB。原Nginx1.18、PG14.22、systemd平台与学术同步timer仍运行。4090/4092/5432仅loopback，公网仍只见22/80/443。默认PATH未找到Docker，不能据此假称已安装或已部署候选。

生产当前源库约33.7MB，68表/96外键/42迁移，逐表精确计数和校验和在 production-inventory.json。COS只执行list元数据：56对象/59,664,647字节，56个数据库object_key全部匹配；50 active、6非active，最大9,168,942字节；所有56条都有SHA-256。没有下载对象正文、没有复制真实业务行或私有文件。退休catalog仍有1189个图片引用（不等同1189个不同对象）；迁移工具保留历史关联，不删除文件。

公开API形状在服务器内存中读取、只输出字段名/来源域名聚合：34个成员详情，76次媒体引用均为现有固定COS域名；24条论文相关PDF链接。没有复制实际DTO内容。旧CMS唯一不兼容字段monitor已在新PublicSiteService输出边界清理，不改旧DB JSON；其他公开字段均通过新白名单。见 public-shape-audit.json。

云端sshd当前global允许转发、PermitListen any；新隧道不能直接复用ubuntu运维权限。4092进程明确位于user session scope、同一源码目录和Node版本，主systemd服务是4090。未停止任何生产进程。TLS现证书2026-11-13 07:59（北京时间；UTC为11月12日23:59）到期，续期是正式迁移前必须批准的操作。

Mac：24GiB/10核，OrbStack Docker29.8.2/Compose5.5.0，VM约11.7GiB、根卷可用约646GiB。已有Minecraft容器保持运行，观察到约3.6GiB内存占用；没有修改、重启或清理它。项目DB/API限制分别1.5GiB，任务0.5GiB；后续Agent模型另做容量预算。默认路由utun6，公网入站不作假设。

实际pmset sleep=0、autorestart=1；本次未修改设置。FileVault开启，用户未解锁前不能保证OrbStack恢复；项目LaunchAgent模板未安装到系统。Mac与云之间的实际SSH只用于只读审计，没有启动生产反向转发。完整受限SSH/双节点断链演练在两个本地Docker网络命名空间完成，不是WAN验收。
