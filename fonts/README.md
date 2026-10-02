Latin subsets of SIL Open Font License brush faces, self-hosted so the page does not download full CJK files from a CDN.

| File | Style | Source |
| --- | --- | --- |
| zcoolxiaowei-latin.ttf | Neat | ZCOOL XiaoWei |
| mashanzheng-latin.ttf | Regular | Ma Shan Zheng |
| longcang-latin.ttf | Flowing | Long Cang |
| liujianmaocao-latin.ttf | Grass | Liu Jian Mao Cao |
| zhimangxing-latin.ttf | Wild | Zhi Mang Xing |
| seal.ttf | Seal marks 墨 and 英 | ZCOOL XiaoWei |
| mashanzheng-hanzi.ttf | Chinese characters for the name combos | Ma Shan Zheng |

Subsets keep U+0020–U+007E (seal.ttf keeps U+58A8 and U+82F1 only). `mashanzheng-hanzi.ttf` keeps only the characters that appear in `data/names-zh.json` (185 glyphs at 241 names), so the English-name + Chinese-name combo can draw its characters without shipping the full CJK font. Licenses and copyright lines are in `OFL.txt`; Ma Shan Zheng is SIL OFL 1.1, copyright 2018 The Ma Shan Zheng Project Authors (https://github.com/googlefonts/mashanzheng). Rebuild with `bash scripts/fetch-fonts.sh` (needs `pyftsubset` and `node`).
