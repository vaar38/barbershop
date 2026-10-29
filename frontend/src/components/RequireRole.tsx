import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Role } from "../api";
import { useAuth } from "../auth";
import { Loading, Notice } from "./Notice";

// Пускает на страницу только нужные роли. Сервер всё равно проверяет права сам,
// а здесь мы просто не показываем раздел, который вернёт 403
export default function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { loggedIn, checking, role } = useAuth();
  const location = useLocation();

  if (!loggedIn) {
    return (
      <Notice>
        <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Войдите</Link>, чтобы открыть этот
        раздел.
      </Notice>
    );
  }
  if (checking) return <Loading />;
  if (!role || !roles.includes(role)) return <Notice kind="error">Этот раздел недоступен для вашей роли.</Notice>;
  return <>{children}</>;
}
