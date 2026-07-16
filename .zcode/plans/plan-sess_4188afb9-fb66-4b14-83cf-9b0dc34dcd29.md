# ClashNode 功能与工程化补齐计划

对照 FlClash 差距，一次补齐下列 10 项。决策已定：

- **存储**：加固 JSON（原子写入 + 版本迁移 + 校验），**不迁 SQLite**
- **节奏**：一次做完
- **编辑器**：CodeMirror 6（`@uiw/react-codemirror` + JS/YAML 语言包）

---

## 目标清单

| # | 项 | 策略 |
|---|---|---|
| 1 | 零测试覆盖 | Vitest + 纯逻辑单测 |
| 2 | Profile 覆写不完整 | 扩展 Profile 字段 + merger + UI |
| 3 | 代码编辑器 | CodeMirror 6 共享组件 |
| 4 | 日志导出 / 内存·IP·网络检测 widget | 日志 IPC 导出 + 3 个新 dashboard widget |
| 5 | 开发者选项 / 关于页 | Settings 分区 + 可选独立 About |
| 6 | macOS 系统 DNS | `proxy-mac.ts` + 设置开关 |
| 7 | 代理排序 / 紧凑度 | Proxies 页 + 持久化偏好 |
| 8 | 配置合并高级字段 | hosts / geox-url / keep-alive / geodata-loader / global-ua |
| 9 | JSON 存储加固 | 原子写 + version + 校验/迁移 |
| 10 | 代码生成流程 | 轻量：zod 设定 + 类型化 IPC 注册表（不做 heavy codegen） |

---

## 架构原则

1. **增量字段全部 optional**，旧 `profiles.json` / `settings.json` 无感加载
2. **沿用现有分层**：types → store → merger/IPC → preload → UI + i18n
3. **不改订阅 YAML 落盘方式**：覆写只存在 metadata，runtime 再 merge
4. **渲染层不直连 mihomo / 不直写磁盘**：导出、DNS、IP 探测走主进程 IPC
5. **先抽纯函数再测**：`mergeConfig`、normalizers、subscription decode、原子写 helper

```
types.ts ──► store/* ──► config-merger / system/* ──► main IPC
                │                                      │
                └──────── preload ──► features/* UI ◄──┘
```

---

## Phase 0 — 基础设施（存储加固 + 测试骨架 + 轻量 codegen）

### 0.1 原子 JSON 写入
- 文件：[`electron/store/paths.ts`](electron/store/paths.ts)
- `writeJsonFile` 改为：写 `file.tmp` → `fs.renameSync`；失败清理 tmp
- 可选：corrupt 时备份为 `*.bak.<timestamp>`

### 0.2 版本与迁移
- [`electron/shared/types.ts`](electron/shared/types.ts)：`settingsVersion` / `profilesVersion`（当前 = 1）
- [`electron/store/settings.ts`](electron/store/settings.ts)、[`profiles.ts`](electron/store/profiles.ts)：load 时 `migrate*`，再 normalize
- 保持现有 deep-merge + normalize 行为，作为 v1 基线

### 0.3 校验（轻量 codegen 的一半）
- 新增依赖：`zod`
- 新增 [`electron/shared/schemas.ts`](electron/shared/schemas.ts)：AppSettings / Profile 子集 schema
- load 失败：备份坏文件 → fallback defaults + `core:log` 警告
- **类型仍以 `types.ts` 为准**；zod 只做运行时校验，避免双源漂移

### 0.4 类型化 IPC 注册表（轻量 codegen 另一半）
- 新增 [`electron/shared/ipc.ts`](electron/shared/ipc.ts)：
  ```ts
  export const IpcChannels = {
    "core:start": null,
    "profiles:set-custom-proxies": null,
    // ...
  } as const;
  export type IpcChannel = keyof typeof IpcChannels;
  ```
- `main.ts` / `preload.ts` 逐步改用常量（至少新通道必须用），减少字符串漂移
- **不做**完整代码生成器；手写 map 足够

