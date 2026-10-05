# 墨英附加服务：纹前汉字核对（Tattoo Check）

研究日期：2026-10-05。只依据能对上的公开页面与本次可访问的 Trends 数据。没有公开数字的地方标「未核实」；未知按门禁规则计为失败。不做产品代码。

## 结论

**建议：不做全自动「可以纹 / 不要纹」付费产品（no-go）。** 四道门禁里，付费竞品与搜索兴趣大致成立，但「一人一周、全自动、≥$9」与「皮肤上的永久语义责任」冲突；免费替代（r/translator、免费 checker、通用 AI）压低转化。

若仍要测需求，**最小测试不是上线 AI 判定，而是：人工咨询单 + 默认「不确定所以不要纹」+ 免免责，两周上限约 20 单，标价 $12–15，走现有 Waffo。** 测的是「愿不愿意为安心付钱」，不是「AI 能不能背锅」。达不到 5 笔真实付费或出现争议/差评，立刻停。

| 门禁 | 结果 | 一句话 |
| --- | --- | --- |
| 1 付费竞品 | **通过** | 至少两家对「即将纹汉字」客户收费，且有真实评价或长期客户反馈 |
| 2 Trends | **通过（部分）** | 直接拉到的 `chinese tattoo meaning` / `chinese tattoo` 五年不跌，偏升；`chinese tattoo translation` 被限流未核实 |
| 3 SERP | **通过（有方法局限）** | 窄词结果里小型站 ≥3，未见 Google Translate / Reddit 垄断前排；**不是**官方 Google 后台导出 |
| 4 一人全自动 | **失败** | 一周内可复用 Waffo 做出结账页，但「全自动 + 母语抽检 + 永久皮肤责任」不能同时成立 |

---

## 产品设想（研究范围）

