#!/bin/sh
# 빌드 산출물에는 basePath가 /__BASE_PATH__ 플레이스홀더로 박혀 있다(apps/web/Dockerfile).
# 컨테이너를 띄울 때 BASE_PATH 값으로 바꿔치기해서, 같은 이미지를 오리진 루트에도 /garage 같은
# 서브패스에도 올릴 수 있게 한다. Home Assistant Ingress처럼 경로가 설치본마다 다른 배포는
# 빌드 시점에 값을 확정할 수 없어서 이 방식이 필요하다.
set -e

PLACEHOLDER="/__BASE_PATH__"
# 이미지에서는 /app 이지만, 테스트에서 다른 경로에 풀어놓고 확인할 수 있게 열어둔다.
APP_ROOT="${APP_ROOT:-/app}"
APP_DIR="$APP_ROOT/apps/web"
STATE_FILE="$APP_ROOT/.base-path"
PRISTINE_DIR="$APP_ROOT/.base-path-pristine"

# 뒤 슬래시를 떼고, 앞 슬래시는 보장한다. 빈 값이면 루트 배포.
desired=$(printf '%s' "${BASE_PATH:-}" | sed 's:/*$::')
case "$desired" in
  "" | /*) ;;
  *) desired="/$desired" ;;
esac

applied=$(cat "$STATE_FILE" 2>/dev/null || printf '%s' "$PLACEHOLDER")

if [ "$applied" != "$desired" ]; then
  # 치환은 언제나 플레이스홀더에서 출발한다. 이미 한 번 치환한 컨테이너라면 원본을 되돌린 뒤
  # 다시 치환한다 — 적용된 값을 거꾸로 찾아 바꾸면 같은 문자열이 우연히 들어 있는 곳까지 망가진다.
  if [ "$applied" != "$PLACEHOLDER" ] && [ -d "$PRISTINE_DIR" ]; then
    (cd "$PRISTINE_DIR" && find . -type f | while IFS= read -r rel; do
      cp "$rel" "$APP_ROOT/$rel"
    done)
  fi

  targets=$(find "$APP_DIR" -type f \
    \( -name '*.js' -o -name '*.json' -o -name '*.html' -o -name '*.rsc' \
       -o -name '*.css' -o -name '*.map' -o -name '*.body' -o -name '*.txt' \) \
    -exec grep -l "$PLACEHOLDER" {} +) || true

  if [ -n "$targets" ]; then
    # 다음번에 BASE_PATH가 바뀌어도 되돌릴 수 있도록 원본을 남겨둔다.
    if [ ! -d "$PRISTINE_DIR" ]; then
      printf '%s\n' "$targets" | while IFS= read -r file; do
        rel=${file#"$APP_ROOT"/}
        mkdir -p "$PRISTINE_DIR/$(dirname "$rel")"
        cp "$file" "$PRISTINE_DIR/$rel"
      done
    fi

    # sed -i는 구현마다 인자가 달라(GNU/BSD) 임시 파일로 바꿔 쓴다.
    printf '%s\n' "$targets" | while IFS= read -r file; do
      sed "s|$PLACEHOLDER|$desired|g" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    done
  fi

  printf '%s' "$desired" > "$STATE_FILE"
  [ -z "$desired" ] || echo "[entrypoint] serving under base path: $desired"
fi

# 프리렌더되지 않고 요청마다 서버에서 그려지는 부분(메타데이터·매니페스트 등)은 런타임에
# process.env를 그대로 읽으므로 같은 값을 넘겨준다.
NEXT_PUBLIC_BASE_PATH="$desired"
export NEXT_PUBLIC_BASE_PATH

exec "$@"
