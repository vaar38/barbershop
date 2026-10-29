import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "../auth";

type Handler = unknown | Response | (() => Response);

// Подменяет fetch. Ключ — «МЕТОД /путь»; совпадает и путь с параметрами (?date=…).
// Значение — тело ответа 200, готовый Response или функция, возвращающая Response
export function mockApi(routes: Record<string, Handler>) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = url.replace(/^\/api/, "");
      calls.push({ method, url: path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const key = Object.keys(routes).find((k) => {
        const [m, p] = k.split(" ");
        return m === method && (path === p || path.startsWith(p + "?"));
      });
      if (!key) return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 });
      const value = routes[key];
      if (typeof value === "function") return value();
      if (value instanceof Response) return value;
      return new Response(JSON.stringify(value), { status: 200 });
    }),
  );
  return calls;
}

export const fail = (status: number, detail: string) => () => new Response(JSON.stringify({ detail }), { status });

// Страница со всеми провайдерами, как в main.tsx, но с отдельным кешем на каждый тест
export function renderPage(ui: ReactNode, url = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {ui}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
