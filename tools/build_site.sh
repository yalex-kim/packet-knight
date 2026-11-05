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
git archive "$SHA" index.html src sw.js manifest.webmanifest | tar -x -C _site
cp tools/stamp_assets.py _site/tools/
python3 -I _site/tools/stamp_assets.py "$SHA"     # _site/index.html 을 고친다
rm -r _site/tools
cp -R _site/src "_site/v/$SHA/src"
# 진입 모듈을 하나로 묶는다 (Stage 13.28) — 모듈 60여 개를 차례로 받던 폭포를 요청 하나로. three 는 importmap(CDN) 그대로.
# 묶음은 v/<sha>/pk.js — v/<sha>/src/* 는 _redirects 규칙이 정적 파일보다 먼저 src/ 로 돌려 버린다(그래서 이름을 달리한다).
# 나머지 v/<sha>/src/*.js 는 남겨 둔다 (옛 주소 호환). 실패하면 배포를 멈춘다 (set -e).
npx --yes esbuild@0.24.0 _site/src/main.js --bundle --format=esm --external:three --minify --target=es2022 \
  --legal-comments=none --log-level=warning --outfile="_site/v/$SHA/pk.js"
sed -i "s#src=\"./v/$SHA/src/main.js\"#src=\"./v/$SHA/pk.js\"#" _site/index.html
grep -q "src=\"./v/$SHA/pk.js\"" _site/index.html
sed -i "s/^const VERSION = \"dev\";/const VERSION = \"$SHA\";/" _site/sw.js
grep -q "const VERSION = \"$SHA\";" _site/sw.js
cp cloudflare/_headers cloudflare/_redirects cloudflare/404.html _site/
echo "built _site @ $SHA ($(find _site -type f | wc -l) files)"
