import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi, type Me, type Role } from "./api";
import { ApiError, tokens } from "./api/client";
import { keys } from "./api/queries";

type AuthState = {
  user: Me | null;
  role: Role | null;
  loggedIn: boolean;
  // профиль ещё загружается — роль пока неизвестна
  checking: boolean;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [loggedIn, setLoggedIn] = useState(Boolean(tokens.access));

  // Профиль с ролью берём из /users/me — по роли решаем, какие разделы показывать
  const me = useQuery({ queryKey: keys.me, queryFn: authApi.me, enabled: loggedIn, staleTime: Infinity });

  // Токены отозваны или истекли и обновить их не вышло — считаем, что вышли
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      tokens.clear();
      setLoggedIn(false);
    }
  }, [me.error]);

  const login = async (email: string, password: string) => {
    const t = await authApi.login({ email, password });
    tokens.save(t.access_token, t.refresh_token);
    const user = await queryClient.fetchQuery({ queryKey: keys.me, queryFn: authApi.me });
    setLoggedIn(true);
    return user;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // токен уже мог истечь — всё равно выходим
    }
    tokens.clear();
    setLoggedIn(false);
    // данные прошлого пользователя (его записи и т. п.) не должны остаться в кеше
    queryClient.clear();
  };

  const user = loggedIn ? (me.data ?? null) : null;
  const value: AuthState = {
    user,
    role: user?.role ?? null,
    loggedIn,
    checking: loggedIn && me.isPending,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вне AuthProvider");
  return ctx;
}

// Куда вести пользователя после входа
export const homeFor = (role: Role) => ({ client: "/my", master: "/schedule", admin: "/admin" })[role];
