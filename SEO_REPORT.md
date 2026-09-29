# SEO 落地页报告

分支：`seo/landing-pages-1`（基于 `main` 的最新提交 `e0f4ee8`）。

## 一、本次新增的页面与目标关键词

共新增 16 个英文落地页，全部使用站点自身的样式（`styles.css`）与渲染引擎（`app.js` + 画布），并已加入 `sitemap.xml`。

### 主题页（4 个，匹配真实搜索意图）

| 页面 | 目标关键词 | 核心内容 |
| --- | --- | --- |
| `name-in-chinese-calligraphy.html` | your name in Chinese calligraphy | 解释名字如何以毛笔字体书写、五种书体、下载方式 |
| `chinese-calligraphy-tattoo-ideas.html` | Chinese calligraphy tattoo ideas | 纹身选题/书体建议，**含"纹身前务必请母语者核对"的醒目提示** |
| `meaning-of-chinese-characters.html` | meaning of popular Chinese characters for gifts | 福、爱、安、喜、寿、财、梦、龙 八字卡（拼音+含义） |
| `custom-chinese-name-gift.html` | custom Chinese name gift | 从名字/单词到打印装裱的完整礼物流程 |

### 名字/单词页（12 个，展示"如何书写"）

| 页面 | 目标关键词 | 附带的中文对照（诚实标注为音译/对应字，非工具翻译） |
| --- | --- | --- |
| `emma.html` | Emma in Chinese calligraphy | 艾玛 (Àimǎ) |
| `michael.html` | Michael in Chinese calligraphy | 迈克尔 (Màikè'ěr) |
| `sophia.html` | Sophia in Chinese calligraphy | 索菲娅 (Suǒfēiyà) |
| `james.html` | James in Chinese calligraphy | 詹姆斯 (Zhānmǔsī) |
| `grace.html` | Grace in Chinese calligraphy | 格蕾丝 (Géléisī) |
| `lily.html` | Lily in Chinese calligraphy | 莉莉 (Lìlì) |
| `ethan.html` | Ethan in Chinese calligraphy | 伊桑 (Yīsāng) |
| `olivia.html` | Olivia in Chinese calligraphy | 奥利维亚 (Àolìwéiyà) |
| `love.html` | Love in Chinese calligraphy | 爱 (ài) |
| `peace.html` | Peace in Chinese calligraphy | 和平 (hépíng)、安 (ān) |
| `hope.html` | Hope in Chinese calligraphy | 希望 (xīwàng) |
| `dream.html` | Dream in Chinese calligraphy | 梦 (mèng)、梦想 (mèngxiǎng) |

每个页面均具备：唯一 `<title>`、唯一 `meta description`、唯一 `canonical`、单一 H1、真实有用的正文、指向生成器的内链（含 `?text=` 预填参数）以及页面间的互链。名字页均明确说明"Moying 不翻译名字，只按你输入的字符书写"，避免误导。

## 二、技术改动

- `app.js`：新增轻量（lite）渲染模式。当页面缺少控件（仅 `<canvas id="stage">` + `<body data-text="…">`）时，仍能正常绘制，默认 Regular 书体、米纸、墨色、朱印。主页 `index.html` 交互行为完全不变。
- `styles.css`：追加落地页样式（`.article`、`.cta`、`.pill`、`.note`、`.char-grid` 等），复用站点的墨/纸/朱红色调。
- `index.html`：补充首页 `meta description` 与 `canonical`。
- `sitemap.xml`（新增）：19 个 URL（首页 + 16 个新页 + terms + privacy），域名统一为 `https://mymoying.com/`。
- `robots.txt`（新增）：`Allow: /` 并指向 `https://mymoying.com/sitemap.xml`。

## 三、Bing Webmaster / Google Search Console 提交建议

1. **Google Search Console**
   - 用域名属性（Domain property）添加 `mymoying.com`（建议 DNS TXT 验证），或 URL 前缀属性添加 `https://mymoying.com/`。
   - 左侧「Sitemaps」提交 `https://mymoying.com/sitemap.xml`。
   - 等收录后用「URL Inspection」抽查首页与 `emma.html`、`love.html` 等新页，确认 canonical 与索引状态正常。

2. **Bing Webmaster Tools**
   - 用「从 GSC 导入」一键导入，或手动添加站点并验证所有权。
   - 「Sitemaps」提交同一份 `https://mymoying.com/sitemap.xml`。
   - 若尚未开通，可一并提交 Pinterest 的图片链接（站点能导出 PNG/JPG/SVG，适合 Pinterest 引流）。

3. **提交后观察点**
   - 确认 `robots.txt` 与 `sitemap.xml` 已上线到 `https://mymoying.com/`（推送合并、GitHub Pages 部署完成后）。
   - 关注覆盖页里新页是否进入索引；若有"已发现但未索引"，优先检查内链与关键词重复。

## 四、注意事项

- 纹身页已按任务要求加入"纹身前务必请中文母语者核对字形与含义"的醒目提示（`.note`）。
- 全文未编造任何用户评价、销量或其它虚假事实；价格描述与站点一致（免费带水印预览，$1.99 一次性去水印）。
- 本次仅新增/修改 `seo/landing-pages-1` 分支内容，未触碰支付密钥、签名配置、DNS、bundle 名称等。
