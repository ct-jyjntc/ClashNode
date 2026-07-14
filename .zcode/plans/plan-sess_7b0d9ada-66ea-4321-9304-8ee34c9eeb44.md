# ClashNode — macOS 代理客户端实现计划

基于 **mihomo v1.19.28**（`/Users/luna/Downloads/mihomo-darwin-arm64-v1.19.28`），参考 **FlClash** 功能与数据流，UI 采用 **Quiet Console**（monochrome、dense、shadcn new-york）。

## 技术选型

| 层 | 选择 |
|----|------|
| 壳 | Electron（主进程：内核/系统代理/托盘/文件） |
| UI | React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui（Quiet Console tokens） |
| 状态 | Zustand + TanStack Query |
| 内核控制 | mihomo **External Controller** REST + WebSocket（`127.0.0.1:9090` + 随机 secret） |
| 内核二进制 | 打包为 sidecar：`resources/bin/mihomo` |
| 数据目录 | `~/Library/Application Support/ClashNode/` |

**为何不用 FlClash 的自定义 IPC：** 直接使用官方 mihomo 二进制 + REST，无需维护 Go 桥接层，实现更快、可调试。

---

## 架构

```
┌──────────────── Renderer (Quiet Console) ────────────────┐
│  Dashboard │ Proxies │ Profiles │ Connections │ Logs │   │
│  Rules │ Settings │ Config Editor │ Backup                 │
└───────────────┬──────── IPC (preload) ───────────────────┘
                │
┌───────────────▼──────── Main Process ────────────────────┐
│  CoreSupervisor  → spawn/kill mihomo (-d home -f config) │
│  ConfigMerger    → 订阅 YAML + 应用补丁 → config.yaml     │
│  ProfileStore    → profiles/*.yaml + profiles.json       │
│  SystemProxy     → networksetup HTTP/HTTPS/SOCKS         │
│  TunAuth         → osascript 提权 / setuid（可选）        │
│  Tray / AutoLaunch / SingleInstance                      │
└───────────────┬──────────────────────────────────────────┘
                │ HTTP/WS loopback
┌───────────────▼──────── mihomo ──────────────────────────┐
│  mixed-port 7890 · external-controller 127.0.0.1:9090    │
└──────────────────────────────────────────────────────────┘
```

### 默认运行时参数（对齐 FlClash）

- `mixed-port`: **7890**
- `external-controller`: **127.0.0.1:9090**
- `secret`: 启动时生成并写入配置
- `mode`: rule · `allow-lan`: false · `log-level`: info
- 延迟测试 URL: `https://www.gstatic.com/generate_204`
- 系统代理默认 **开**；TUN 默认 **关**
- 测试配置: `mihomo -t -d home -f config.yaml`

### 数据目录布局

```
~/Library/Application Support/ClashNode/
  config.yaml          # 运行时合并结果
  profiles.json        # 订阅元数据
  profiles/{id}.yaml   # 原始订阅/本地配置
  settings.json        # 应用设置
  secret.txt           # API secret
  GEOIP.metadb / GEOSITE.dat / ASN.mmdb  # 可选 geo
  backups/
```

---

## 功能范围（接近 FlClash 桌面版）

### 1. 核心生命周期
- 启动/停止/重启 mihomo；就绪探测 `GET /version`
- 写合并配置后 `PUT /configs?force=true` 或重启进程
- 崩溃自动重启 + 托盘/UI 状态

### 2. 订阅 / Profiles
- 添加：URL / 本地文件
- 更新：HTTP 下载；解析 `subscription-userinfo`、`content-disposition`
- 自动更新（间隔可配，默认 24h）
- 切换当前 profile → 合并 → 重载
- 校验：`mihomo -t` 或加载失败 toast

### 3. 代理
- `GET /proxies` 展示 Selector/URLTest 等组
- `PUT /proxies/{group}` 切换节点
- 延迟：`GET /proxies/{name}/delay`（并发限流）
- Providers：`GET/PUT /providers/proxies/{name}`

### 4. Dashboard
- 启停大按钮、模式（rule/global/direct）
- 实时上下行（WS `/traffic`）
- 系统代理 / TUN 快捷开关
- 当前节点、连接数、内存等 metric cards

