FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build -w packages/shared
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# basePath는 next build 시점에 산출물에 박히는데, 배포 경로를 빌드 때 알 수 없는 경우가 있다
# (Home Assistant Ingress는 설치본마다 /api/hassio_ingress/<token>/ 이 다르다). 그래서 항상
# 플레이스홀더로 빌드해두고, 컨테이너 기동 시 docker-entrypoint.sh가 BASE_PATH로 치환한다.
ARG BASE_PATH="/__BASE_PATH__"
# NEXT_PUBLIC_ 값은 빌드가 시작될 때 실제 환경변수로 있어야 프리렌더(매니페스트·메타데이터)까지
# 같은 값을 본다 — next.config에서 process.env에 심는 것만으로는 클라이언트 번들에만 반영된다.
ENV BASE_PATH=$BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=$BASE_PATH
RUN npm run build -w apps/web

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY apps/web/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
# BASE_PATH 미설정(기본)이면 플레이스홀더를 걷어내 지금까지와 똑같이 루트에서 서빙한다.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/web/server.js"]
