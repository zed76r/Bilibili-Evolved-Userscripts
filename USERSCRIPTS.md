# Safari Userscripts 适配（实验性）

本 fork 针对 **Safari + Userscripts** 的隔离内容环境，基于上游
`preview-fixes`，不代表上游承诺支持 Safari，也不提供完整 Tampermonkey 兼容层。

## 已处理

- lodash 的 `window._` 不可重新配置时，跳过可选的弃用提示 getter。
- 启动前预载 Userscripts 的异步 `GM.*` 存储，为核心提供同步内存读取与有序异步写入。
  写入前复制值，避免响应式对象在异步保存前被修改。读取失败时中止启动，避免用空配置覆盖已有数据。
- 组件沙箱的 `btoa` / `atob` 绑定真实 Window 接收者，避免 Safari 严格类型检查拒绝加载组件样式。
- 不提供菜单 API 的管理器跳过菜单注册，仍可通过网页侧边入口打开设置。
- 脚本名称加入 Userscripts 标识，并移除上游本体自动更新地址，避免适配版被覆盖。

## 兼容边界

`unsafeWindow` 在此适配中仅指向 **Userscripts 的 content-world window**。
它能够访问共享 DOM 和浏览器 DOM API，不能读取 B 站页面 JavaScript 中的
`player`、`aid`、`cid`、`UserStatus`、`__INITIAL_STATE__` 等对象，也不能替换页面世界的
`fetch` 或播放器函数。依赖这些对象的组件不在支持范围内，请勿据此判断播放器增强、下载等功能可用。

本 fork 不把特权 GM API 桥接给网页，不添加扩展菜单假实现，不关闭 Safari 安全保护。
配置写入是异步的；写入失败会在控制台报告。多个标签页没有实时配置同步，修改后应刷新其他标签页。

## 本地构建与验证

```sh
pnpm install --frozen-lockfile
pnpm run type
pnpm run lint-check
node --import tsx --test dev-tools/userscripts/*.test.mjs
pnpm tsx dev-tools/dev-server/index.ts
```

开发服务生成 `dist/bilibili-evolved.dev.user.js`。在 Userscripts 中安装此完整文件，
并停用同一页面上的上游版本，避免两个实例互相干扰。修改文件后打开一次 Userscripts 弹窗，再刷新 B 站。
开发构建不会随源文件更改自动更新到已安装脚本，需重新安装构建产物。

完成后关闭开发服务：

```sh
pnpm tsx dev-tools/dev-server/command.ts shutdown
```

普通修复分支仅保留源码，构建产物不提交。当前没有 fork 自动更新发布源。

## 本次验证（2026-09-15）

环境：本机 Safari、Userscripts 4.8.6，B 站桌面首页。

- `pnpm run type`、`pnpm run lint-check` 和开发构建通过。
- 6 个回归测试通过，覆盖不可配置 lodash、原有 getter、存储快照/顺序/重载、读写失败与组件沙箱 Window 接收者。
- Safari 中设置入口显示，面板能够打开。
- 将面板从左侧改为右侧，刷新后仍为右侧；验证后恢复左侧。
- 在线仓库加载成功，官方“隐藏顶部横幅”组件安装并持久化；刷新后横幅实际隐藏。
- 首轮未测试视频/番剧/直播页面及播放器内部对象相关功能；后续视频页验证见下节，仍不承诺播放器内部 API 兼容。

验证组件已停用并刷新回读，顶部横幅恢复；开发服务已关闭。

### 视频页准备状态修复

Userscripts 中 `playerReady()` 使用 BPX 容器内的控件与媒体 DOM 判断挂载完成，
不再等待 content world 无法访问的 `UserStatus` / `onLoginInfoLoaded`。
这只解决 DOM 增强的启动等待，不提供页面播放器 API 或登录状态。
其他脚本管理器保持原有回调路径，嵌入播放器仍不初始化这些增强。

本机 Safari 桌面视频页已验证：视频正常播放，超过原轮询超时后没有再出现
`utils.playerReady 失败`。新增测试覆盖 DOM 就绪、未就绪、bwp-video 选择器、
Tampermonkey 回调与嵌入播放器分支；与原测试合计 11 项通过。
