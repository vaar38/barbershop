import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { tokens } from "../api/client";
import { mockApi, renderPage } from "../test/utils";
import RequireRole from "./RequireRole";

const me = (role: string) => ({ id: 1, email: "a@fade.ru", full_name: "А", phone: null, created_at: "", role });

describe("RequireRole", () => {
  it("гостю предлагает войти", () => {
    renderPage(<RequireRole roles={["admin"]}>секрет</RequireRole>);
    expect(screen.getByRole("link", { name: "Войдите" })).toBeInTheDocument();
    expect(screen.queryByText("секрет")).not.toBeInTheDocument();
  });

  it("клиента не пускает в раздел администратора", async () => {
    tokens.save("t", "r");
    mockApi({ "GET /users/me": me("client") });
    renderPage(<RequireRole roles={["admin"]}>секрет</RequireRole>);
    expect(await screen.findByText(/недоступен для вашей роли/)).toBeInTheDocument();
  });

  it("администратора пускает", async () => {
    tokens.save("t", "r");
    mockApi({ "GET /users/me": me("admin") });
    renderPage(<RequireRole roles={["admin"]}>секрет</RequireRole>);
    expect(await screen.findByText("секрет")).toBeInTheDocument();
  });
});
