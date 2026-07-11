"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { useLocale } from "../../lib/i18n/locale-context";
import type { User } from "../../lib/types";

export default function UsersPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const { show } = useToast();
  const { t } = useLocale();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "GENERAL">("GENERAL");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    else if (!loading && user && !isAdmin) router.push("/");
  }, [loading, user, isAdmin, router]);

  async function refresh() {
    setUsers(await apiJson<User[]>("/api/auth/users"));
  }

  useEffect(() => {
    if (isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiJson("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("GENERAL");
      await refresh();
      show(t("accountCreatedToast"), "success");
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDeleteAccount"))) return;
    try {
      await apiJson(`/api/auth/users/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <main className="container">
      <h1>{t("usersTitle")}</h1>
      <form onSubmit={handleSubmit} className="form" style={{ marginBottom: 16 }}>
        <input placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder={t("passwordMinPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "GENERAL")}>
          <option value="GENERAL">{t("roleGeneral")}</option>
          <option value="ADMIN">{t("roleAdmin")}</option>
        </select>
        <button type="submit">{t("createAccountButton")}</button>
      </form>

      {users.map((u) => (
        <div key={u.id} className="tree-row">
          <div>
            {u.name} ({u.email}) <span className="badge badge-muted">{u.role === "ADMIN" ? t("roleAdmin") : t("roleGeneral")}</span>
          </div>
          {u.id !== user.id && (
            <button className="secondary" onClick={() => handleDelete(u.id)}>
              {t("delete")}
            </button>
          )}
        </div>
      ))}
    </main>
  );
}
