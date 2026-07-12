# Stash

[![CI](https://github.com/eigger/stash/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/eigger/stash/actions/workflows/ci.yml)
[![Docker Release](https://github.com/eigger/stash/actions/workflows/docker-release.yml/badge.svg)](https://github.com/eigger/stash/actions/workflows/docker-release.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/eigger/stash)](https://github.com/eigger/stash/blob/master/LICENSE)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-2563EB)](proxmox/ct/stash.sh)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Feigger%2Fstash-2496ED?logo=docker&logoColor=white)](https://github.com/eigger/stash/pkgs/container/stash-api)

**[English README](./README.md)**

셀프호스팅 가정용 재고·바코드 관리 — 기존 제품 바코드(UPC/EAN), 직접 발급한 QR 라벨, Matter 페어링 코드를 스캔해서 집안 물건을 관리합니다. 연속 스캔으로 입고·소비를 처리하고, 대시보드에서 재고부족·유통기한을 한눈에 보고, 라벨을 인쇄합니다.

> 현재 릴리스: **v0.5.1**

문서: [`docs/ROADMAP.md`](./docs/ROADMAP.md)

---

## 기능

- 중첩 위치(방 / 선반 / 상자)를 들여쓰기 트리로 표시, 카테고리
- 수량, 재고부족 기준 수량, 유통기한·보증 만료일, 가격, 사진, 메모 — 이름·단위는 아이템 상세에서 바로 인라인 편집. 직접 등록 폼에서 바로 사진을 촬영/선택할 수 있고(업로드 시 자동 리사이즈), 설정에서 지정한 기본 통화가 가격 단위란에 미리 채워짐
- 통합 `Item` + `Barcode` 모델 — 기존 UPC/EAN, 직접 발급 내부 QR(아이템 딥링크), Matter 페어링 코드, 수동 입력 시리얼번호(Matter 코드는 실제 커미셔닝이 아니라 식별자 용도임을 안내하는 문구 포함)를 하나의 바코드 타입으로
- 수량 관리와 별개로 자산(기기) 모드 — 아이템을 **자산**으로 전환하면 개별 기기 하나를 추적: 상태(신품/사용중/수리필요/폐기), 시리얼번호 바코드 등록, 정비 이력(날짜·내용·비용) 기록. 자산은 수량 스텝퍼·재고부족 필드가 숨겨지고 장보기/재고부족 로직에서 제외되며, 자산 바코드를 스캔하면 수량 조정 없이 "확인됨"만 알려줌
- 연속 카메라 스캔: **입고(+1)** / **소비(−1)** 모드, 화면 전환 없이 계속 스캔 — 직접 등록 폼이나 바코드/Matter 코드 추가에서도 카메라 스캔 지원. 실사용 인식률/속도를 위해 포맷 제한·고해상도·연속 오토포커스로 튜닝했고, 스캔 성공 시 삑 소리·진동, 저조도용 플래시 토글 지원. 새로 자동 생성된 아이템은 그 자리에서 바로 위치·기준수량을 채우는 미니시트 제공
- 외부 제품 조회 연동을 다중 선택 가능(Open Food Facts, UPCItemDB, 네이버쇼핑) — 원하는 제공자만 켜거나 아예 꺼서 조회 자체를 생략
- 대시보드: 총 자산가치, 재고부족·유통기한 임박 항목을 전면에, 첫 사용 시 온보딩 체크리스트(위치·알림·공개URL) 제공
- 하단 탭으로 바로 가는 장보기 리스트 — 재고부족 항목은 물론 재고와 무관하게 수동으로 추가한 항목도 포함, 메모 표시·구매완료 체크 지원
- 검색(이름 또는 바코드 값)·위치/카테고리 필터·정렬·페이지네이션이 있는 아이템 목록, 마지막 필터/정렬 기억; 여러 아이템을 선택해 위치/카테고리 일괄 변경·일괄 삭제
- 삭제 시 실행취소 — 아이템을 지우면 바로 **실행취소** 토스트가 뜸
- 대량 입력·스프레드시트 이전을 위한 CSV 가져오기 / 내보내기(바코드 값 포함)
- 라벨 인쇄: 단일 PNG, 또는 A4 라벨 시트 PDF(한글 이름은 번들된 Noto Sans KR 서브셋으로 렌더링), 라벨 선택 화면에 검색 지원
- 유통기한 / 보증 만료 푸시 알림 + 주간 재고부족 요약 알림(Web Push)
- 휴지통(소프트 삭제) — 복구 + 30일 자동 영구삭제
- 오프라인 지원 PWA: 앱 셸 캐시에 더해 아이템 목록/상세 응답도 캐시해 오프라인에서 조회 가능, 스캔/직접 등록 홈 화면 숏컷, 오프라인 스캔 큐(온라인 복귀 시 자동 동기화)
- 프린터·라벨 기기 자동화(예: Home Assistant)용 재고 이벤트 웹훅 — 마지막 전송 실패를 설정 화면에서 확인 가능
- 관리자 / 일반 역할, 최초 관리자 부트스트랩, 본인 비밀번호 변경, 백업/복원, 한/영 i18n, 라이트/다크 테마

---

## 스크린샷 & 사용 방법

### 1. 대시보드

로그인 후 홈 화면입니다. 총 자산가치와 **재고부족**, **유통기한 임박**, **최근 등록**을 보여줍니다. 카드의 `+` / `−`로 바로 수량을 조정하거나 **장보기 리스트로 보기**로 이동합니다.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/ko/01-dashboard.png" alt="대시보드" width="340" />

### 2. 스캔

연속 바코드 / QR 스캔입니다. **입고(+1)** 또는 **소비(−1)**를 고르고 화면을 벗어나지 않고 계속 스캔합니다 — 등록된 아이템은 수량이 조정되고, 미등록 바코드는 자동으로 등록됩니다. 카메라가 없으면 바코드를 직접 입력할 수 있습니다.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/ko/02-scan.png" alt="스캔" width="340" />

### 3. 아이템

검색, **위치** / **카테고리** 필터, **정렬**(최근 등록순 / 수량 적은순 / 유통기한 임박순)이 있는 전체 목록입니다. 여기서 전체 목록을 CSV로 내보내거나 가져올 수 있습니다.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/ko/03-items.png" alt="아이템" width="340" />

### 4. 아이템 상세

수량, 위치, 카테고리, 재고부족 기준 수량, 유통기한 / 보증 만료일, 가격, 사진을 편집합니다. 기존 바코드 연결, 내부 QR 발급, Matter 코드 추가, 프린터 출력 요청이 가능하고, 아래에 수량 변경 이력이 표시됩니다.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/ko/04-item-detail.png" alt="아이템 상세" width="340" />

### 5. 장보기 리스트

재고부족 항목을 체크리스트로 보여줍니다. 사 온 만큼 `+`를 누르면, 기준 수량을 넘는 순간 목록에서 자동으로 빠집니다.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/ko/05-shopping.png" alt="장보기 리스트" width="340" />

### 6. 더보기

그룹별 메뉴입니다. **구조 관리**(위치·카테고리), **작업·기록**(장보기 리스트·라벨 인쇄·휴지통), **계정·연동**(설정·가족 계정·연동 키)으로 나뉩니다.

<img src="https://raw.githubusercontent.com/eigger/stash/master/docs/screenshots/ko/06-more.png" alt="더보기" width="340" />

---

## 빠른 시작

### 1. 설치

**Proxmox (권장)**

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/eigger/stash/master/proxmox/ct/stash.sh)"
```

community-scripts 스타일 설치 마법사가 Docker가 포함된 Debian 13 LXC를 만들고, 배포 파일과 랜덤 시크릿이 든 `.env`를 `/opt/stash`에 쓴 뒤 `stash.service` systemd 유닛으로 스택을 기동합니다. 완료 후 `http://<LXC_IP>`로 접속하세요. 이후 업데이트는 컨테이너 안에서 `update`로 합니다.

**Docker Compose**

```sh
docker compose -f docker-compose.prod.yml up -d
```

시작 전에 `.env`에 `POSTGRES_PASSWORD`, `JWT_SECRET`을 설정하세요. 이미지는 `ghcr.io/<owner>/stash-api` / `stash-web`을 씁니다 — 포크했다면 `GH_REPOSITORY_OWNER`(및 `proxmox/install/stash-install.sh`의 이미지 이름)를 맞추세요.

### 2. 최초 관리자 생성

새로 설치하면 사용자가 없을 때 `/login`에 **최초 관리자 만들기**가 나타납니다.

1. `/login` 열기
2. 이름·이메일·비밀번호 입력
3. 제출 — `ADMIN`으로 로그인됩니다

공개 회원가입은 비활성화되어 있습니다. 이후 계정은 관리자가 **더보기 → 가족 구성원 계정**에서만 만듭니다.

### 3. 위치·카테고리 설정

**더보기 → 위치 관리 / 카테고리 관리**에서 물건이 있는 곳(방, 선반, 냉장고…)과 분류(식품, 생활용품, 전자제품…)를 만듭니다. 둘 다 중첩 가능하고 선택 사항이라, 아이템마다 나중에 채워도 됩니다.

### 4. 일상 사용

| 할 일 | 위치 |
|---|---|
| 스캔으로 입고 / 소비 | **스캔** (하단 탭) |
| 바코드 없는 물건 등록 | 아이템 → **직접 등록** |
| 수량 빠르게 조정 | 아이템 카드의 `+` / `−` |
| 뭘 사야 하나 | 대시보드 → **장보기 리스트로 보기** |
| 대량 가져오기 / 내보내기 | 아이템 → **CSV 가져오기 / 내보내기** |
| 라벨 인쇄 | 더보기 → **라벨 인쇄** |
| 삭제한 아이템 복구 | 더보기 → **휴지통** |
| 유통기한 / 보증 알림 | 설정 → **알림** |
| 백업 / 복원 | 설정 → **백업 / 복원** |

### 5. 재고 이벤트 웹훅 (선택)

**설정 → 외부 연동**에서 URL 하나를 등록합니다. 아이템 생성 / 수정 / 스캔 시, 그리고 명시적 출력 요청 시 Stash가 JSON 페이로드를 POST하므로, 받는 자동화(예: Home Assistant)가 자체적으로 라벨을 렌더링할 수 있습니다. 페이로드 형식은 [`docs/ROADMAP.md`](./docs/ROADMAP.md) 참고.

Home Assistant를 통해 다음을 사용할 수 있습니다.

- [hass-niimbot](https://github.com/eigger/hass-niimbot) — Niimbot 라벨 인쇄
- [hass-gicisky](https://github.com/eigger/hass-gicisky) — Gicisky 전자 라벨(재고 관리, 유통기한 표기 등)

---

## 프로젝트 구조

```
stash/
  apps/
    api/      # Fastify + Prisma
    web/      # Next.js App Router (PWA, 한/영)
  packages/
    shared/   # 공유 Zod 스키마
  scripts/    # capture-screenshots.mjs
  docker-compose.yml / docker-compose.prod.yml
  Caddyfile
  proxmox/    # LXC 원클릭 설치
```

---

## 로컬 개발

```sh
npm install
cp .env.example .env   # POSTGRES_PASSWORD, JWT_SECRET 설정
docker compose up -d postgres
npm run prisma:migrate
npm run seed -w apps/api   # 선택: 부트스트랩 UI 대신 관리자 시드
npm run dev:api            # :8080
npm run dev:web            # :3000
```

`http://localhost:3000/login` 열기.

유용한 스크립트: `npm run build`, `npm run test`, `npm run prisma:generate`.

---

## 프로덕션 참고

- 스택: PostgreSQL 16 + API + Web + Caddy (`:80`)
- API는 시작 시 `prisma migrate deploy` 실행(프로덕션 compose)
- 이미지: `ghcr.io/<owner>/stash-api` / `stash-web` (`latest` + semver 태그)
- LXC 업데이트: 컨테이너 안에서 `update` (compose 이미지 pull)
- 외부 바코드 조회(Open Food Facts, UPCItemDB)는 선택 — 수동 입력과 자체 발급 QR만으로도 전체 동작
- `APP_PUBLIC_URL`은 자체 발급 QR 라벨에 인코딩되는 딥링크를 결정합니다. 실제 도메인으로 설정해야 아무 카메라 앱으로 스캔해도 앱이 열립니다

---

## CI/CD

| 워크플로 | 트리거 | 목적 |
|---|---|---|
| [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) | `master` 푸시 / PR | 설치, 빌드, 테스트 |
| [`.github/workflows/docker-release.yml`](./.github/workflows/docker-release.yml) | GitHub Release | GHCR로 이미지 푸시 |

---

## 라이선스

MIT. [LICENSE](./LICENSE) 참고.
