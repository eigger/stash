FROM node:20-alpine AS base
WORKDIR /app
# Prisma의 쿼리 엔진 바이너리가 Alpine 런타임에서 필요로 함 (없으면 libssl.so 관련 오류 발생)
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build -w packages/shared
RUN npm run prisma:generate -w apps/api
RUN npm run build -w apps/api

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/assets ./apps/api/assets
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
RUN mkdir -p /app/uploads
EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
