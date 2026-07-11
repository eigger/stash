"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// 내부 발급 QR 라벨이 가리키는 짧은 딥링크(/i/<id>). 실제 상세 페이지로 바로 넘겨준다 —
// 라벨을 아무 카메라 앱으로 스캔해도 앱이 열리게 하는 게 목적.
export default function DeepLinkRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/items/${id}`);
  }, [id, router]);

  return null;
}
