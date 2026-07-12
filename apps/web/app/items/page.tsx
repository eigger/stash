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
const FILTERS_KEY = "stash_items_filters";
const NONE_VALUE = "__none__";

interface StoredFilters {
  q: string;
  locationId: string;
  categoryId: string;
  sort: string;
}

// 검색/필터/정렬을 localStorage에 기억해뒀다가, 목록에 다시 들어왔을 때 그대로 복원한다 —
// 안 그러면 필터를 걸고 다른 화면에 갔다올 때마다 매번 다시 설정해야 한다.
function loadStoredFilters(): StoredFilters {
  const empty: StoredFilters = { q: "", locationId: "", categoryId: "", sort: "" };
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return {
      q: typeof parsed.q === "string" ? parsed.q : "",
      locationId: typeof parsed.locationId === "string" ? parsed.locationId : "",
      categoryId: typeof parsed.categoryId === "string" ? parsed.categoryId : "",
      sort: typeof parsed.sort === "string" ? parsed.sort : "",
    };
  } catch {
    return empty;
  }
}

export default function ItemsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [initialFilters] = useState(loadStoredFilters);
  const [q, setQ] = useState(initialFilters.q);
  const [locationId, setLocationId] = useState(initialFilters.locationId);
  const [categoryId, setCategoryId] = useState(initialFilters.categoryId);
  const [sort, setSort] = useState(initialFilters.sort);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [importing, setImporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLocationId, setBulkLocationId] = useState("");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
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
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ q, locationId, categoryId, sort }));
  }, [q, locationId, categoryId, sort]);

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
  }, [user, filterKey, page, refreshKey, q, locationId, categoryId, sort]);

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

  function toggleSelectMode() {
    setSelectMode((prev) => !prev);
    setSelected(new Set());
    setBulkLocationId("");
    setBulkCategoryId("");
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  }

  async function handleBulkApply() {
    if (selected.size === 0 || (!bulkLocationId && !bulkCategoryId)) return;
    setBulkBusy(true);
    try {
      const payload: { itemIds: string[]; locationId?: string | null; categoryId?: string | null } = {
        itemIds: Array.from(selected),
      };
      if (bulkLocationId) payload.locationId = bulkLocationId === NONE_VALUE ? null : bulkLocationId;
      if (bulkCategoryId) payload.categoryId = bulkCategoryId === NONE_VALUE ? null : bulkCategoryId;
      const result = await apiJson<{ updated: number }>("/api/items/bulk", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      show(t("bulkUpdateSuccessToast", { n: result.updated }), "success");
      setBulkLocationId("");
      setBulkCategoryId("");
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      show(t("bulkActionFailToast", { msg: err.message }), "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(t("confirmBulkDeleteItems", { n: selected.size }))) return;
    setBulkBusy(true);
    try {
      const result = await apiJson<{ deleted: number }>("/api/items/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ itemIds: Array.from(selected) }),
      });
      show(t("bulkDeleteSuccessToast", { n: result.deleted }), "success");
      setSelected(new Set());
      setSelectMode(false);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      show(t("bulkActionFailToast", { msg: err.message }), "error");
    } finally {
      setBulkBusy(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="container">
      <div className="page-header">
        <h1>{t("itemsTitle")}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="secondary" onClick={toggleSelectMode}>
            {selectMode ? t("exitSelectionButton") : t("selectItemsButton")}
          </button>
          <a href="/items/new"><button>{t("registerManually")}</button></a>
        </div>
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

      {selectMode && (
        <div className="card" style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{t("itemsSelectedLabel", { n: selected.size })}</strong>
            <button type="button" className="secondary" onClick={toggleSelectAll}>
              {selected.size === items.length && items.length > 0 ? t("deselectAll") : t("selectAll")}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={bulkLocationId} onChange={(e) => setBulkLocationId(e.target.value)}>
              <option value="">{t("bulkMoveLocationNoChange")}</option>
              <option value={NONE_VALUE}>{t("bulkClearLocationOption")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
              <option value="">{t("bulkMoveCategoryNoChange")}</option>
              <option value={NONE_VALUE}>{t("bulkClearCategoryOption")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={selected.size === 0 || bulkBusy || (!bulkLocationId && !bulkCategoryId)}
              onClick={handleBulkApply}
              style={{ flex: 1 }}
            >
              {t("bulkApplyButton")}
            </button>
            <button
              type="button"
              className="danger"
              disabled={selected.size === 0 || bulkBusy}
              onClick={handleBulkDelete}
              style={{ flex: 1 }}
            >
              {t("bulkDeleteButton")}
            </button>
          </div>
        </div>
      )}

      {busy && items.length === 0 && <p>{t("loading")}</p>}
      {!busy && items.length === 0 && <p className="scan-hint">{t("noItems")}</p>}
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          selectable={selectMode}
          selected={selected.has(item.id)}
          onToggleSelect={() => toggleSelect(item.id)}
        />
      ))}
      {items.length < total && (
        <button className="secondary" disabled={busy} onClick={() => setPage((p) => p + 1)} style={{ width: "100%", marginTop: 8 }}>
          {busy ? t("loading") : t("loadMoreButton")}
        </button>
      )}
    </main>
  );
}
