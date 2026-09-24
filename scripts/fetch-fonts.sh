#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p fonts
base="https://github.com/google/fonts/raw/main/ofl"
curl -L "$base/mashanzheng/MaShanZheng-Regular.ttf" -o fonts/MaShanZheng-Regular.ttf
curl -L "$base/longcang/LongCang-Regular.ttf" -o fonts/LongCang-Regular.ttf
curl -L "$base/liujianmaocao/LiuJianMaoCao-Regular.ttf" -o fonts/LiuJianMaoCao-Regular.ttf
curl -L "$base/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf" -o fonts/ZCOOLXiaoWei-Regular.ttf
curl -L "$base/zhimangxing/ZhiMangXing-Regular.ttf" -o fonts/ZhiMangXing-Regular.ttf
echo "fonts ready"
