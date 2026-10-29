import { describe, expect, it } from "vitest";
import { fail, mockApi } from "../test/utils";
import { api, ApiError, buildUrl, errorText, tokens } from "./client";

describe("buildUrl", () => {
  it("повторяет параметр-список и пропускает пустые", () => {
    expect(buildUrl("/masters/1/slots", { date: "2026-11-02", service_ids: [1, 3], branch_id: undefined })).toBe(
      "/api/masters/1/slots?date=2026-11-02&service_ids=1&service_ids=3",
    );
  });
});

describe("errorText", () => {
  it("берёт detail-строку", () => {
    expect(errorText({ detail: "Время уже занято" }, 409)).toBe("Время уже занято");
  });

  it("склеивает ошибки валидации", () => {
    expect(errorText({ detail: [{ msg: "a" }, { msg: "b" }] }, 422)).toBe("a; b");
  });
});

describe("api", () => {
  it("при 401 обновляет токены и повторяет запрос", async () => {
    tokens.save("old", "refresh-1");
    let first = true;
    const calls = mockApi({
      "GET /users/me": () => {
        if (first) {
          first = false;
          return new Response(JSON.stringify({ detail: "Токен истёк" }), { status: 401 });
        }
        return new Response(JSON.stringify({ id: 1 }), { status: 200 });
      },
      "POST /auth/refresh": { access_token: "new", refresh_token: "refresh-2" },
    });

    await expect(api("/users/me")).resolves.toEqual({ id: 1 });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /users/me", "POST /auth/refresh", "GET /users/me"]);
    expect(tokens.access).toBe("new");
    expect(tokens.refresh).toBe("refresh-2");
  });

  it("бросает ApiError с текстом сервера", async () => {
    mockApi({ "POST /appointments": fail(409, "Время уже занято") });
    const error = await api<never>("/appointments", { method: "POST", body: {} }).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe("Время уже занято");
  });
});
