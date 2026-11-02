"""배포본에 버전을 찍는다 — 사용: python tools/stamp_assets.py <짧은 sha>

NAS 배포(edge 저장소의 packetknight-deploy)가 releases/<sha>에 코드를 푼 뒤 이 스크립트를 실행한다.
index.html의 진입 모듈 ./src/main.js 를 ./v/<sha>/src/main.js 로 바꾼다. 모듈 안의 import는 상대 경로라
하위 모듈도 모두 /v/<sha>/src/... 로 받게 된다. nginx는 /v/<아무 sha>/src/... 를 src/... 로 연결한다.

왜: Cloudflare가 .js에 max-age=14400(4시간)을 덧씌워, 배포 직후 브라우저가 옛 모듈과 새 index.html을 섞어
import가 깨졌다(2026-11-02, 모바일에서 화면이 빈 채로 멈춤). 배포마다 주소가 바뀌면 섞일 수 없다.
저장소의 index.html은 그대로 ./src/main.js — 로컬 실행·스모크 테스트는 영향이 없다.
"""
import pathlib, re, sys

sha = sys.argv[1]
if not re.fullmatch(r"[0-9a-f]{7,40}", sha):
    sys.exit(f"잘못된 sha: {sha!r}")
index = pathlib.Path(__file__).resolve().parent.parent / "index.html"
html = index.read_text(encoding="utf-8")
entry = 'src="./src/main.js"'
if html.count(entry) != 1:
    sys.exit(f"index.html에서 {entry} 를 정확히 하나 찾지 못함")
index.write_text(html.replace(entry, f'src="./v/{sha}/src/main.js"'), encoding="utf-8")
print(f"stamped index.html → ./v/{sha}/src/main.js")