### 5. Connections / Logs / Rules
- WS `/connections` 列表 + 关闭单条/全部
- WS `/logs` 流式日志 + 级别过滤
- `GET /rules` 只读列表（后续可加 disable）

### 6. 系统代理（macOS）
- `networksetup` 为各网络服务设置 HTTP/HTTPS/SOCKS → `127.0.0.1:7890`
- bypass 列表（localhost、RFC1918 等）
- 退出/崩溃时恢复

### 7. TUN（macOS）
- 配置写入 `tun.enable` + `stack: mixed` + `dns-hijack: [any:53]` + `auto-route: true`
- 启用时提示提权：osascript 对 mihomo 执行 `chown root:admin` + `chmod +sx`（与 FlClash 类似）
- 失败时回退并 toast；不实现完整 Network Extension（复杂度过高）

### 8. 托盘
- 显示连接状态与简易速率
- 菜单：启停、模式、系统代理、TUN、打开窗口、退出

### 9. 设置 & 配置编辑
- 端口、allow-lan、mode、log-level、测试 URL、自动更新、开机启动
- YAML 配置编辑器（Monaco 或 CodeMirror）+ 校验后应用
- 备份/恢复 zip（profiles + settings）

### 10. UI（Quiet Console）
- 左侧栏 240px / 折叠 68px；Inter；pill 按钮；无边框卡片
- 路由：Dashboard / Proxies / Profiles / Connections / Rules / Logs / Settings
- 亮暗主题（next-themes class）
- Sonner toast

---

## 项目结构（将写入 `/Users/luna/Desktop/ClashNode`）

```
ClashNode/
  package.json
  electron.vite.config.ts   # 或 vite + electron-builder 双配置
  electron/
    main.ts
    preload.ts
    core/supervisor.ts
    core/config-merger.ts
    core/api.ts             # 主进程也可调 API；渲染进程经 IPC 代理
    system/proxy-mac.ts
    system/tray.ts
    store/profiles.ts
    store/settings.ts
  resources/bin/mihomo      # 复制自 Downloads
  src/
    main.tsx
    index.css               # Quiet Console tokens
    app/shell.tsx
    features/
      dashboard/
      proxies/
      profiles/
      connections/
      logs/
      rules/
      settings/
    shared/components/
    entities/mihomo/        # types + hooks
  README.md
```

---

## 实现步骤

1. **脚手架**：Electron + Vite + React + TS；Tailwind v4；shadcn 基础组件；Quiet Console tokens  
2. **拷贝内核**：`resources/bin/mihomo` + `chmod +x`；打包 `extraResources`  
3. **Main：CoreSupervisor + 最小 config.yaml + External API 客户端**  
4. **IPC 契约**：start/stop/status、profiles CRUD、settings、systemProxy、tun  
5. **Shell UI**：侧栏 + 主题 + 路由骨架  
6. **Profiles + ConfigMerger**：导入/更新/切换  
7. **Dashboard + Traffic WS**  
8. **Proxies + delay + providers**  
9. **Connections + Logs + Rules**  
10. **System proxy + Tray**  
11. **TUN 提权路径 + Settings + Config editor + Backup**  
12. **联调与 README（开发/打包说明）**

---

## 风险与边界

| 项 | 处理 |
|----|------|
| TUN 需 root | 明确用户授权；失败可降级仅系统代理 |
| 系统代理改全局网络 | 退出钩子必须恢复；单实例锁 |
| 订阅内容敏感 | 仅本地存储，不上传 |
| electron-builder 签名 | 第一版可 `npm run pack` 本地未签名运行 |
| 仅 macOS arm64 优先 | 二进制只带 darwin-arm64；架构可扩展 |

---

## 验收标准

- 导入订阅 → 启动内核 → 系统代理生效 → 浏览器可走代理  
- 切换节点 / 延迟测试 / 模式切换可用  
- Dashboard 实时流量；连接可关闭；日志可见  
- 托盘启停与退出恢复系统代理  
- TUN 在授权后可开关（环境允许时）  
- UI 符合 Quiet Console（单色、紧凑、pill 按钮）  

---

确认后按上述步骤在 `ClashNode` 空目录从零实现完整可运行客户端。