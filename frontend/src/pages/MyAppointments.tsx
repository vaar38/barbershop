import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { appointmentsApi, type Appointment } from "../api";
import { ApiError } from "../api/client";
import { useAppointments, useBranches, useMasters } from "../api/queries";
import { ErrorNotice, Loading, Notice } from "../components/Notice";
import { day, money, STATUS, time } from "../format";
import s from "./pages.module.css";

const ACTIVE = ["pending", "confirmed"];
const TWO_HOURS = 2 * 60 * 60 * 1000;

export function StatusLabel({ status }: { status: string }) {
  return <span className={`${s.status} ${s["status_" + status] ?? ""}`}>{STATUS[status] ?? status}</span>;
}

function ReviewForm({ appointment, onDone }: { appointment: Appointment; onDone: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  const send = useMutation({
    mutationFn: () => appointmentsApi.review(appointment.id, { rating, text: text || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", appointment.master_id] });
      onDone("Спасибо за отзыв!");
    },
    onError: (e) => {
      // отзыв на эту запись уже оставлен раньше
      if (e instanceof ApiError && e.status === 409) onDone(e.message);
    },
  });

  return (
    <div className={s.reviewBox}>
      <ErrorNotice error={send.error} />
      <div className="row" style={{ marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className="ghost small" onClick={() => setRating(n)} aria-label={`${n} из 5`}>
            <span className={s.stars}>{n <= rating ? "★" : "☆"}</span>
          </button>
        ))}
      </div>
      <textarea rows={2} placeholder="Пару слов о визите" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="small" style={{ marginTop: 8 }} onClick={() => send.mutate()} disabled={send.isPending}>
        Отправить
      </button>
    </div>
  );
}

export default function MyAppointments() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [reviewFor, setReviewFor] = useState<number | null>(null);
  // записи, по которым отзыв уже есть (сервер этого в списке не отдаёт)
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const list = useAppointments();
  const masters = useMasters();
  const branches = useBranches();

  const cancel = useMutation({
    mutationFn: (a: Appointment) => appointmentsApi.cancel(a.id),
    onSuccess: () => {
      setMessage("Запись отменена.");
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const now = Date.now();
  const upcoming = (list.data ?? []).filter((a) => ACTIVE.includes(a.status) && new Date(a.end_at).getTime() > now);
  const past = (list.data ?? []).filter((a) => !upcoming.includes(a)).reverse();
  const shown = tab === "upcoming" ? upcoming : past;

  const masterName = (id: number) => masters.data?.find((m) => m.id === id)?.full_name ?? "мастер";
  const branchName = (id: number) => branches.data?.find((b) => b.id === id)?.name ?? "";

  const askCancel = (a: Appointment) => {
    if (!confirm(`Отменить запись на ${day(a.start_at)}, ${time(a.start_at)}?`)) return;
    setMessage(null);
    cancel.mutate(a);
  };

  return (
    <>
      <h1>Мои записи</h1>

      <div className={s.tabs}>
        <button className={tab === "upcoming" ? s.on : ""} onClick={() => setTab("upcoming")}>
          Предстоящие ({upcoming.length})
        </button>
        <button className={tab === "past" ? s.on : ""} onClick={() => setTab("past")}>
          Прошедшие и отменённые ({past.length})
        </button>
      </div>

      {message && <Notice kind="ok">{message}</Notice>}
      <ErrorNotice error={cancel.error ?? list.error} />
      {list.isPending && <Loading />}
      {list.isSuccess && shown.length === 0 && (
        <p className="muted">
          {tab === "upcoming" ? (
            <>
              Записей нет. <Link to="/book">Записаться</Link>
            </>
          ) : (
            "Пока пусто."
          )}
        </p>
      )}

      {shown.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Мастер</th>
                <th>Стоимость</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const canCancel = ACTIVE.includes(a.status) && new Date(a.start_at).getTime() - now >= TWO_HOURS;
                return (
                  <tr key={a.id}>
                    <td>
                      {day(a.start_at)}
                      <br />
                      <strong>
                        {time(a.start_at)}–{time(a.end_at)}
                      </strong>
                    </td>
                    <td>
                      {masterName(a.master_id)}
                      <div className="muted">{branchName(a.branch_id)}</div>
                      {a.comment && <div className="muted">«{a.comment}»</div>}
                    </td>
                    <td>{money(a.total_price)}</td>
                    <td>
                      <StatusLabel status={a.status} />
                    </td>
                    <td>
                      <div className="row">
                        {canCancel && (
                          <button className="ghost small" onClick={() => askCancel(a)}>
                            Отменить
                          </button>
                        )}
                        {ACTIVE.includes(a.status) && !canCancel && <span className="muted">отмена — не позже чем за 2 ч</span>}
                        {tab === "past" && (
                          <Link to={`/book?master_id=${a.master_id}`}>
                            <button className="ghost small">Повторить</button>
                          </Link>
                        )}
                        {a.status === "completed" && reviewFor !== a.id && !reviewed.includes(a.id) && (
                          <button className="ghost small" onClick={() => setReviewFor(a.id)}>
                            Оставить отзыв
                          </button>
                        )}
                      </div>
                      {reviewFor === a.id && (
                        <ReviewForm
                          appointment={a}
                          onDone={(text) => {
                            setReviewFor(null);
                            setReviewed([...reviewed, a.id]);
                            setMessage(text);
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
