# Bilibili Evolved · Userscripts

基于 [the1812/Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 的个人 fork，尝试让脚本在 **macOS Safari + [Userscripts](https://github.com/quoid/userscripts)** 中运行。适配源码位于 `main` 分支，基于上游 `master` 持续适配，目前属于实验性、部分兼容。

## 适配内容与当前状态

- 修复启动时 lodash 全局属性不可重新配置的问题。
- 将 Userscripts 的异步存储适配到现有配置接口；缺少油猴菜单 API 时保留页面内设置入口。
- 统一修复组件沙箱中 Window 方法（如 `btoa` / `atob`、`getComputedStyle`、定时器）的调用接收者，并补齐既有 GM 网络 API 别名。
- 通过受限页面通道提供实时 `aid/cid/bvid`、基础播放器方法与播放/暂停事件；GM 权限保留在隔离环境。
- 修复 Userscripts 视频页的 `utils.playerReady 失败`：通过 BPX 控件和媒体 DOM 判断挂载，不依赖不可访问的页面登录回调。
- 已在 B 站桌面首页验证：设置面板打开、配置刷新后保留、在线组件安装，以及“隐藏顶部横幅”样式生效。

**兼容范围：** 已在 Safari 桌面视频页验证视频识别、`hasVideo`、时间读取/跳转、播放/暂停事件、合集切换通知和跨域请求。页面通道只支持白名单 API，不提供任意页面对象或 `fetch/history` hook；完整下载流程、番剧、直播和 iOS Safari 尚未验证。页面 CSP 阻止通道时保留 DOM 功能。详见 [兼容说明](USERSCRIPTS.md)。

## API 兼容性追踪

此表跟踪本 fork 在 Safari + Userscripts 中使用的 GM、Window 和播放器 API。状态依据是 [2026-09-15 的实机记录](USERSCRIPTS.md#本次验证2026-09-15) 与当前源码；“已适配”不等于所有页面、组件或浏览器都已实测。上游迁移或 Userscripts 更新后，应复核实现并在实机验证后更新状态和日期。

| API / 能力 | 状态 | 已确认范围与待验证项 | 依据 |
| --- | --- | --- | --- |
| `GM_getValue` / `GM_setValue` | 设置场景已实测（2026-09-15） | 异步存储预载为同步配置接口；设置修改后刷新仍保留 | [适配与验证](USERSCRIPTS.md#本次验证2026-09-15) · [实现](src/client/userscripts-runtime.ts) |
| `GM_deleteValue` | 自动化验证；未单独实测 | 删除与写入顺序有回归测试覆盖 | [测试](dev-tools/userscripts/compatibility.test.mjs) · [实现](src/client/userscripts-runtime.ts) |
| `GM_xmlhttpRequest` | 跨域请求已实测（2026-09-15） | 公开 JSON 的跨域读取成功；组件沙箱别名有自动化测试 | [验证记录](USERSCRIPTS.md#核心-api-统一适配) · [测试](dev-tools/userscripts/compatibility.test.mjs) |
| `GM_info` | 已适配；未单独实测 | 隔离环境提供别名，尚无单项浏览器验证记录 | [实现](src/client/userscripts-runtime.ts) |
| `GM_registerMenuCommand` / `GM_unregisterMenuCommand` | 管理器未提供 | 使用网页侧边设置入口；没有模拟扩展菜单 API | [兼容边界](USERSCRIPTS.md#兼容边界) |
| `btoa` / `atob` / `getComputedStyle` 等 Window 方法 | 自动化验证；浏览器间接验证 | 修正调用接收者；Safari 中组件样式生效，但未逐项记录方法调用 | [适配记录](USERSCRIPTS.md#已处理) · [测试](dev-tools/userscripts/compatibility.test.mjs) |
| `aid` / `cid` / `bvid` / `hasVideo` / `videoChange` | 已实测（2026-09-15） | 桌面视频页识别与合集切换通知 | [验证记录](USERSCRIPTS.md#核心-api-统一适配) · [实现](src/client/userscripts-page.ts) |
| `player` 的时间读取、`seek` | 已实测（2026-09-15） | 桌面视频页读取时间、原位跳转 | [验证记录](USERSCRIPTS.md#master-基线迁移验证2026-09-15) · [白名单实现](src/client/userscripts-page.ts) |
| `playerRaw` | 已适配；未单独实测 | 映射到与 `player` 相同的受限页面通道 | [实现](src/client/userscripts-page.ts) |
| `getHandoff` / `setHandoff` / `nano.HandoffKind` | 页面 API 已实测（2026-09-27）；隔离桥接待实测 | Safari 视频页确认枚举为数字，页面 API 切换连播状态后已恢复；桥接白名单由自动化测试覆盖，尚未在 Safari 跨隔离环境执行连播组件 | [验证记录](USERSCRIPTS.md#上游-master-跟进候选2026-09-27) · [实现](src/client/userscripts-page.ts) · [测试](dev-tools/userscripts/page-bridge.test.mjs) |
| 播放 / 暂停事件，`on` / `once` / `off` | 部分实测（2026-09-15） | 播放 / 暂停事件已实测；`once` / `off` 与播放器切换由自动化测试覆盖 | [验证记录](USERSCRIPTS.md#核心-api-统一适配) · [测试](dev-tools/userscripts/page-bridge.test.mjs) |
| 音量读取；时长、静音、音量设置、关灯、倍速等播放器方法 | 部分实测（2026-09-15） | 音量读取已实测；其余方法在白名单内，仅当页面播放器提供该方法时可调用，尚未逐项实机验收 | [验证记录](USERSCRIPTS.md#master-基线迁移验证2026-09-15) · [白名单实现](src/client/userscripts-page.ts) |
| 任意页面对象、`fetch/history` hook、完整播放器内部 API | 不支持 | `unsafeWindow` 仅指向隔离环境的 Window；页面通道只开放固定白名单 | [兼容边界](USERSCRIPTS.md#兼容边界) · [白名单测试](dev-tools/userscripts/page-bridge.test.mjs) |

完整下载流程、番剧、直播、iOS Safari 和第三方组件仍需分别验证，见 [兼容说明](USERSCRIPTS.md)。

## 安装

### GitHub Releases 预览版

发布后固定使用以下地址：

- [安装脚本](https://github.com/zed76r/Bilibili-Evolved-Userscripts/releases/latest/download/bilibili-evolved.user.js)：`bilibili-evolved.user.js`
- [更新 metadata](https://github.com/zed76r/Bilibili-Evolved-Userscripts/releases/latest/download/bilibili-evolved.meta.js)：`bilibili-evolved.meta.js`
- [自定义顶栏 - Safari 密码填充修正（插件）](https://github.com/zed76r/Bilibili-Evolved-Userscripts/releases/latest/download/custom-navbar-safari-autofill.js)：`custom-navbar-safari-autofill.js`

使用上游「自定义顶栏」组件时，在 Bilibili Evolved 设置面板的「插件」页粘贴上述插件链接并添加，刷新页面生效。它不在上游「在线」列表；其他在线组件和插件仍从上游获取。

`main` 的发布工作流成功后，上述固定链接指向最新制品；历史版本可在 [Releases](https://github.com/zed76r/Bilibili-Evolved-Userscripts/releases) 中下载。

Userscripts 可以通过 metadata 检查更新，但不承诺管理器后台自动更新；Safari/Userscripts 的兼容范围和已验证、未验证项目见 [USERSCRIPTS.md](./USERSCRIPTS.md)。

链接启用后，首次安装或从旧版本迁移时：

1. 新安装直接使用上面的 `.user.js` 地址，并停用同页的上游版本。
2. 如果本机已有 `Bilibili Evolved.user.js`，先备份原文件；再用发布脚本内容替换原文件，保留文件名 `Bilibili Evolved.user.js`。
3. 在 Userscripts 弹窗中重新读取替换后的文件，然后刷新 B 站页面。
4. 旧版本没有更新地址时，需要手动完成这一次迁移；迁移后 Userscripts 才能使用 `bilibili-evolved.meta.js` 检查更新。
5. 从页面侧边设置入口添加需要的组件。

脚本已移除指向上游的本体自动更新地址，避免被未适配版本覆盖。详细限制和验证记录见 [USERSCRIPTS.md](./USERSCRIPTS.md)。

## 上游文档跟踪

[上游 README 原文](README.upstream.md) 单独保存在仓库根目录，已核对到 `the1812/Bilibili-Evolved` 的 `master` 提交 `fa06dcec0`（README 内容未变化）。文件保持原文，原有相对图片和文档链接仍从根目录解析；其安装链接与兼容性声明适用于上游版本。以后更新时，先查看差异，再同步文件：

```sh
git fetch upstream master
git show upstream/master:README.md | diff -u README.upstream.md -
git show upstream/master:README.md > README.upstream.md
```

同步后更新上面的提交号，并单独复核本 fork 的 API 表格与兼容说明。
