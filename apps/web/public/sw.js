const CACHE_NAME = "stash-shell-v2";
// 오프라인에서도 하단 탭 대부분이 최소한 앱 셸(껍데기)은 뜨도록 주요 화면을 미리 캐시해둔다.
// 실제 데이터는 API 응답이라 캐시하지 않고(/api/ 는 아래 fetch 핸들러에서 항상 제외), 화면
// 골격만 오프라인에서도 열리게 하는 것이 목적이다.
const SHELL_ASSETS = [
  "/",
  "/login",
  "/scan",
  "/items",
  "/locations",
  "/categories",
  "/labels",
  "/history",
  "/backup",
  "/offline",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
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