墨英（[mymoying.com](https://mymoying.com/)）：英文名 → 毛笔字，$1.99，Waffo 收款。附加付费服务「Check before you ink」：面向即将纹汉字的西方人；输出三档 **OK to ink / don't ink / unsure so don't ink**，附一段母语者会怎么读的白话英文说明；定价 $9–19；交付设想为 AI + 母语者抽检。

---

## 门禁 1：至少两家付费竞品，赚的是「即将纹汉字」的人

**判定：通过。**

门槛：「≥2 个付费产品 + 真实评价或收入痕迹 + 客户是即将纹汉字的人」。未知 = 失败。

### 成立的付费产品

| 产品 | 价格（页面所见） | 是否对准纹身客户 | 评价 / 收入痕迹 | URL |
| --- | --- | --- | --- | --- |
| Transname 纹身翻译 | $10 翻译；另有 $6.50 纹身鉴定 | 是：自 2000 年起专做 Chinese tattoo translation | 客户反馈页多条点名纹身完成/满意；本次抓取约 172 条带日期反馈量级、文内 “tattoo” 出现约 187 次（页面自陈，非第三方审计） | [定价/首页](https://transname.com/) · [鉴定 $6.50](https://www.transname.com/tattoo_appraisal.html) · [反馈](https://transname.com/feedback.html) |
| Fiverr `kes_li`：翻译或核验传统汉字纹身 | 付费 gig（具体套餐价本次页面被反爬挡住，未核实美元数） | 是：标题与描述明确 verify tattoo | 搜索摘要可见 **5 星 (6)** 与多条买家评语（核验、缺笔、书法质量） | [gig](https://www.fiverr.com/kes_li/translate-or-verify-your-tattoo-meaning-in-tranditional-chineses-or-cantonese) |

这两家已满足「≥2 + 收费 + 真实评价痕迹 + 本客群」。

### 同赛道、但证据偏弱（不拿来凑「通过」）

| 产品 | 所见 | 缺口 | URL |
| --- | --- | --- | --- |
| ChineseToolkit Tattoo Checker | 免费即时检查 + **Safety Report $9.9**；页上写 “Trusted by 12,847” | **12,847 为站方自述，未核实**；未见独立评价平台条目 | [checker](https://www.chinesetoolkit.com/tattoo-checker/) |
| Cantonese Today Tattoo Consulting | **$23.99** PayPal/卡，邮件/IG 交付 | 付费成立；**公开评价数未核实** | [咨询页](https://www.cantonesetoday.com/tattoo-consulting/) |
| GoChineseName Tattoo Package | Explorer **$19.90**；纹身加购 **+$80**（结账捆绑 **$99.90**）；Professional **$199** / Premium **$219** 含 Tattoo Package | 明确卖「纹前语义审查 + 三套导出」；「2,000+ Names Reviewed」是起名总量自述，**纹身单量/评价未核实** | [定价](https://www.gochinesename.com/pricing) · [纹身页](https://www.gochinesename.com/chinese-name-tattoo) |
| ChineseTattooPro “Verify My Design” | 第三方搜索摘要写 **$19.90** / Expert **$99** | 本次环境 **无法打开** chinesetattoopro.com（超时/连不上）；**独立评价未找到** → 按规则不能当「已核实竞品」 | 摘要来源：[tattoo-meanings](https://www.chinesetattoopro.com/tattoo-meanings)（未成功抓取正文） |
| Etsy「chinese tattoo translation」 | 用户提示要查 | 本次 Etsy 搜索被验证码挡住；另见大量临时纹身贴纸，**不等于核对服务** → **未核实** | — |
| Fiverr `master__bo` | From $5；卖文化向纹身翻译 | 反爬，**评价/订单数未核实** | [gig](https://www.fiverr.com/master__bo/provide-authentic-chinese-tattoo-translation-and-cultural-meaning) |
| Ngan Fine Art | 付费定制汉字书法纹身设计 | 卖设计多于「三档判定」；销量数字未核实 | [说明](https://nganfineart.com/calli-tattoo/tattoo_why-order-from-me_en.html) |

**门禁 1 证据结论：** 市场里确实有人向「即将纹汉字」的人收钱；价格带覆盖约 **$5–$24（核对）** 到 **$48–$99+（翻译+设计包）**。墨英设想的 $9–19 落在已有核对价带内，不是空想。

---

## 门禁 2：Google Trends 五年稳定或上升

**判定：通过（部分）。** 直接用 `pytrends` 拉 `today 5-y` 全球兴趣；**不能**当作 Google 官方后台截图。Accio 文称 `Chinese character tattoo meaning` 近一年几乎为 0，与本次直接拉数矛盾，**不以 Accio 为准**（[Accio 文](https://zh.accio.com/business/%E6%B5%81%E8%A1%8C%E6%B1%89%E5%AD%97%E7%BA%B9%E8%BA%AB)）。

| 关键词 | 能否访问 | 五年大致形态（相对指数） | 判定 |
| --- | --- | --- | --- |
| `chinese tattoo meaning` | 可 | 周均约 26.9；前 52 周均约 25.4 → 近 52 周约 45.4；斜率正 | **上升** |
| `chinese tattoo` | 可 | 周均约 38.8；前 52 约 40.9 → 近 52 约 51.0；斜率正 | **上升** |
| `kanji tattoo` | 可 | 周均约 58.7；前 52 约 65.9 → 近 52 约 54.7；斜率负 | **缓降但仍高位** |
| `chinese tattoo translation` | **429 限流** | — | **未知 → 本词不计通过** |
| `kanji tattoo check` | 未单独拉成功 | — | **未知** |

说明：

- 汉字纹身「含义」类搜索在可测窗口里不崩；日文 kanji 词量更高但略降——和「汉字/日文混用」的需求重叠一致（见后文）。
- Trends 是相对指数，**不是搜索量绝对值**；不能据此估算 TAM。
- 年均值（`chinese tattoo meaning`）：2021≈20.8，2022≈25.8，2023≈22.9，2024≈19.7，2025≈20.5，2026≈53.4（2026 仅部分年，波动大，勿外推）。

**门禁 2：** 用户点名的核心意图词里，至少 `chinese tattoo meaning` 与更宽的 `chinese tattoo` 为稳定偏升 → **门禁通过**；点名的 `chinese tattoo translation` 本次未能直接访问 → 文中标未知，不伪造曲线。

---

## 门禁 3：窄词 Google 前十是否至少 3 个小站、非大牌/免费工具垄断

**判定：通过（方法有局限）。** 使用会话内 Web 搜索结果作为代理 SERP，**不是**登录 Google Search Console / 官方 SERP API；排名会变，以下只记本次快照里反复出现的小站。

对 `chinese tattoo translation`、`chinese tattoo meaning` / check before、相关核对意图，结果中反复出现的**小型站**包括：

1. [transname.com](https://transname.com/) — 独立纹身翻译老站  
2. [chinesecopywriter.com/chinese-tattoo-translation/](https://chinesecopywriter.com/chinese-tattoo-translation/) — 小型文案/翻译公司指南  
3. [chinesetoolkit.com/tattoo-checker/](https://www.chinesetoolkit.com/tattoo-checker/) — 独立 checker  
4. [nameaning.com/chinese-tattoo-text-checker.html](https://www.nameaning.com/chinese-tattoo-text-checker.html) — 免费自助核对  
5. [chenjinmandarin.com/articles/chinese-tattoo-words](https://www.chenjinmandarin.com/articles/chinese-tattoo-words) — 语言学校内容  
6. [chinesehelpers.com](https://www.chinesehelpers.com/topics/chinese-tattoo-mistakes-and-how-to-get-a-good-chinese-tattoo) — 小型内容/下载  
7. Fiverr 个人 gig（平台大、卖家小）

本次快照**前排未见** Google Translate 产品页或 Reddit 帖垄断窄词结果（Reddit 在「免费求助」场景仍是强替代，但是需求侧竞争，不等于 SERP 垄断）。

大牌翻译公司偶有出现（如 [Tomedes tattoo translation](https://www.tomedes.com/translation-services/personal-translation/tattoo)），但未到「前十全是品牌」程度。

**门禁 3：** ≥3 个小站可见 → **通过**；同时诚实标注：非官方 Google top10 导出。

---

## 门禁 4：一人、一周、全自动、≥$9、复用墨英代码与 Waffo；含责任风险

**判定：失败。**

| 子项 | 判断 | 证据 |
| --- | --- | --- |
| 复用墨英 + Waffo | **可行** | 已有 checkout / webhook / KV；价格在 [`functions/lib/pricing.js`](../functions/lib/pricing.js) 为 $1.99，新产品可另建 Waffo product id（[Waffo checkout 文档](https://docs.waffo.ai/api-reference/authentication)） |
| 一人一周做出结账 + 上传文案/图 + 邮件交付壳 | **大致可行** | 静态站 + Pages Functions 已跑通付费解锁；加一页表单+第二价格不需要新支付栈 |
| **全自动** 且输出可信三档判定 | **不可行（与产品承诺冲突）** | 设想包含「母语者抽检」→ 不是全自动；AI 单独放行「OK to ink」会把错误永久留在皮肤上 |
| ≥$9 定价 | **可行** | 竞品已在 $6.50–$23.99 核对带、$9.9 PDF 报告带成交或挂价 |
| 责任风险 | **高，可部分限制，无法消除** | 见下 |

### 责任风险（错纹在别人皮肤上）

墨英现有条款已明确：字图**不是翻译**、未经理母语者核对、纹身后果自负、责任上限为该订单金额（[terms](https://mymoying.com/terms.html)）。新服务若卖的是「语义核对 / OK to ink」，司法与舆论上的预期**高于**「去水印毛笔图」——免责声明能挡一部分，挡不住差评、退款平台争议、以及「你们说可以纹」的截图。

**限制手段（仍是减损，不是消灭风险）：**

1. **默认偏保守：** 只有极短、极常见、无组合歧义的词才可能给 OK；其余一律 `unsure so don't ink` 或 `don't ink`。  
2. **禁止「保证正确 / 可纹无忧」文案；** 报告标题用 “advisory reading”，不用 “certified”。  
3. **条款：** 咨询非法律/非专业认证翻译；总责任 ≤ 价款；用户须二次找母语者；禁止把报告当纹身店免责凭证。  
4. **不卖「OK」给草书、缺笔、镜像、复杂自造句；** 图片识别失败直接 unsure。  
5. **母语抽检若存在，就承认 SLA 不是即时全自动**——与「一人一周全自动」门禁互斥。  
6. **保单：** 专业责任险是否覆盖跨境数字咨询，**未核实**，上线前需问询，不可假设。

**门禁 4 失败原因（严格读）：** 「全自动」与「母语抽检 + 永久皮肤后果」不能同时满足。技术一周能上壳，信任一周建不起来。

---

## 日文汉字（kanji）重叠与免费替代

### 日文重叠

- 许多西方人把汉字纹身叫 “kanji tattoo”；汉字与日文常用汉字约有大幅重合，但简化字、写法、复合词义、语感不同（行业文与竞品均反复强调，如 [certifiedchinesetranslation](https://www.certifiedchinesetranslation.com/certified-tattoo-translation.html) 自述约 79% 可能相同——**该比例为对方自述，未独立核实**）。  
- 日文侧已有付费核对/设计：Kanji Sensei 约 **$48**（[translation](https://www.kanjisensei.com/translation/)）；Yorozuya 做母语核验的即下图文（[about](https://yorozuya.tech/about/)）。Trends 上 `kanji tattoo` 兴趣高于 `chinese tattoo meaning`，但略降。  
- **风险：** SEO 抢 “kanji” 会引来要日文语感的客户；用中文母语标准审日文诉求会误判。最小产品应写清 **Chinese / Mandarin reading only，不审日文专用写法**。

### 免费替代（直接抢付费）

| 替代 | 作用 | URL |
| --- | --- | --- |
| r/translator | 社区翻译；纹身帖有专用警告 wiki 机器人 | 例：[Soul Ties 纹身帖](https://www.reddit.com/r/translator/comments/119o5io/english_chinese_traditional_how_can_i_translate/) · [tattoo verification](https://www.reddit.com/r/translator/comments/1uy62dd/traditional_chinese_english_tattoo_idea/) |
| r/AskAChinese | 免费「这纹得行吗」 | 例：[Tattoo check](https://www.reddit.com/r/AskAChinese/comments/1ur0w8s/tattoo_check/) |
| ChineseToolkit 免费层 | 秒级含义/风险分 | [checker](https://www.chinesetoolkit.com/tattoo-checker/) |
| nameaning 免费自助 | 问卷式自检 | [checker](https://www.nameaning.com/chinese-tattoo-text-checker.html) |
| ChatGPT / Google Translate | 零成本「看起来像对的」 | 用户已知；专业文普遍劝阻，但转化漏斗顶部被它们吸走 |

付费理由必须是：**更快、可打印给纹身师、责任边界清晰、比 Reddit 更省事**——不是「只有我们能读汉字」。

---

## 正反公平评议

### 最强赞成理由

1. **已有人付钱给同一焦虑**（门禁 1）：Transname 二十年、Fiverr 核验评价、多家 $9–$24 核对价。  
2. **搜索意图仍在**（门禁 2）：`chinese tattoo meaning` 五年不崩且近窗上升。  
3. **SERP 未封闭**（门禁 3）：小站仍能排上窄词。  
4. **与墨英相邻：** 买毛笔图的人里，一部分下一步就是纹身；现有条款已提到纹身场景；Waffo 可复用，边际工程低。  
5. **客单高于 $1.99：** $9–19 对「一辈子纹错」的痛苦足够贵，对商家也比去水印更有意义。

### 最强反对理由

1. **责任不对称：** 错一次的修复成本（激光/遮盖/名誉）远高于 $19；免责声明挡不住截图式「你们说 OK」。  
2. **全自动门禁失败：** 要质量就有人；要全自动就不敢给 OK。  
3. **免费替代太近：** Reddit + 免费 checker + 通用 AI 覆盖「想确认一下」的大部分需求。  
4. **竞品已占「AI checker + $9.9 PDF」位**（ChineseToolkit）；墨英再做一个同构物，差异不足。  
5. **kanji 需求更大但标准不同，** 容易接错单、做错判。  
6. **Etsy/ChineseTattooPro 等关键对照项本次未能核实，** 真实市场厚度可能被高估或低估，信息不全时不应重仓。

### 最可能的失败方式

用户用免费工具或 Reddit 得到「差不多」的答案后不付费；或付费后把 AI 的 **OK to ink** 当保证，纹错后在社交平台点名——一次性声誉损失打掉墨英主产品信任。次要失败：抽检队列堵死，一人 SLA 崩盘。

---

## 建议与最小测试

**正式产品：no-go（不做全自动三档判定 SKU）。**

**若只花极小成本验证支付意愿（可选）：**

1. 一页英文落地：上传拟纹文字/草图 → 选 Waffo 付 **$12**（落在 $9–19 中位偏下）。  
2. **人工**（创始人或固定母语协作者）48–72h 内回一封英文短报告；模板只有三档，**默认偏向 unsure / don't ink**；不承诺 OK。  
3. 条款强化：advisory only；责任 ≤ 价款；必须再找第二母语者。  
4. 渠道：墨英付款成功页一条软链 + 现有 SEO 纹身相关页（如站内 calligraphy tattoo 内容）——**不买广告**。  
5. **两周或满 20 单提前停。** 成功线：≥5 笔无争议付费且无人把报告当「保证可纹」。失败线：0–2 单，或任何「按你们说的纹了」投诉。  
6. 不把「Trusted by N」写进页；不自动发 OK。

该测试**故意不满足**门禁 4 的「全自动」——因为全自动是失败点，不是目标。若连人工短报告都卖不动，AI 版更不必做。

---

## 未核实清单（禁止当事实用）

- ChineseTattooPro 页面正文、真实成交与评价（站点本次不可达）  
- Etsy 上「核对」类 listing 的销量  
- Fiverr 订单总数（有摘要称大量订单，**未在可抓取页面确认，不用**）  
- ChineseToolkit「12,847」、GoChineseName「2,000+ Names Reviewed」的第三方验证  
- `chinese tattoo translation` / `kanji tattoo check` 的五年 Trends 曲线（429）  
- 专业责任险是否覆盖此类服务  
- 官方 Google 前十完整列表（仅有搜索代理快照）

---

## 来源速查

- Transname：[首页](https://transname.com/) · [appraisal](https://www.transname.com/tattoo_appraisal.html) · [feedback](https://transname.com/feedback.html)  
- Fiverr kes_li：[gig](https://www.fiverr.com/kes_li/translate-or-verify-your-tattoo-meaning-in-tranditional-chineses-or-cantonese)  
- GoChineseName：[pricing](https://www.gochinesename.com/pricing) · [tattoo](https://www.gochinesename.com/chinese-name-tattoo)  
- ChineseToolkit：[tattoo-checker](https://www.chinesetoolkit.com/tattoo-checker/)  
- Cantonese Today：[tattoo-consulting](https://www.cantonesetoday.com/tattoo-consulting/)  
- 免费社区：r/translator、r/AskAChinese（上文链接）  
- 日文对照：Kanji Sensei、Yorozuya（上文链接）  
- 墨英条款：[terms](https://mymoying.com/terms.html)  
- Trends：本次 `pytrends`，`today 5-y`，全球，2026-10-05 拉取  
