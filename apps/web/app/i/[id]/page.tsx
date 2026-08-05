import { redirect } from "next/navigation";

// 내부 발급 QR 라벨이 가리키는 짧은 딥링크(/i/<id>).
// 클라이언트 런타임 없이 HTTP 리다이렉트로 상세로 넘긴다 — 라벨 스캔 경로의 First Load를 줄이기 위함.
export default async function DeepLinkRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/items/${id}`);
}
