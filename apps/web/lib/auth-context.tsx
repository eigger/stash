"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken, clearToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const CACHED_USER_KEY = "stash_cached_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch("/api/auth/me");
      if (res.status === 401) {
        clearToken();
        localStorage.removeItem(CACHED_USER_KEY);
        setUser(null);
        setLoading(false);
        return;
      }
      const me = await res.json();
      setUser(me);
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(me));
    } catch {
      // 오프라인 등 네트워크 실패 — 토큰을 무효라고 단정하지 않고, 마지막으로 확인된
      // 사용자 정보로 폴백한다. 그래야 오프라인에서 로딩 화면에 갇히지 않고 캐시된
      // 앱 셸이 그대로 열린다. 다시 온라인이 되면 다음 마운트/새로고침 때 재검증된다.
      const cached = localStorage.getItem(CACHED_USER_KEY);
      setUser(cached ? JSON.parse(cached) : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(token: string) {
    setToken(token);
    setLoading(true);
    await fetchMe();
  }

  function logout() {
    clearToken();
    localStorage.removeItem(CACHED_USER_KEY);
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin: user?.role === "ADMIN", login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
