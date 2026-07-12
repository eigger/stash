const CACHE_NAME = "stash-shell-v2";
// 오프라인에서도 하단 탭 대부분이 최소한 앱 셸(껍데기)은 뜨도록 주요 화면을 미리 캐시해둔다.
const SHELL_ASSETS = [
  "/",
  "/login",
  "/scan",
  "/items",
  "/locations",
  "/categories",
  "/labels",
  "/history",
  "/shopping",
  "/trash",
  "/backup",
  "/settings",
  "/offline",
];

// 셸만 뜨고 안이 텅 비어 있으면 오프라인에서 별 쓸모가 없다 — 아이템 목록/상세(GET)만
// 최근 성공 응답을 저장해뒀다가, 진짜 오프라인일 때만 그걸로 대신 보여준다. 쓰기 요청
// (POST/PUT/PATCH/DELETE)이나 다른 API는 절대 캐시하지 않는다 — 정확성이 중요한 데이터를
// 오프라인 상태로 잘못 보여주면 안 되기 때문이다.
const API_CACHE_NAME = "stash-api-v1";
const ITEMS_API_SUBROUTE_DENYLIST = new Set(["scan", "stats", "export.csv", "import.csv", "bulk", "bulk-delete"]);

function isCacheableItemsGet(request) {
  if (request.method !== "GET") return false;
  const { pathname } = new URL(request.url);
  if (pathname === "/api/items") return true;
  const match = pathname.match(/^\/api\/items\/([^/]+)$/);
  return !!match && !ITEMS_API_SUBROUTE_DENYLIST.has(match[1]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, API_CACHE_NAME]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (isCacheableItemsGet(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.open(API_CACHE_NAME).then((cache) => cache.match(request)).then((cached) => cached || Response.error()),
        ),
    );
    return;
  }

  if (request.url.includes("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // 캐시에도 없는 화면으로 오프라인 이동한 경우 — 이 화면은 처음이라 셸조차 없다는
          // 뜻이므로, 깨진 네트워크 오류 화면 대신 안내 페이지로 보낸다. 페이지 이동(HTML
          // 요청)에만 적용하고, JS/CSS 같은 정적 리소스 요청은 그대로 실패시킨다.
          if (request.mode === "navigate") return caches.match("/offline");
          return Response.error();
        }),
      ),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Stash", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* malformed payload — 기본값으로 표시 */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon.svg",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
