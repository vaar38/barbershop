import type { CSSProperties, ReactNode } from "react";
import { ApiError } from "../api/client";

const styles: Record<string, CSSProperties> = {
  base: { padding: "10px 14px", margin: "0 0 16px", borderLeft: "3px solid", background: "#fffdf8" },
  error: { borderColor: "var(--accent)", color: "var(--accent)" },
  ok: { borderColor: "var(--ok)", color: "var(--ok)" },
  info: { borderColor: "var(--line)", color: "var(--muted)" },
};

export function Notice({ kind = "info", children }: { kind?: "error" | "ok" | "info"; children: ReactNode }) {
  return <div style={{ ...styles.base, ...styles[kind] }}>{children}</div>;
}

// Ошибка запроса: для частых случаев — понятный текст, иначе сообщение сервера
export function ErrorNotice({ error }: { error: Error | null | undefined }) {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 403) {
    return <Notice kind="error">Недостаточно прав для этого раздела.</Notice>;
  }
  if (error instanceof ApiError && error.status === 401) {
    return <Notice kind="error">Нужно войти.</Notice>;
  }
  return <Notice kind="error">{error.message}</Notice>;
}

export function Loading() {
  return <p className="muted">Загрузка…</p>;
}
