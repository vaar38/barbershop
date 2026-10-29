import { describe, expect, it } from "vitest";
import { addDays, minutes, money, time } from "./format";

describe("format", () => {
  it("показывает время по Москве, где бы ни был браузер", () => {
    expect(time("2026-11-02T07:00:00Z")).toBe("10:00");
  });

  it("сдвигает дату через границу месяца", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("пишет длительность по-человечески", () => {
    expect(minutes(45)).toBe("45 мин");
    expect(minutes(60)).toBe("1 ч");
    expect(minutes(75)).toBe("1 ч 15 мин");
  });

  it("округляет деньги до рублей", () => {
    expect(money("1350.00").replace(/\s/g, " ")).toBe("1 350 ₽");
  });
});
