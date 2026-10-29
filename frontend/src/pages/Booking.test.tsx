import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { tokens } from "../api/client";
import { fail, mockApi, renderPage } from "../test/utils";
import Booking from "./Booking";

const routes = {
  "GET /users/me": { id: 7, email: "c@fade.ru", full_name: "Клиент", phone: null, created_at: "", role: "client" },
  "GET /branches": [{ id: 1, name: "Fade на Арбате", address: "Арбат, 1", phone: null }],
  "GET /services": [
    { id: 1, category_id: 1, name: "Мужская стрижка", description: null, duration_min: 45, base_price: "1500.00" },
    { id: 2, category_id: 2, name: "Оформление бороды", description: null, duration_min: 30, base_price: "900.00" },
  ],
  "GET /masters/3/slots": ["2030-01-10T10:00:00+03:00", "2030-01-10T10:15:00+03:00"],
  "GET /masters/3": { id: 3, full_name: "Иван Петров", branch_id: 1, level: "top", bio: null, photo_url: null },
  "GET /masters": [{ id: 3, full_name: "Иван Петров", branch_id: 1, level: "top", bio: null, photo_url: null }],
  "POST /appointments": {
    id: 50,
    master_id: 3,
    branch_id: 1,
    start_at: "2030-01-10T10:15:00+03:00",
    end_at: "2030-01-10T11:30:00+03:00",
    status: "pending",
    total_price: "3600.00",
    comment: null,
  },
};

describe("Запись", () => {
  it("проводит по шагам, считает цену с уровнем мастера и отправляет только start_at", async () => {
    tokens.save("t", "r");
    const calls = mockApi(routes);
    const user = userEvent.setup();
    renderPage(<Booking />, "/book");

    await user.click(await screen.findByRole("button", { name: /Fade на Арбате/ }));
    await user.click(await screen.findByRole("button", { name: /Мужская стрижка/ }));
    await user.click(screen.getByRole("button", { name: /Оформление бороды/ }));
    await user.click(await screen.findByRole("button", { name: /Иван Петров/ }));
    await user.click(await screen.findByRole("button", { name: "10:15" }));

    // (1500 + 900) × 1.5 у топ-мастера, 45 + 30 минут
    const summary = screen.getByRole("heading", { name: "Проверьте" }).parentElement!;
    expect(within(summary).getByText(/1 ч 15 мин/)).toBeInTheDocument();
    expect(within(summary).getByText(/3\s600 ₽/)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Записаться" }));
    expect(await screen.findByRole("heading", { name: "Вы записаны" })).toBeInTheDocument();

    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ master_id: 3, service_ids: [1, 2], start_at: "2030-01-10T10:15:00+03:00", comment: null });
  });

  it("если время заняли — показывает ошибку и просит выбрать другое", async () => {
    tokens.save("t", "r");
    mockApi({ ...routes, "POST /appointments": fail(409, "Время уже занято") });
    const user = userEvent.setup();
    renderPage(<Booking />, "/book?master_id=3&service_id=1");

    await user.click(await screen.findByRole("button", { name: "10:00" }));
    await user.click(await screen.findByRole("button", { name: "Записаться" }));

    expect(await screen.findByText("Время уже занято")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Проверьте" })).not.toBeInTheDocument();
  });

  it("гостю вместо кнопки предлагает войти", async () => {
    mockApi(routes);
    const user = userEvent.setup();
    renderPage(<Booking />, "/book?master_id=3&service_id=1");

    await user.click(await screen.findByRole("button", { name: "10:00" }));
    expect(screen.getByRole("link", { name: "войдите" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Записаться" })).not.toBeInTheDocument();
  });
});
