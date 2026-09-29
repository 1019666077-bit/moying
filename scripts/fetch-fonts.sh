#!/bin/bash
# Download OFL brush fonts and write the Latin subsets the site ships.
# Requires: curl, pyftsubset (fonttools).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p fonts/full fonts
base="https://github.com/google/fonts/raw/main/ofl"
curl -fsSL "$base/mashanzheng/MaShanZheng-Regular.ttf" -o fonts/full/MaShanZheng-Regular.ttf
curl -fsSL "$base/longcang/LongCang-Regular.ttf" -o fonts/full/LongCang-Regular.ttf
curl -fsSL "$base/liujianmaocao/LiuJianMaoCao-Regular.ttf" -o fonts/full/LiuJianMaoCao-Regular.ttf
curl -fsSL "$base/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf" -o fonts/full/ZCOOLXiaoWei-Regular.ttf
curl -fsSL "$base/zhimangxing/ZhiMangXing-Regular.ttf" -o fonts/full/ZhiMangXing-Regular.ttf

subset() {
  pyftsubset "$1" \
    --unicodes="$2" \
    --glyph-names \
    --notdef-glyph \
    --notdef-outline \
    --recommended-glyphs \
    --name-IDs='*' \
    --output-file="$3"
}

subset fonts/full/ZCOOLXiaoWei-Regular.ttf "U+0020-007E" fonts/zcoolxiaowei-latin.ttf
subset fonts/full/MaShanZheng-Regular.ttf "U+0020-007E" fonts/mashanzheng-latin.ttf
subset fonts/full/LongCang-Regular.ttf "U+0020-007E" fonts/longcang-latin.ttf
subset fonts/full/LiuJianMaoCao-Regular.ttf "U+0020-007E" fonts/liujianmaocao-latin.ttf
subset fonts/full/ZhiMangXing-Regular.ttf "U+0020-007E" fonts/zhimangxing-latin.ttf
subset fonts/full/ZCOOLXiaoWei-Regular.ttf "U+58A8,U+82F1" fonts/seal.ttf
echo "font subsets ready"
