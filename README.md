# Grandpas Land 网站

四个静态页面，可直接部署到现有 GitHub Pages。`CNAME` 保留现有域名 `grandpasland.xyz`。

- `index.html`：官网首页与四张世界概念插画。
- `workshop.html`：玩家自带 Key 的 AI 生成、JSON 校验、编辑与下载。
- `gallery.html`：GitHub Issues 分享列表、标签/时间筛选、作品预览与下载、评论阅读。
- `docs.html`：接口、资产导入、JSON 格式与分享说明。
- `styles.css`：四页共用的玻璃样式、响应式布局与减少动态效果支持。
- `assets.js`：与游戏 Items/Entries 格式对应的公共校验逻辑。
- `images/`：玩家提供的四张概念插画，WebP 优化版；不标作实机截图。

## 本地预览

安装了 Node.js 时，在本目录运行 `node preview.cjs`，打开 `http://127.0.0.1:8765/`。
使用 GitHub Pages 时保持文件和 images 文件夹的相对目录，直接部署，无需构建。

## 校验测试

`node --test tests/assets.test.cjs`

另外已通过浏览器的模拟 AI 请求测试，覆盖编辑后下载、Key 保存与清除、节日日期、旧分享兼容、标签和时间筛选、下载、评论文本安全显示、发布草稿，以及 390/768/1440 像素下四页的横向溢出检查。没有使用真实 AI Key 或发起付费请求，也没有发布测试帖子。

## 社区与部署说明

分享和评论继续由 `sundaniu31/grandpasland` 的 GitHub Issues 承载。浏览与下载无需账号；实际发布和发表评论在 GitHub 完成。标签写入分享正文中的 gl-asset 元数据，无需仓库标签权限。

API Key 默认只在当前页面中使用，用户明确勾选后才保存到 localStorage。服务商需允许浏览器跨域请求。取消生成只取消浏览器等待，可能仍有服务商计费。

Steam 链接尚未配置；域名 HTTPS 证书与 GitHub Pages 的强制 HTTPS 设置应在部署账户中核实。当前网站源代码不会强制跳转到未经确认可用的 HTTPS 域名。

此版本没有更改 Unity 项目。JSON 结构基于 Unity 2022.3 项目中的 NameLibraryStore、EntryLibraryStore、LibraryRegistry 与节日读取代码；游戏内实际效果仍需运行游戏验证。
