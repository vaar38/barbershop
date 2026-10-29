// Форматирование дат, денег и подписей. Все филиалы в одном часовом поясе (см. readme)

export const TIME_ZONE = "Europe/Moscow";

const timeFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: TIME_ZONE, day: "numeric", month: "long", weekday: "short" });
const isoDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export const time = (iso: string) => timeFmt.format(new Date(iso));
export const day = (iso: string) => dayFmt.format(new Date(iso));

// Дата в формате YYYY-MM-DD в поясе сети
export const isoDay = (d: Date) => isoDayFmt.format(d);
export const today = () => isoDay(new Date());
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const money = (value: string | number) => Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽";

export const minutes = (n: number) => {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
};

export const LEVEL: Record<string, string> = { junior: "мастер", middle: "старший мастер", top: "топ-мастер" };
export const LEVEL_FACTOR: Record<string, number> = { junior: 1, middle: 1.2, top: 1.5 };

export const STATUS: Record<string, string> = {
  pending: "ждёт подтверждения",
  confirmed: "подтверждена",
  completed: "состоялась",
  cancelled: "отменена",
  no_show: "клиент не пришёл",
};
