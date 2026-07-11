"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiJson, API_URL, getToken } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import { ItemCard } from "../../components/ItemCard";
import type { Item, Location, Category } from "../../lib/types";

const PAGE_SIZE = 30;

export default function ItemsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [importing, setImporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // 응답이 요청 순서와 다르게 도착해도(빠른 타이핑 등) 가장 최근 요청의 결과만 반영한다.
  const requestSeqRef = useRef(0);
  const filterKey = `${q}|${locationId}|${categoryId}|${sort}`;
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiJson<Location[]>("/api/locations").then(setLocations);
    apiJson<Category[]>("/api/categories").then(setCategories);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // 검색/필터/정렬이 바뀌면 1페이지부터 다시 본다. page>1(더 보기)에서 필터를 바꾼
    // 경우, 여기서 바로 fetch하면 새 필터로 옛 페이지 번호를 조회해 엉뚱한 결과를
    // 기존 목록 뒤에 이어붙이게 된다 — 그래서 이번 렌더는 fetch 없이 페이지만 리셋하고,
    // 리렌더된 다음 실행에서 page===1로 정상 조회한다.
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    setBusy(true);
    const seq = ++requestSeqRef.current;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (locationId) params.set("locationId", locationId);
    if (categoryId) params.set("categoryId", categoryId);
    if (sort) params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    apiJson<{ items: Item[]; total: number }>(`/api/items?${params.toString()}`)
      .then(({ items: pageItems, total: newTotal }) => {
        if (seq !== requestSeqRef.current) return; // 더 최근 요청이 이미 나감 — 이 결과는 버린다
        setItems((prev) => (page === 1 ? pageItems : [...prev, ...pageItems]));
        setTotal(newTotal);
      })
      .finally(() => {
        if (seq === requestSeqRef.current) setBusy(false);
      });
  }, [user, filterKey, page, refreshKey]);

  function handleCsvExport() {
    const token = getToken();
    window.location.href = `${API_URL}/api/items/export.csv?token=${token}`;
  }

  async function handleCsvImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/items/import.csv", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("csvImportFailFallback"));
      show(t("csvImportResultToast", { created: body.created, errors: body.errors?.length ?? 0 }), "success");
      setPage(1);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setImporting(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <div className="page-header">
        <h1>{t("itemsTitle")}</h1>
        <a href="/items/new"><button>{t("registerManually")}</button></a>
      </div>

      <div className="form" style={{ marginBottom: 16 }}>
        <input placeholder={t("searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{t("allLocations")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("allCategories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="">{t("sortRecent")}</option>
          <option value="quantityAsc">{t("sortQuantityAsc")}</option>
          <option value="expiryAsc">{t("sortExpiryAsc")}</option>
        </select>
        <button type="button" className="secondary" onClick={handleCsvExport}>
          {t("csvExportButton")}
        </button>
        <label>
          {importing ? t("processingLabel") : t("csvImportButton")}
          <input type="file" accept=".csv,text/csv" onChange={handleCsvImport} disabled={importing} />
        </label>
      </div>

      {busy && items.length === 0 && <p>{t("loading")}</p>}
      {!busy && items.length === 0 && <p className="scan-hint">{t("noItems")}</p>}
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
      {items.length < total && (
        <button className="secondary" disabled={busy} onClick={() => setPage((p) => p + 1)} style={{ width: "100%", marginTop: 8 }}>
          {busy ? t("loading") : t("loadMoreButton")}
        </button>
      )}
    </main>
  );
}
