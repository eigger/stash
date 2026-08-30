const pkg = require("./package.json");

// 서브패스 배포용 basePath. 값이 없으면(기본) 지금까지처럼 오리진 루트에 붙는다.
// 도커 이미지는 BASE_PATH=/__BASE_PATH__ 로 빌드해두고 기동 시 실제 경로로 치환하므로,
// 이미지 하나로 루트에도, /stash 같은 서브패스에도, Home Assistant Ingress에도 올릴 수 있다.
const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");

// `next dev`처럼 NEXT_PUBLIC_BASE_PATH 없이 BASE_PATH만 준 경우를 위한 폴백.
// 프로덕션 빌드는 Dockerfile이 두 값을 모두 실제 환경변수로 넘긴다 — 빌드가 시작될 때
// 환경변수로 존재해야 프리렌더 산출물(매니페스트·메타데이터)에도 같은 값이 박힌다.
process.env.NEXT_PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? basePath;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  basePath,
  // basePath 루트 URL이 슬래시로 끝나게 한다. 기본값(false)이면 Next가 "<base>/"를 "<base>"로
  // 정규화하는데, Home Assistant Ingress는 /api/hassio_ingress/{token}/{path:.*} 한 가지로만
  // 라우트를 등록해서 슬래시가 없는 그 주소를 404로 떨군다 — 서버 응답(308)이든 클라이언트
  // 라우터의 router.push("/")든 마찬가지라, 로그인 후 홈으로 가는 순간 앱 밖으로 떨어진다.
  trailingSlash: true,
  env: {
    APP_VERSION: pkg.version,
  },
};

module.exports = nextConfig;