### 0.5 Vitest
- devDeps：`vitest`、`@vitest/coverage-v8`（可选）
- `package.json`：`"test": "vitest run"`, `"test:watch": "vitest"`
- `vitest.config.ts`：Node 环境，include `electron/**/*.test.ts`、`src/**/*.test.ts`
- 首批测试（不依赖 Electron 运行时）：
  - `config-merger.test.ts`：ports/DNS/TUN/prepend/custom groups/新高级字段
  - `settings-normalize.test.ts`
  - `profiles-decode.test.ts`（base64 / share-link / assertLooksLikeClashConfig）
  - `atomic-write` helper（可用 tmpdir mock）

---

## Phase 1 — 配置模型 + 合并器（高级字段 + 覆写数据面）

### 1.1 AppSettings 高级字段
[`electron/shared/types.ts`](electron/shared/types.ts) + [`settings.ts`](electron/store/settings.ts) + merger + Settings UI：

| 字段 | 类型 | 默认 | 写入 config.yaml |
|------|------|------|------------------|
| `hosts` | `Record<string, string>` | `{}` | `hosts` |
| `geoxUrl` | `{ geoip, geosite, mmdb, asn }` | 与现有 GEO CDN 对齐 | `geox-url` |
| `keepAliveInterval` | `number` | `30` | `keep-alive-interval` |
| `geodataLoader` | `"memconservative" \| "standard"` | `"memconservative"` | `geodata-loader` |
| `globalUa` | `string` | 现有 FlClash 风格 UA | `global-ua` + 订阅下载 UA 可选覆盖 |
| `unifiedDelay` | `boolean` | `true` | 可用户改（现硬编码） |
| `tcpConcurrent` | `boolean` | `true` | 可用户改 |
| `findProcessMode` | `"strict" \| "off" \| "always"` | `"strict"` | 可用户改 |

[`config-merger.ts`](electron/core/config-merger.ts)：在 settings 注入段写入上述键；空 `hosts` / 空 geox 不覆盖 profile。

### 1.2 Profile 覆写扩展
`Profile` 新增 **全部 optional**：

```ts
customProxies?: Array<Record<string, unknown>>;      // 按 name 合并进 proxies
customProxyProviders?: Record<string, Record<string, unknown>>;
appendRules?: string[];                               // 插到 MATCH 前（非 MATCH 规则后）
// 扩展 CustomProxyGroup:
icon?: string;
use?: string[];           // proxy-provider 名
url?: string;             // UI 可编辑
interval?: number;
```

保留 `customRules`/`prependRules` 双写语义。

### 1.3 mergeConfig 顺序（稳定、可测）

