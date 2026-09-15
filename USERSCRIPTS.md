# Safari Userscripts 适配（实验性）

本 fork 针对 **Safari + Userscripts** 的隔离内容环境，基于
上游 `master`（本次基线 `9535fa6`），不代表上游承诺支持 Safari，也不提供完整 Tampermonkey 兼容层。

## 已处理

- lodash 的 `window._` 不可重新配置时，跳过可选的弃用提示 getter。
- 启动前预载 Userscripts 的异步 `GM.*` 存储，为核心提供同步内存读取与有序异步写入。
  写入前复制值，避免响应式对象在异步保存前被修改。读取失败时中止启动，避免用空配置覆盖已有数据。
- 组件沙箱的 `btoa` / `atob` 绑定真实 Window 接收者，避免 Safari 严格类型检查拒绝加载组件样式。
- 不提供菜单 API 的管理器跳过菜单注册，仍可通过网页侧边入口打开设置。
- 脚本名称加入 Userscripts 标识，并移除上游本体自动更新地址，避免适配版被覆盖。

## 兼容边界

`unsafeWindow` 在此适配中仅指向 **Userscripts 的 content-world window**。
它能够访问共享 DOM 和浏览器 DOM API，并通过下述白名单通道读取公共视频 ID、调用有限的播放器方法。
它不等于页面真实 window，不能读取任意页面对象（如 `UserStatus`、`__INITIAL_STATE__`），
也不能替换页面世界的 `fetch` 或播放器函数。完整组件兼容性需单独验证。

本 fork 不把特权 GM API 桥接给网页，不添加扩展菜单假实现，不关闭 Safari 安全保护。
配置写入是异步的；写入失败会在控制台报告。多个标签页没有实时配置同步，修改后应刷新其他标签页。

## GitHub Releases 发布

发布工作流位于 `.github/workflows/userscripts-release.yml`，在推送到 `main` 时自动触发，也可以在
**Actions → Publish Userscripts → Run workflow** 中选择 `main` 手动触发。发布前需要依次通过类型检查、lint、
Userscripts 测试、production Userscripts 构建和 release gate；任一步骤失败都不会部署。

验证构建通过后，工作流以通过验证的源码 SHA 创建唯一的 `userscripts-<UTC version>` tag，先创建 draft
Release 并上传以下两个资产，再发布为非 prerelease 并标记为 latest：

- `bilibili-evolved.user.js`
- `bilibili-evolved.meta.js`

历史 Release 保留，用于需要时手动回退到旧版本。

门禁命令为：

```sh
pnpm run type
pnpm run lint-check
node --import tsx --test dev-tools/userscripts/*.test.mjs
pnpm run build-userscripts
node dev-tools/userscripts/check-release.mjs
```

`pnpm run build-userscripts` 执行 production Userscripts 构建，生成制品到 `dev-tools/userscripts/dist/`：

- `bilibili-evolved.user.js`：完整安装脚本
- `bilibili-evolved.meta.js`：更新 metadata

发布后固定使用以下地址：

- `https://github.com/zed76r/Bilibili-Evolved-Userscripts/releases/latest/download/bilibili-evolved.user.js`
- `https://github.com/zed76r/Bilibili-Evolved-Userscripts/releases/latest/download/bilibili-evolved.meta.js`

metadata 的 `name` 为 `Bilibili Evolved (Userscripts Preview)`，与当前安装保持一致。发布脚本的 `@version`
采用 UTC 构建时间，格式为 `YYYYMMDD.HHMMSS`；内部核心兼容版本仍以上游版本为准。Userscripts 支持通过 metadata
检查更新，但不能承诺管理器后台自动更新。

上述固定链接随成功发布更新；以 GitHub Actions 运行结果和 Release 附件为准。发布成功不等于所有 Safari 功能已经实测。

链接启用后，首次安装或迁移时按以下步骤操作：

1. 新安装直接使用 `.user.js` 地址，并停用同页的上游版本。
2. 如果本机已有 `Bilibili Evolved.user.js`，先备份原文件，再用发布脚本内容替换它，保留文件名 `Bilibili Evolved.user.js`。
3. 在 Userscripts 弹窗中重新读取替换后的文件，然后刷新 B 站页面。
4. 旧版本没有更新地址时，需要手动完成这一次迁移；迁移后 Userscripts 才能使用 `.meta.js` 地址检查更新。

