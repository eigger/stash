import type { FastifyRequest } from "fastify";

export type ApiLocale = "ko" | "en";

// 프론트엔드가 보내는 X-Locale 헤더(사용자가 앱에서 고른 언어, stash_locale)를 최우선으로
// 쓴다 — 브라우저의 Accept-Language(OS/브라우저 설정)는 앱 안에서 고른 언어와 다를 수
// 있어서 신뢰하지 않는다. 헤더가 없거나 "en"이 아니면 이 앱의 기본 언어인 한국어로 본다.
export function localeFromRequest(request: FastifyRequest): ApiLocale {
  const header = request.headers["x-locale"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === "en" ? "en" : "ko";
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

// API가 클라이언트에게 보내는 에러/안내 문자열 전용 사전 — apps/web의 UI 문자열
// (lib/i18n/translations.ts)과는 별개다. API는 서버 프로세스 하나가 모든 요청을
// 처리하므로 React 컨텍스트 없이 요청마다 로케일을 넘겨받아야 한다.
const MESSAGES = {
  itemIdRequired: { ko: "itemId가 필요합니다", en: "itemId is required" },
  itemNotFound: { ko: "아이템을 찾을 수 없습니다", en: "Item not found" },
  fileRequired: { ko: "파일이 없습니다", en: "No file provided" },
  invalidImageFile: { ko: "손상되었거나 지원하지 않는 이미지 파일입니다", en: "Corrupted or unsupported image file" },
  unsupportedFileType: { ko: "지원하지 않는 파일 형식: {mimetype}", en: "Unsupported file type: {mimetype}" },
  fileNotFound: { ko: "파일을 찾을 수 없습니다", en: "File not found" },
  fileMissingOnDisk: { ko: "디스크에서 파일을 찾을 수 없습니다", en: "File missing on disk" },
  attachmentNotFound: { ko: "첨부파일을 찾을 수 없습니다", en: "Attachment not found" },

  barcodeNotFound: { ko: "바코드를 찾을 수 없습니다", en: "Barcode not found" },
  barcodeAlreadyRegistered: {
    ko: "이미 다른 아이템에 등록된 바코드 값입니다",
    en: "This barcode is already registered to another item",
  },

  bootstrapDisabled: {
    ko: "이미 관리자 계정이 있어 초기 설정을 할 수 없습니다",
    en: "Bootstrap is disabled — an admin account already exists",
  },
  invalidCredentials: { ko: "이메일 또는 비밀번호가 올바르지 않습니다", en: "Invalid email or password" },
  cannotDeleteSelf: { ko: "본인 계정은 삭제할 수 없습니다", en: "You cannot delete your own account" },
  currentPasswordRequired: { ko: "현재 비밀번호를 입력하세요", en: "Current password is required" },
  userNotFound: { ko: "사용자를 찾을 수 없습니다", en: "User not found" },
  incorrectCurrentPassword: { ko: "현재 비밀번호가 올바르지 않습니다", en: "Current password is incorrect" },

  adminRoleRequired: { ko: "관리자 권한이 필요합니다", en: "Admin role required" },
  forbidden: { ko: "권한이 없습니다", en: "Forbidden" },
  noBackupFileUploaded: { ko: "백업 파일이 없습니다", en: "No backup file uploaded" },
  invalidBackupFile: {
    ko: "올바르지 않은 백업 파일입니다 (db.json 없음)",
    en: "Invalid backup file (db.json not found)",
  },

  unknownSettingKey: { ko: "알 수 없는 설정 키입니다", en: "Unknown setting key" },
  naverCredentialsRequired: {
    ko: "Client ID/Secret을 먼저 저장하세요.",
    en: "Save a Client ID/Secret first.",
  },
  naverApiError: { ko: "네이버 API 응답 오류 ({status}): {detail}", en: "Naver API error ({status}): {detail}" },
  naverRequestFailed: { ko: "요청 실패: {detail}", en: "Request failed: {detail}" },
  naverCredentialsHint: { ko: "Client ID/Secret을 확인하세요.", en: "Check your Client ID/Secret." },

  noBarcodedItemsSelected: {
    ko: "선택한 아이템 중 바코드가 있는 항목이 없습니다",
    en: "None of the selected items have a barcode",
  },

  csvFileRequired: { ko: "CSV 파일이 없습니다.", en: "No CSV file provided." },
  emptyCsvFile: { ko: "빈 CSV 파일입니다.", en: "The CSV file is empty." },
  csvMissingNameColumn: { ko: "CSV 헤더에 name 컬럼이 없습니다.", en: "The CSV header is missing a name column." },
  csvRowNameEmpty: { ko: "{row}행: name이 비어 있어 건너뜀", en: "Row {row}: name is empty, skipped" },
  csvRowBarcodeConflict: {
    ko: "{row}행 ({name}): 바코드 값이 이미 다른 아이템에 등록되어 있음",
    en: "Row {row} ({name}): barcode value is already registered to another item",
  },
  csvRowError: { ko: "{row}행 ({name}): {detail}", en: "Row {row} ({name}): {detail}" },

  onlyTrashedCanBePurged: {
    ko: "휴지통에 있는 아이템만 영구 삭제할 수 있습니다.",
    en: "Only items already in the trash can be permanently deleted.",
  },
  webhookNotConfigured: {
    ko: "웹훅이 설정되지 않았습니다. 설정 > 외부 연동에서 등록하세요.",
    en: "No webhook configured. Set one up under Settings > Integrations.",
  },
  itemHasNoBarcode: {
    ko: "이 아이템에는 바코드가 없습니다. 먼저 라벨을 발급하세요.",
    en: "This item has no barcode. Issue a label first.",
  },
  cannotConsumeUnregisteredBarcode: {
    ko: "등록되지 않은 바코드는 소비 처리할 수 없습니다. 먼저 입고로 스캔해 등록하세요.",
    en: "An unregistered barcode can't be consumed. Scan it in restock mode first to register it.",
  },

  pushNotConfigured: { ko: "서버에 푸시 알림이 설정되지 않았습니다", en: "Push notifications aren't configured on the server" },
  noPushSubscriptions: { ko: "구독 정보가 없습니다", en: "No push subscription found" },
  testPushBody: {
    ko: "테스트 알림입니다. 정상적으로 도착했다면 푸시 설정이 잘 되어 있는 것입니다.",
    en: "This is a test notification. If it arrived, your push setup is working.",
  },
  forbiddenSubscription: { ko: "다른 사용자의 구독입니다", en: "This subscription belongs to another user" },
} as const;

export type ApiMessageKey = keyof typeof MESSAGES;

export function t(key: ApiMessageKey, locale: ApiLocale, params?: Record<string, string | number>): string {
  return interpolate(MESSAGES[key][locale], params);
}
