// 실물 바코드 스캐너의 "삑" 소리를 흉내낸다 — 오디오 파일 없이 Web Audio API로 짧은
// 사각파 톤을 직접 만들어서 재생하므로 별도 에셋이 필요 없다.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

// 브라우저는 사용자 제스처 전에는 오디오 재생을 막는다. 스캔 감지는 사용자 클릭이
// 아니라 카메라 프레임 콜백에서 일어나므로, 화면을 처음 터치하는 시점에 미리
// 오디오 컨텍스트를 깨워둬야 실제 스캔 때 첫 삑 소리부터 바로 들린다.
export function unlockBeepAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

export function playBeep(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 1800;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.1);
  } catch {
    // 오디오 재생 실패가 스캔 처리 자체를 막으면 안 된다 — 조용히 무시.
  }
}