## 本地构建与验证

```sh
pnpm install --frozen-lockfile
pnpm run type
pnpm run lint-check
node --import tsx --test dev-tools/userscripts/*.test.mjs
pnpm run build-userscripts
node dev-tools/userscripts/check-release.mjs
```

`pnpm run build-userscripts` 的输出位于 `dev-tools/userscripts/dist/`。在 Userscripts 中安装其中的
`bilibili-evolved.user.js` 完整文件，并停用同一页面上的上游版本，避免两个实例互相干扰。

如需交互式开发调试，再启动开发服务：

```sh
pnpm tsx dev-tools/dev-server/index.ts
```

开发服务生成 `dist/bilibili-evolved.dev.user.js`。修改文件后打开一次 Userscripts 弹窗，再刷新 B 站。
开发构建不会随源文件更改自动更新到已安装脚本，需重新安装构建产物。

完成后关闭开发服务：

```sh
pnpm tsx dev-tools/dev-server/command.ts shutdown
```

适配修改仅提交源码。`master` 基线继承的 `dist/` 和 `registry/dist/` 是上游发布产物，
不包含本 fork 适配；请按上述步骤生成并安装本地构建。GitHub Releases 发布源由 `main` 工作流维护。

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
这一步只解决 DOM 增强的启动等待；后续白名单播放器 API 适配见下节，仍不提供登录状态。
其他脚本管理器保持原有回调路径，嵌入播放器仍不初始化这些增强。

本机 Safari 桌面视频页已验证：视频正常播放，超过原轮询超时后没有再出现
`utils.playerReady 失败`。新增测试覆盖 DOM 就绪、未就绪、bwp-video 选择器、
Tampermonkey 回调与嵌入播放器分支；与原测试合计 11 项通过。


### 核心 API 统一适配

适配分为两层：`userscripts-runtime.ts` 保留隔离环境中的设置缓存及既有 GM 网络接口；
`userscripts-page.ts` 在页面环境安装固定的播放器端点，隔离脚本通过脱离文档的 DOM 节点同步通信。
通道不提供 GM 权限、任意代码执行或任意全局属性读取，也不绕过页面 CSP。

| API | 当前范围 |
| --- | --- |
| `GM_getValue/setValue/deleteValue` | 启动前预载、同步缓存、有序异步写入 |
| `GM_info` / `GM_xmlhttpRequest` | 将已经授权给核心和组件的接口补齐为隔离环境全局别名 |
| `aid/cid/bvid` | 实时读取公共 ID，统一字符串；过滤临时数组值 |
| `hasVideo` / `videoChange` | 复用现有核心逻辑，支持首次识别与切集通知 |
| `player` / `playerRaw` | 白名单：时间、音量、静音读取、跳转、播放/暂停、关灯、倍速；仅代理页面实际存在的方法 |
| `on/once/off` | 播放/暂停事件；支持移除和播放器实例更换后的迁移 |
| Window 方法 | 沙箱统一绑定原始 Window 接收者，保留构造函数语义 |
| GM 菜单 | 管理器不提供时仍使用页面内设置入口 |

本机 Safari + Userscripts 验证：公共 ID、`hasVideo`、时间读取、原位 seek、跨域读取公开 JSON、
播放/暂停事件，以及合集自动切换后的 `videoChange` 与 ID 更新均成功。
单元/隔离环境集成测试覆盖通道白名单、同步返回、事件解绑/迁移、CSP 拒绝和未初始化状态。

这不是完整的 `unsafeWindow` 实现：`__INITIAL_STATE__`、评论/React 私有对象、页面
`fetch/history` hook、登录回调与原始播放器日志不通过此通道暴露。关灯/音量/倍速方法虽已提供，
尚未逐项进行 Safari 操作验收；完整下载流程、番剧、直播、iOS 及第三方组件兼容仍需单独验证。


### master 基线迁移验证（2026-09-15）

3 个适配提交已重放到上游 `master` 的 `9535fa6`，不继续携带 `preview-fixes` 的开发分支差异。
类型检查、lint 与 18 项回归测试通过；Safari 在三小时纯音乐视频页实测通过
视频 ID、`hasVideo`、时间/音量读取、原位跳转、播放/暂停事件、跨域公开 JSON 请求和设置面板打开。
测试探针已移除，本机安装开发构建；该次迁移验证未发布自动更新产物。
