/** apiFetch로 받은 응답을 브라우저 다운로드로 저장한다. */
export async function downloadBlob(res: Response, fallbackFilename: string): Promise<void> {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackFilename;
  // DOM에 붙이지 않고 즉시 revoke하면 Firefox/Safari에서 큰 파일 다운로드가 취소될 수 있다.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
