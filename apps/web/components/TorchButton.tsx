"use client";

interface Props {
  active: boolean;
  onClick: () => void;
  label: string;
}

// 저조도 환경에서 인식률을 올리기 위한 플래시 토글 — 스캐너 프레임(position:relative)
// 안에 절대 위치로 겹쳐 그린다. 토치를 지원하는 기기에서만 부모가 렌더링한다.
export function TorchButton({ active, onClick, label }: Props) {
  return (
    <button
      type="button"
      className={`torch-button${active ? " active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
      </svg>
    </button>
  );
}
