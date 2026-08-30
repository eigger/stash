"use client";

import { useEffect } from "react";
import { withBasePath } from "../lib/base-path";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBasePath("/sw.js")).catch((err) => {
      console.warn("service worker 등록 실패", err);
    });
  }, []);

  return null;
}
