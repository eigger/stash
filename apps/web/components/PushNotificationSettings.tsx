"use client";

import { useEffect, useState } from "react";
import { useToast } from "../lib/toast-context";
import { useLocale } from "../lib/i18n/locale-context";
import {
  getPushConfig,
  getPushStatus,
  isPushSupported,
  registerPushSubscription,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/push";

// 유통기한/보증만료 임박 알림을 받으려면 브라우저 푸시 구독이 필요하다. 서버에 VAPID 키가
// 아직 없으면(관리자가 설정 > 외부 연동에서 발급 전) "미설정" 상태만 보여주고 끝낸다.
export function PushNotificationSettings() {
  const { show } = useToast();
  const { t, locale } = useLocale();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setLoading(false);
      return;
    }
    setPermission(Notification.permission);
    Promise.all([getPushConfig(), getPushStatus()])
      .then(([config, status]) => {
        setConfigured(config.configured);
        setSubscribed(status.subscribed);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      const config = await getPushConfig();
      if (!config.publicKey) {
        show(t("notConfiguredToast"), "error");
        return;
      }
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        show(t("permissionDeniedToast"), "error");
        return;
      }
      const subscription = await subscribeToPush(config.publicKey);
      await registerPushSubscription(subscription, locale);
      setSubscribed(true);
      show(t("enabledToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    try {
      await sendTestPush();
      show(t("testSentToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      show(t("disabledToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  if (!isPushSupported()) {
    return <p className="meta">{t("pushUnsupported")}</p>;
  }

  let statusText = t("pushStatusOff");
  if (!configured) statusText = t("pushStatusNotConfigured");
  else if (permission === "denied") statusText = t("pushStatusDenied");
  else if (subscribed) statusText = t("pushStatusOn");

  return (
    <div>
      <p className="meta">{t("pushDescription")}</p>
      <p className="meta">{t("statusLabel")} {statusText}</p>
      {configured && permission !== "denied" && (
        <div style={{ display: "flex", gap: 8 }}>
          {!subscribed ? (
            <button onClick={handleEnable} disabled={busy}>
              {busy ? t("processingButton") : t("enableButton")}
            </button>
          ) : (
            <>
              <button className="secondary" onClick={handleTest} disabled={busy}>
                {t("testButton")}
              </button>
              <button className="danger" onClick={handleDisable} disabled={busy}>
                {t("disableButton")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
