import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { appointmentsApi, type Appointment, type Status } from "../api";
import { useAppointments } from "../api/queries";
import { ErrorNotice, Loading } from "../components/Notice";
import { addDays, day, money, time, today } from "../format";
import { StatusLabel } from "./MyAppointments";
import s from "./pages.module.css";

// Кабинет мастера: записи к нему на день или неделю и смена статуса
export default function Schedule() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(today());
  const [week, setWeek] = useState(false);

  const to = week ? addDays(from, 6) : from;
  const list = useAppointments({ date_from: from, date_to: to });

  const change = useMutation({
    mutationFn: ({ a, status }: { a: Appointment; status: Status }) => appointmentsApi.setStatus(a.id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments"] }),
  });
  const setStatus = (a: Appointment, status: Status) => change.mutate({ a, status });
  // итог визита можно отметить только после начала записи (правило сервера)
  const started = (a: Appointment) => new Date(a.start_at).getTime() <= Date.now();

  // группируем по дням
  const byDay = new Map<string, Appointment[]>();
  for (const a of list.data ?? []) {
    const key = day(a.start_at);
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }

  return (
    <>
      <h1>Расписание</h1>

      <div className={s.filters}>
        <div className="row">
          <button className="ghost small" onClick={() => setFrom(addDays(from, week ? -7 : -1))}>
            ←
          </button>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} style={{ width: "auto" }} />
          <button className="ghost small" onClick={() => setFrom(addDays(from, week ? 7 : 1))}>
            →
          </button>
          <button className="ghost small" onClick={() => setFrom(today())}>
            сегодня
          </button>
        </div>
        <div className="row">
          <button className={week ? "ghost small" : "small"} onClick={() => setWeek(false)}>
            день
          </button>
          <button className={week ? "small" : "ghost small"} onClick={() => setWeek(true)}>
            неделя
          </button>
        </div>
      </div>

      <ErrorNotice error={change.error ?? list.error} />
      {list.isPending && <Loading />}
      {list.isSuccess && byDay.size === 0 && <p className="muted">Записей нет.</p>}

      {[...byDay.entries()].map(([d, items]) => (
        <section key={d} className={s.section}>
          <h2>{d}</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td style={{ width: 120 }}>
                      <strong>
                        {time(a.start_at)}–{time(a.end_at)}
                      </strong>
                    </td>
                    <td>
                      Запись №{a.id}
                      {a.comment && <div className="muted">«{a.comment}»</div>}
                    </td>
                    <td>{money(a.total_price)}</td>
                    <td>
                      <StatusLabel status={a.status} />
                    </td>
                    <td>
                      <div className="row">
                        {a.status === "pending" && (
                          <button className="small" onClick={() => setStatus(a, "confirmed")}>
                            Подтвердить
                          </button>
                        )}
                        {a.status === "confirmed" && !started(a) && <span className="muted">итог — после начала</span>}
                        {a.status === "confirmed" && started(a) && (
                          <>
                            <button className="small" onClick={() => setStatus(a, "completed")}>
                              Состоялась
                            </button>
                            <button className="ghost small" onClick={() => setStatus(a, "no_show")}>
                              Не пришёл
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