1. parse YAML / MINIMAL_BASE  
2. strip external-ui  
3. **script** `main(config)`（保持最先用户逻辑）  
4. app settings（ports/controller/secret/TUN/DNS/**高级字段**）  
5. **customProxies** 按 `name` replace-or-append  
6. **customProxyProviders** 按 key merge  
7. **customProxyGroups**（含 icon/use/url/interval）  
8. rules：`prepend` → 原 rules → `append`（append 插在最终 `MATCH` 前）  
9. `sanitizeProxyGraph`（已识别 provider 名）

### 1.4 Store + IPC
[`profiles.ts`](electron/store/profiles.ts)：

- `setCustomProxies` / `setCustomProxyProviders` / `setAppendRules`
- 扩展 `setCustomProxyGroups` 透传新字段

[`main.ts`](electron/main.ts) + [`preload.ts`](electron/preload.ts)：

- `profiles:set-custom-proxies` / `set-custom-proxy-providers` / `set-append-rules`
- `profiles:merged-preview` / `supervisor.writeRuntimeConfig` 传入新 options
- 当前 profile 变更后 `reloadConfig`（与现有 groups/rules 一致）

---

## Phase 2 — UI：覆写 + CodeMirror + Proxies 体验

### 2.1 CodeMirror 共享编辑器
依赖：

- `@uiw/react-codemirror`
- `@codemirror/lang-javascript`
- `@codemirror/lang-yaml`
- `@codemirror/theme-one-dark`（暗色跟随 `next-themes`）

新增 [`src/shared/components/code-editor.tsx`](src/shared/components/code-editor.tsx)：

```tsx
type Props = {
  value: string;
  onChange: (v: string) => void;
  language: "javascript" | "yaml" | "json" | "text";
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
};
```

替换：

- [`src/features/scripts/page.tsx`](src/features/scripts/page.tsx) textarea  
- Settings 运行时 YAML  
- Profiles 的 raw YAML / custom proxies JSON·YAML 片段  
- Merged preview（readOnly）

### 2.2 Profiles 覆写 UI
[`src/features/profiles/page.tsx`](src/features/profiles/page.tsx) 扩展对话框（沿用现有 Dialog 模式）：

| 入口 | UI | 持久化 |
|------|-----|--------|
| 规则 | Tab：Prepend / Append；每行一条 | `setCustomRules` / `setAppendRules` |
| 自定义组 | 增加 icon URL、use（逗号分隔）、url/interval | `setCustomProxyGroups` |
| 自定义节点 | CodeEditor YAML/JSON 数组 | `setCustomProxies` |
| 自定义 providers | CodeEditor YAML map | `setCustomProxyProviders` |
| 卡片 badge | 规则/组/节点/provider/脚本计数 | — |

全局规则：**不做独立全局 rules 表**（避免半套 SQLite 模型）。在 Settings 增加 **「全局前置规则」** `settings.globalPrependRules: string[]`，merger 在所有 profile prepend **之前**注入（跨订阅统一规则，满足「全局规则」诉求且保持 JSON）。

### 2.3 Proxies 排序 / 紧凑度
[`src/features/proxies/page.tsx`](src/features/proxies/page.tsx) + `AppSettings.proxiesUi` 或 localStorage（推荐 **settings 持久化**）：

```ts
proxiesUi: {
  sort: "default" | "name" | "delay" | "type";
  sortAsc: boolean;
  density: "comfortable" | "compact";
}
```

- 成员 `useMemo` 按 sort 排；delay 用 history + 本地测速 map  
- density：`comfortable` → 现有 `h-9`；`compact` → `h-7` / 更小 padding  
- 扩展 [`list-panel.tsx`](src/shared/components/list-panel.tsx) 导出 density class 工厂，避免写死

---

## Phase 3 — Dashboard / Logs / About / Developer / macOS DNS

### 3.1 Dashboard widgets
扩展 `DashboardWidgetId`：`"memory" | "publicIp" | "networkCheck"`

| Widget | 数据源 |
|--------|--------|
| memory | 轮询 `getConnections().memory`（已有类型字段） |
| publicIp | 主进程 IPC `system:public-ip`（fetch 多个 fallback：`api.ipify.org` / `ifconfig.me/ip`，超时短） |
| networkCheck | 主进程 `system:network-check`：对 `settings.testUrl` 测延迟（直连或走 mixed-port，结果 `{ ok, ms, status? }`） |

- 渲染：[`dashboard/page.tsx`](src/features/dashboard/page.tsx) + Settings widget 开关（**i18n 标签**，不再只显示 raw id）  
- [`MetricCard`](src/shared/components/metric-card.tsx) 复用

### 3.2 日志导出
- IPC `logs:export` 或通用 `app:save-text`：`dialog.showSaveDialog` + `fs.writeFile`  
- Logs 页 Header：导出当前过滤结果 / 全部；格式 `time type payload` 文本  
- 可选：展示 `LogLine.time`

### 3.3 关于页
- 方案：**Settings 内独立 Card 上移为清晰「关于」区** + 可选路由 `/about` 挂 shell 底部（避免 nav 过长可只做 Settings 强化）  
- 内容：app 版本、Electron/Node、平台、mihomo 版本、检查更新、开源致谢/仓库链接（`shell.openExternal`）、许可证摘要  
- 从现有 Backup 卡片中的 About 块拆出

### 3.4 开发者选项
Settings 底部 **Developer** 折叠区（`settings.developerMode` 或始终可见 Advanced 子区）：

- 打开 DevTools：`app:open-devtools` → `mainWindow.webContents.openDevTools()`  
- 显示 API secret / controller（已有则聚合）  
- 复制运行时 config 路径  
- 注入测试日志（debug）  
- 打开 userData 目录（已有 open-path）  
- Runtime YAML 编辑器改用 CodeMirror  

### 3.5 macOS 系统 DNS
[`electron/system/proxy-mac.ts`](electron/system/proxy-mac.ts)：

- `getSystemDns(service)` / `setSystemDns(servers: string[])` / `clearSystemDns`  
- 用 `networksetup -getdnsservers` / `-setdnsservers <service> 空` 或 IP 列表  
- 与 system proxy 相同：list services → 批量 sh  

设置：

```ts
systemDns: {
  enabled: boolean;
  servers: string[];  // 默认 ["223.5.5.5", "119.29.29.29"] 或用户可改
}
```

- 仅 `darwin` 显示 UI  
- enable TUN 或独立开关时应用；关闭时 restore（缓存上次 DNS 到内存/文件 `system-dns-backup.json`）  
- 通过 `proxy.ts` 分派；Windows/Linux no-op + 日志

---

## Phase 4 — i18n、收尾与验证

### 4.1 i18n
[`src/shared/i18n/locales.ts`](src/shared/i18n/locales.ts) **zh + en 同步** 增加：

- 覆写（proxies/providers/append/icon）  
- 编辑器、日志导出  
- widgets 名称  
- about / developer  
- system DNS  
- proxies sort/density  
- advanced config 字段标签  

### 4.2 验证清单
- `npm test`  
- `npm run build`（双 tsconfig + vite）  
- 手动：添加自定义节点/provider → merged preview → 启动 core  
- 手动：脚本/YAML CodeMirror 保存  
- 手动：日志导出文件  
- 手动：dashboard 三 widget  
- 手动：proxies 按延迟排序 + compact  
- macOS：开关 system DNS 后 `networksetup -getdnsservers` 核对  
- 旧 settings/profiles 无 version 字段仍可加载  

---

## 关键文件一览

| 区域 | 路径 |
|------|------|
| 类型/默认 | `electron/shared/types.ts`, `schemas.ts`, `ipc.ts` |
| 存储 | `electron/store/paths.ts`, `settings.ts`, `profiles.ts` |
| 合并 | `electron/core/config-merger.ts`, `supervisor.ts` |
| 系统 | `electron/system/proxy-mac.ts`, `proxy.ts` |
| IPC | `electron/main.ts`, `preload.ts` |
| UI | `src/features/{profiles,scripts,proxies,logs,dashboard,settings}/page.tsx` |
| 共享 | `src/shared/components/code-editor.tsx`, `list-panel.tsx` |
| i18n | `src/shared/i18n/locales.ts` |
| 测试 | `vitest.config.ts`, `electron/**/*.test.ts` |
| 依赖 | `package.json` |

---

## 实现顺序（建议提交粒度）

1. **chore**: vitest + zod + atomic write + version migrate + ipc constants  
2. **feat(config)**: 高级字段 types/settings/merger + tests  
3. **feat(overwrite)**: Profile 字段 + store/IPC + merger + tests  
4. **feat(ui)**: CodeEditor + scripts/settings/preview 接入  
5. **feat(ui)**: Profiles 覆写对话框 + 全局前置规则  
6. **feat(ui)**: Proxies sort/density  
7. **feat(ui)**: Dashboard widgets + log export + about/developer  
8. **feat(system)**: macOS system DNS  
9. **chore(i18n)**: 全量文案 + `npm test` + `npm run build`  

---

## 明确不做（本轮）

- SQLite / Drift 式表结构  
- Android / Linux 平台  
- Monaco  
- FlClash 级 freezed/riverpod 代码生成  
- Provider 旁路 `sideLoadExternalProvider`（runtime API，非覆写必需）  
- Dashboard 拖拽网格布局（仅 id 开关 + 新 widget）  

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| customProxies YAML 写坏导致 core 起不来 | merge 后仍走 `mihomo -t`；sanitize；UI 保存前 JSON/YAML parse 校验 |
| macOS DNS 改挂后无法上网 | 备份原 DNS；disable 必 restore；失败 toast |
| CodeMirror 打包体积 | 只引入 js/yaml 语言包；按需 dynamic import 可选 |
| 设置页过长 | Developer/About/高级字段用折叠 Card，不新增大导航项 |
| 双写 prepend/customRules | 不改现有契约，仅新增 appendRules |

---

## 完成定义

- 10 项差距均有对应实现或本计划声明的等价方案（全局规则 = `globalPrependRules`）  
- 关键纯逻辑有 Vitest 覆盖  
- JSON 原子写 + version 迁移可用  
- CodeMirror 用于脚本与 YAML  
- `npm test` 与 `npm run build` 通过