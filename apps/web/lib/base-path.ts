// 앱이 항상 오리진 루트에 있는 것은 아니다. 리버스 프록시의 서브패스(https://example.com/garage/)나
// Home Assistant Ingress(/api/hassio_ingress/<token>/) 아래에 놓일 수 있고, 후자의 경로는
// 설치본마다 달라 빌드 시점에 알 수 없다.
//
// 그래서 도커 이미지는 basePath를 /__BASE_PATH__ 플레이스홀더로 빌드하고, 컨테이너를 띄울 때
// BASE_PATH 값으로 치환한다(apps/web/docker-entrypoint.sh). 이 값이 번들에 문자열 그대로
// 남아 있어야 치환이 되므로, 여기서 플레이스홀더를 걸러내는 식의 가공은 하면 안 된다 —
// 하면 빌드 시 상수 폴딩으로 접혀서 치환할 대상이 사라진다.
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/** 루트 기준 절대경로에 배포 프리픽스를 붙인다. `/sw.js` → `/garage/sw.js` */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
