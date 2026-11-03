#!/bin/sh
# 배포본 _site 를 만든다 — 사용: sh tools/build_site.sh [sha]   (기본: HEAD)
# 커밋된 index.html 과 src/ 만 내보낸다 (PRD·scripts·package.json 은 배포하지 않는다).
# index.html 의 진입 모듈을 ./v/<sha>/src/main.js 로 바꾸고 (tools/stamp_assets.py),
# src/ 를 v/<sha>/src/ 에도 복사해 그 주소를 1년 캐시한다 (cloudflare/_headers).
set -eu
cd "$(dirname "$0")/.."
SHA=$(git rev-parse --short=7 "${1:-HEAD}")
rm -rf _site
mkdir -p _site/tools "_site/v/$SHA"
git archive "$SHA" index.html src | tar -x -C _site
cp tools/stamp_assets.py _site/tools/
python3 -I _site/tools/stamp_assets.py "$SHA"     # _site/index.html 을 고친다
rm -r _site/tools
cp -R _site/src "_site/v/$SHA/src"
cp cloudflare/_headers cloudflare/_redirects cloudflare/404.html _site/
echo "built _site @ $SHA ($(find _site -type f | wc -l) files)"
