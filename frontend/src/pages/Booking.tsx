import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { appointmentsApi, catalogApi } from "../api";
import { ApiError } from "../api/client";
import { useBranches, useServices, useSlots } from "../api/queries";
import { useAuth } from "../auth";
import { ErrorNotice, Loading, Notice } from "../components/Notice";
import { addDays, day, LEVEL, LEVEL_FACTOR, minutes, money, time, today } from "../format";
import s from "./pages.module.css";

const DAYS_AHEAD = 14;

export default function Booking() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { loggedIn, role } = useAuth();
  const queryClient = useQueryClient();

  const [branchId, setBranchId] = useState<number | null>(null);
  const [serviceIds, setServiceIds] = useState<number[]>(() => {
    const one = params.get("service_id");
    return one ? [Number(one)] : [];
  });
  const [masterId, setMasterId] = useState<number | null>(params.get("master_id") ? Number(params.get("master_id")) : null);
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const branches = useBranches();
  const services = useServices({ branch_id: branchId ?? undefined }, branchId !== null);

  // Пришли со страницы мастера — сразу подставляем его филиал
  const fromUrl = useQuery({
    queryKey: ["masters", "one", masterId],
    queryFn: () => catalogApi.master(masterId!),
    enabled: masterId !== null && branchId === null,
  });
  useEffect(() => {
    if (fromUrl.data && branchId === null) setBranchId(fromUrl.data.branch_id);
  }, [fromUrl.data, branchId]);

  // Мастера, которые делают ВСЕ выбранные услуги: пересечение списков по каждой услуге
  const masters = useQuery({
    queryKey: ["masters", "all-of", branchId, serviceIds],
    queryFn: async () => {
      const lists = await Promise.all(serviceIds.map((id) => catalogApi.masters({ branch_id: branchId!, service_id: id })));
      return lists.reduce((acc, list) => acc.filter((m) => list.some((x) => x.id === m.id)));
    },
    enabled: branchId !== null && serviceIds.length > 0,
  });

  // Выбранный мастер учитывается, только если он делает все выбранные услуги
  const master = masters.data?.find((m) => m.id === masterId) ?? null;

  const slots = useSlots(master?.id ?? null, date, serviceIds);

  const book = useMutation({
    mutationFn: () =>
      appointmentsApi.create({ master_id: master!.id, service_ids: serviceIds, start_at: slot!, comment: comment || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["slots"] });
    },
    onError: (e) => {
      // время успели занять — показываем свежие слоты
      if (e instanceof ApiError && e.status === 409) {
        setSlot(null);
        queryClient.invalidateQueries({ queryKey: ["slots"] });
      }
    },
  });
  const done = book.data;

  const chosen = useMemo(() => services.data?.filter((sv) => serviceIds.includes(sv.id)) ?? [], [services.data, serviceIds]);
  const branch = branches.data?.find((b) => b.id === branchId) ?? null;

  const totalMin = chosen.reduce((sum, sv) => sum + sv.duration_min, 0);
  const totalPrice = chosen.reduce((sum, sv) => sum + Number(sv.base_price), 0) * (master ? LEVEL_FACTOR[master.level] : 1);

  // сменили мастера, день или услуги — выбранное время больше не подходит
  const slotContext = `${master?.id}|${date}|${serviceIds.join(",")}`;
  useEffect(() => setSlot(null), [slotContext]);

  const toggleService = (id: number) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const pickBranch = (id: number) => {
    setBranchId(id);
    setServiceIds([]);
    setMasterId(null);
  };

  if (done) {
    return (
      <>
        <h1>Вы записаны</h1>
        <div className={s.summary}>
          <dl>
            <dt>Когда</dt>
            <dd>
              {day(done.start_at)}, {time(done.start_at)}–{time(done.end_at)}
            </dd>
            <dt>Мастер</dt>
            <dd>{master?.full_name}</dd>
            <dt>Филиал</dt>
            <dd>
              {branch?.name}, {branch?.address}
            </dd>
            <dt>Стоимость</dt>
            <dd>{money(done.total_price)}</dd>
          </dl>
          <p className="muted">Мастер подтвердит запись. Отменить можно не позже чем за 2 часа до начала.</p>
          <Link to="/my">Мои записи →</Link>
        </div>
      </>
    );
  }

  const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today(), i));

  return (
    <>
      <h1>Запись</h1>

      <div className={`${s.step} ${branchId ? s.stepDone : ""}`}>
        <div className={s.stepNo}>01</div>
        <div>
          <h3>Филиал</h3>
          <ErrorNotice error={branches.error} />
          <div className={s.choices}>
            {branches.data?.map((b) => (
              <button key={b.id} className={`${s.choice} ${b.id === branchId ? s.picked : ""}`} onClick={() => pickBranch(b.id)}>
                {b.name}
                <br />
                <small>{b.address}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`${s.step} ${serviceIds.length ? s.stepDone : ""}`}>
        <div className={s.stepNo}>02</div>
        <div>
          <h3>Услуги</h3>
          {!branchId && <p className="muted">Сначала выберите филиал.</p>}
          {services.isPending && branchId !== null && <Loading />}
          {services.data && branchId && services.data.length === 0 && <p className="muted">В филиале пока нет услуг.</p>}
          <div className={s.choices}>
            {services.data?.map((sv) => (
              <button
                key={sv.id}
                className={`${s.choice} ${serviceIds.includes(sv.id) ? s.picked : ""}`}
                onClick={() => toggleService(sv.id)}
              >
                {sv.name}
                <br />
                <small>
                  {minutes(sv.duration_min)} · от {money(sv.base_price)}
                </small>
              </button>
            ))}
          </div>
          {serviceIds.length > 1 && (
            <p className="muted" style={{ marginTop: 8 }}>
              Можно выбрать несколько — пойдут подряд.
            </p>
          )}
        </div>
      </div>

      <div className={`${s.step} ${master ? s.stepDone : ""}`}>
        <div className={s.stepNo}>03</div>
        <div>
          <h3>Мастер</h3>
          {serviceIds.length === 0 && <p className="muted">Выберите хотя бы одну услугу.</p>}
          <ErrorNotice error={masters.error} />
          {masters.data && serviceIds.length > 0 && masters.data.length === 0 && (
            <p className="muted">Нет мастера, который делает все выбранные услуги. Уберите одну из них.</p>
          )}
          <div className={s.choices}>
            {masters.data?.map((m) => (
              <button key={m.id} className={`${s.choice} ${m.id === masterId ? s.picked : ""}`} onClick={() => setMasterId(m.id)}>
                {m.full_name}
                <br />
                <small>{LEVEL[m.level]}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`${s.step} ${slot ? s.stepDone : ""}`}>
        <div className={s.stepNo}>04</div>
        <div>
          <h3>День и время</h3>
          {!master ? (
            <p className="muted">Выберите мастера.</p>
          ) : (
            <>
              <div className={s.choices} style={{ marginBottom: 14 }}>
                {dates.map((d) => (
                  <button key={d} className={`${s.choice} small ${d === date ? s.picked : ""}`} onClick={() => setDate(d)}>
                    {day(d + "T12:00:00+03:00")}
                  </button>
                ))}
              </div>
              <ErrorNotice error={slots.error} />
              {!slot && <ErrorNotice error={book.error} />}
              {slots.isPending && <Loading />}
              {slots.data && slots.data.length === 0 && (
                <p className="muted">В этот день свободного времени нет — попробуйте другой.</p>
              )}
              <div className={s.slots}>
                {slots.data?.map((iso) => (
                  <button
                    key={iso}
                    className={`${s.choice} small ${iso === slot ? s.picked : ""}`}
                    onClick={() => {
                      setSlot(iso);
                      book.reset();
                    }}
                  >
                    {time(iso)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {slot && master && (
        <div style={{ marginTop: 24 }} className={s.summary}>
          <h3>Проверьте</h3>
          <dl>
            <dt>Когда</dt>
            <dd>
              {day(slot)}, {time(slot)}, {minutes(totalMin)}
            </dd>
            <dt>Мастер</dt>
            <dd>
              {master.full_name}, {LEVEL[master.level]}
            </dd>
            <dt>Услуги</dt>
            <dd>{chosen.map((sv) => sv.name).join(", ")}</dd>
            <dt>Стоимость</dt>
            <dd>{money(totalPrice)}</dd>
          </dl>
          <label>
            <span>Комментарий мастеру (необязательно)</span>
            <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <ErrorNotice error={book.error} />
          {loggedIn && role === "client" && (
            <button onClick={() => book.mutate()} disabled={book.isPending}>
              {book.isPending ? "Записываем…" : "Записаться"}
            </button>
          )}
          {loggedIn && role !== "client" && <Notice>Записываться онлайн могут только клиенты.</Notice>}
          {!loggedIn && (
            <Notice>
              Чтобы записаться, <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>войдите</Link>{" "}
              или <Link to="/register">зарегистрируйтесь</Link>.
            </Notice>
          )}
        </div>
      )}
    </>
  );
}
