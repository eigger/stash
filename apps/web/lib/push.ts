import { API_URL, apiFetch } from "./api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

export async function getPushConfig(): Promise<{ configured: boolean; publicKey: string | null }> {
  const res = await fetch(`${API_URL}/api/push/config`);
  if (!res.ok) return { configured: false, publicKey: null };
  return res.json();
}

export async function getPushStatus(): Promise<{ configured: boolean; subscribed: boolean; subscriptionCount: number }> {
  const res = await apiFetch("/api/push/status");
  if (!res.ok) return { configured: false, subscribed: false, subscriptionCount: 0 };
  return res.json();
}

export async function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
}

export async function registerPushSubscription(subscription: PushSubscription, locale: string): Promise<void> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Invalid push subscription");
  }

  const res = await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      locale,
    }),
  });
  if (!res.ok) throw new Error("Failed to register push subscription");
}

export async function sendTestPush(): Promise<void> {
  const res = await apiFetch("/api/push/test", { method: "POST" });
  if (!res.ok) throw new Error("Failed to send test notification");
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await apiFetch("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) });
  await subscription.unsubscribe();
}
