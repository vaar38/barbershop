import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { adminApi, appointmentsApi, type Appointment, type Level, type Master, type Status } from "../api";
import {
  useAppointments,
  useBranches,
  useCategories,
  useMasterServices,
  useMasters,
  useServices,
  useShifts,
  useStats,
} from "../api/queries";
import { ErrorNotice, Loading } from "../components/Notice";
import { addDays, day, LEVEL, minutes, money, STATUS, time, today } from "../format";
import { StatusLabel } from "./MyAppointments";
import s from "./pages.module.css";

type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "textarea";
  options?: { value: string | number; label: string }[];
};

type Row = { id: number } & Record<string, unknown>;

// Список справочника для таблицы админки
const adminLoad = (path: string) => () => adminApi.list<Row>(path);

// Один справочник: форма добавления/редактирования + таблица.
// После любого изменения сбрасываем кеш раздела — список и каталог на сайте обновятся сами
function Crud({
  name,
  path,
  load,
  fields,
  columns,
  removeLabel = "Удалить",
}: {
  name: string;
  path: string;
  load: () => Promise<Row[]>;
  fields: Field[];
  columns: { label: string; render: (r: Row) => ReactNode }[];
  removeLabel?: string;
}) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: [name, "admin"], queryFn: load });
  const empty = Object.fromEntries(fields.map((f) => [f.key, ""])) as Record<string, string>;
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);

  const body = () =>
    Object.fromEntries(
      fields.map((f) => {
        const v = form[f.key].trim();
        if (v === "") return [f.key, null];
        return [f.key, f.type === "number" || (f.type === "select" && /^\d+$/.test(v)) ? Number(v) : v];
      }),
    );

  const refresh = () => queryClient.invalidateQueries({ queryKey: [name] });

  const save = useMutation({
    mutationFn: () => (editId ? adminApi.update(path, editId, body()) : adminApi.create(path, body())),
    onSuccess: () => {
      setForm(empty);
      setEditId(null);
      refresh();
    },
  });

  const remove = useMutation({ mutationFn: (id: number) => adminApi.remove(path, id), onSuccess: refresh });

  const edit = (r: Row) => {
    save.reset();
    setEditId(r.id);
    setForm(Object.fromEntries(fields.map((f) => [f.key, r[f.key] == null ? "" : String(r[f.key])])));
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(empty);
  };

  return (
    <>
      <ErrorNotice error={save.error ?? remove.error ?? list.error} />
      <div className={s.inlineForm}>
        {fields.map((f) => (
          <label key={f.key}>
            <span>{f.label}</span>
            {f.type === "select" ? (
              <select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <button onClick={() => save.mutate()} disabled={save.isPending}>
          {editId ? "Сохранить" : "Добавить"}
        </button>
        {editId && (
          <button className="ghost" onClick={cancelEdit}>
            Отмена
          </button>
        )}
      </div>

      {list.isPending && <Loading />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((r) => (
              <tr key={r.id} className={r.id === editId ? s.editing : undefined}>
                {columns.map((c) => (
                  <td key={c.label}>{c.render(r)}</td>
                ))}
                <td>
                  <div className="row">
                    <button className="ghost small" onClick={() => edit(r)}>
                      Изменить
                    </button>
                    <button
                      className="ghost small"
                      onClick={() => confirm(`${removeLabel}: «${String(r.name)}»?`) && remove.mutate(r.id)}
                    >
                      {removeLabel}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Мастера: своя форма, потому что при создании нужны логин и пароль, а ещё список услуг ---

type MasterFields = { full_name: string; email: string; password: string; branch_id: string; level: Level | ""; bio: string };
const emptyMaster: MasterFields = { full_name: "", email: "", password: "", branch_id: "", level: "", bio: "" };

function MastersAdmin() {
  const queryClient = useQueryClient();
  const masters = useMasters();
  const branches = useBranches();
  const services = useServices();
  const servicesOf = useMasterServices(services.data);

  const [form, setForm] = useState(emptyMaster);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [editId, setEditId] = useState<number | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["masters"] });
    queryClient.invalidateQueries({ queryKey: ["services"] });
    queryClient.invalidateQueries({ queryKey: ["slots"] });
  };

  const reset = () => {
    setForm(emptyMaster);
    setServiceIds([]);
    setEditId(null);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        full_name: form.full_name.trim(),
        branch_id: Number(form.branch_id),
        level: form.level as Level,
        bio: form.bio.trim() || null,
        service_ids: serviceIds,
      };
      return editId
        ? adminApi.updateMaster(editId, body)
        : adminApi.createMaster({ ...body, email: form.email.trim(), password: form.password });
    },
    onSuccess: () => {
      reset();
      refresh();
    },
  });

  const remove = useMutation({ mutationFn: (id: number) => adminApi.remove("/masters", id), onSuccess: refresh });

  const edit = (m: Master) => {
    save.reset();
    setEditId(m.id);
    setForm({ ...emptyMaster, full_name: m.full_name, branch_id: String(m.branch_id), level: m.level, bio: m.bio ?? "" });
    setServiceIds(servicesOf[m.id] ?? []);
  };

  const toggle = (id: number) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const set = (key: keyof MasterFields) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const serviceName = (id: number) => services.data?.find((sv) => sv.id === id)?.name ?? "";

  return (
    <>
      <ErrorNotice error={save.error ?? remove.error ?? masters.error} />
      <h3>{editId ? `Изменить: ${form.full_name}` : "Новый мастер"}</h3>
      <div className={s.inlineForm}>
        <label>
          <span>Имя и фамилия</span>
          <input value={form.full_name} onChange={set("full_name")} />
        </label>
        {!editId && (
          <>
            <label>
              <span>Email для входа</span>
              <input type="email" value={form.email} onChange={set("email")} />
            </label>
            <label>
              <span>Пароль (от 8 символов)</span>
              <input type="text" value={form.password} onChange={set("password")} />
            </label>
          </>
        )}
        <label>
          <span>Филиал</span>
          <select value={form.branch_id} onChange={set("branch_id")}>
            <option value="">—</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Уровень</span>
          <select value={form.level} onChange={set("level")}>
            <option value="">—</option>
            {Object.entries(LEVEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span>О мастере</span>
        <textarea rows={2} value={form.bio} onChange={set("bio")} />
      </label>
      <fieldset className={s.checks}>
        <legend>Услуги мастера</legend>
        {services.data?.map((sv) => (
          <label key={sv.id}>
            <input type="checkbox" checked={serviceIds.includes(sv.id)} onChange={() => toggle(sv.id)} />
            {sv.name}
          </label>
        ))}
      </fieldset>
      <div className="row" style={{ marginBottom: 20 }}>
        <button onClick={() => save.mutate()} disabled={save.isPending}>
          {editId ? "Сохранить" : "Добавить мастера"}
        </button>
        {editId && (
          <button className="ghost" onClick={reset}>
            Отмена
          </button>
        )}
      </div>

      {masters.isPending && <Loading />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Филиал</th>
              <th>Уровень</th>
              <th>Услуги</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {masters.data?.map((m) => (
              <tr key={m.id} className={m.id === editId ? s.editing : undefined}>
                <td>{m.full_name}</td>
                <td>{branches.data?.find((b) => b.id === m.branch_id)?.name ?? ""}</td>
                <td>{LEVEL[m.level]}</td>
                <td className="muted">{(servicesOf[m.id] ?? []).map(serviceName).join(", ") || "—"}</td>
                <td>
                  <div className="row">
                    <button className="ghost small" onClick={() => edit(m)}>
                      Изменить
                    </button>
                    <button
                      className="ghost small"
                      onClick={() => confirm(`Уволить: ${m.full_name}? Он пропадёт из записи и каталога.`) && remove.mutate(m.id)}
                    >
                      Уволить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Все записи сети с фильтрами ---

function AllAppointments() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState({
    status: "",
    date_from: today(),
    date_to: addDays(today(), 13),
    master_id: "",
    branch_id: "",
  });
  const masters = useMasters();
  const branches = useBranches();
  const list = useAppointments({
    status: filter.status || undefined,
    date_from: filter.date_from || undefined,
    date_to: filter.date_to || undefined,
    master_id: filter.master_id ? Number(filter.master_id) : undefined,
    branch_id: filter.branch_id ? Number(filter.branch_id) : undefined,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
    queryClient.invalidateQueries({ queryKey: ["slots"] });
  };
  const cancel = useMutation({ mutationFn: (id: number) => appointmentsApi.cancel(id), onSuccess: refresh });
  const change = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Status }) => appointmentsApi.setStatus(id, status),
    onSuccess: refresh,
  });

  const set = (key: keyof typeof filter) => (e: { target: { value: string } }) => setFilter({ ...filter, [key]: e.target.value });
  const started = (a: Appointment) => new Date(a.start_at).getTime() <= Date.now();

  return (
    <>
      <div className={s.inlineForm}>
        <label>
          <span>С</span>
          <input type="date" value={filter.date_from} onChange={set("date_from")} />
        </label>
        <label>
          <span>По</span>
          <input type="date" value={filter.date_to} onChange={set("date_to")} />
        </label>
        <label>
          <span>Статус</span>
          <select value={filter.status} onChange={set("status")}>
            <option value="">любой</option>
            {Object.entries(STATUS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Мастер</span>
          <select value={filter.master_id} onChange={set("master_id")}>
            <option value="">все</option>
            {masters.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Филиал</span>
          <select value={filter.branch_id} onChange={set("branch_id")}>
            <option value="">все</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorNotice error={cancel.error ?? change.error ?? list.error} />
      {list.isPending && <Loading />}
      {list.data && list.data.length === 0 && <p className="muted">Записей нет.</p>}
      {list.data && list.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Когда</th>
                <th>Клиент</th>
                <th>Мастер</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>
                    {day(a.start_at)}, {time(a.start_at)}–{time(a.end_at)}
                  </td>
                  <td>
                    {a.client_name}
                    {a.client_phone && <div className="muted">{a.client_phone}</div>}
                  </td>
                  <td>
                    {masters.data?.find((m) => m.id === a.master_id)?.full_name ?? `мастер №${a.master_id}`}
                    <div className="muted">{a.services.join(", ")}</div>
                    <div className="muted">{branches.data?.find((b) => b.id === a.branch_id)?.name}</div>
                  </td>
                  <td>{money(a.total_price)}</td>
                  <td>
                    <StatusLabel status={a.status} />
                  </td>
                  <td>
                    <div className="row">
                      {a.status === "pending" && (
                        <button className="small" onClick={() => change.mutate({ id: a.id, status: "confirmed" })}>
                          Подтвердить
                        </button>
                      )}
                      {a.status === "confirmed" && started(a) && (
                        <>
                          <button className="small" onClick={() => change.mutate({ id: a.id, status: "completed" })}>
                            Состоялась
                          </button>
                          <button className="ghost small" onClick={() => change.mutate({ id: a.id, status: "no_show" })}>
                            Не пришёл
                          </button>
                        </>
                      )}
                      {(a.status === "pending" || a.status === "confirmed") && (
                        <button
                          className="ghost small"
                          onClick={() => confirm(`Отменить запись №${a.id}?`) && cancel.mutate(a.id)}
                        >
                          Отменить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// --- Смены мастеров ---

function Shifts() {
  const queryClient = useQueryClient();
  const masters = useMasters();
  const branches = useBranches();
  const [masterId, setMasterId] = useState<number | null>(null);
  const [from, setFrom] = useState(today());
  const [form, setForm] = useState({ work_date: today(), start_time: "10:00", end_time: "20:00" });
  const to = addDays(from, 13);

  const shifts = useShifts(masterId, from, to);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    queryClient.invalidateQueries({ queryKey: ["slots"] });
  };
  const add = useMutation({ mutationFn: () => adminApi.addShift(masterId!, form), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => adminApi.removeShift(id), onSuccess: refresh });

  const pickMaster = (value: string) => {
    add.reset();
    remove.reset();
    setMasterId(value ? Number(value) : null);
  };

  return (
    <>
      <div className={s.inlineForm}>
        <label>
          <span>Мастер</span>
          <select value={masterId ?? ""} onChange={(e) => pickMaster(e.target.value)}>
            <option value="">выберите</option>
            {masters.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Показать две недели с</span>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
      </div>

      {masterId && (
        <>
          <h3>Добавить смену</h3>
          <div className={s.inlineForm}>
            <label>
              <span>День</span>
              <input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
            </label>
            <label>
              <span>С</span>
              <input
                type="time"
                step={900}
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </label>
            <label>
              <span>До</span>
              <input
                type="time"
                step={900}
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </label>
            <button onClick={() => add.mutate()} disabled={add.isPending}>
              Добавить
            </button>
          </div>
          <ErrorNotice error={add.error ?? remove.error ?? shifts.error} />
          {shifts.isPending && <Loading />}
          {shifts.data && shifts.data.length === 0 && <p className="muted">Смен на эти две недели нет.</p>}
          {shifts.data && shifts.data.length > 0 && (
            <div className="table-wrap">
              <table>
                <tbody>
                  {shifts.data.map((sh) => (
                    <tr key={sh.id}>
                      <td>{day(sh.work_date + "T12:00:00+03:00")}</td>
                      <td>
                        {sh.start_time.slice(0, 5)}–{sh.end_time.slice(0, 5)}
                      </td>
                      <td className="muted">{branches.data?.find((b) => b.id === sh.branch_id)?.name}</td>
                      <td>
                        <button className="ghost small" onClick={() => remove.mutate(sh.id)}>
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

// --- Статистика за период ---

function Stats() {
  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(addDays(today(), 14));
  const stats = useStats(from, to);
  const data = stats.data;

  return (
    <>
      <div className={s.inlineForm}>
        <label>
          <span>С</span>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label>
          <span>По</span>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
      </div>
      <ErrorNotice error={stats.error} />
      {stats.isPending && <Loading />}
      {data && (
        <>
          <div className={s.figures}>
            <div>
              <span>Всего записей</span>
              <strong>{data.total}</strong>
            </div>
            <div>
              <span>Состоялось</span>
              <strong>{data.by_status.completed ?? 0}</strong>
            </div>
            <div>
              <span>Выручка по состоявшимся</span>
              <strong>{money(data.revenue)}</strong>
            </div>
          </div>

          <div className={s.columns}>
            <section>
              <h3>По статусам</h3>
              <table>
                <tbody>
                  {Object.entries(STATUS).map(([key, label]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td style={{ textAlign: "right" }}>{data.by_status[key as Status] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section>
              <h3>Записи у мастеров</h3>
              <p className="muted">Без отменённых</p>
              {data.per_master.length === 0 && <p className="muted">За период записей нет.</p>}
              <table>
                <tbody>
                  {data.per_master.map((m) => (
                    <tr key={m.master_id}>
                      <td>{m.full_name}</td>
                      <td style={{ textAlign: "right" }}>{m.appointments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </>
  );
}

const TABS = ["Записи", "Филиалы", "Категории", "Услуги", "Мастера", "Смены", "Статистика"] as const;

export default function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Записи");
  const categories = useCategories();
  const categoryOptions = categories.data?.map((c) => ({ value: c.id, label: c.name })) ?? [];

  return (
    <>
      <h1>Управление</h1>
      <div className={s.tabs}>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? s.on : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Записи" && <AllAppointments />}

      {tab === "Филиалы" && (
        <Crud
          name="branches"
          path="/branches"
          load={adminLoad("/branches")}
          removeLabel="Закрыть"
          fields={[
            { key: "name", label: "Название" },
            { key: "address", label: "Адрес" },
            { key: "phone", label: "Телефон" },
          ]}
          columns={[
            { label: "Название", render: (r) => String(r.name) },
            { label: "Адрес", render: (r) => String(r.address) },
            { label: "Телефон", render: (r) => (r.phone as string) ?? "—" },
          ]}
        />
      )}

      {tab === "Категории" && (
        <Crud
          name="categories"
          path="/categories"
          load={adminLoad("/categories")}
          fields={[{ key: "name", label: "Название" }]}
          columns={[{ label: "Название", render: (r) => String(r.name) }]}
        />
      )}

      {tab === "Услуги" && (
        <Crud
          name="services"
          path="/services"
          load={adminLoad("/services")}
          removeLabel="Снять с продажи"
          fields={[
            { key: "name", label: "Название" },
            { key: "category_id", label: "Категория", type: "select", options: categoryOptions },
            { key: "duration_min", label: "Минут", type: "number" },
            { key: "base_price", label: "Цена, ₽", type: "number" },
            { key: "description", label: "Описание" },
          ]}
          columns={[
            { label: "Название", render: (r) => String(r.name) },
            { label: "Категория", render: (r) => categories.data?.find((c) => c.id === r.category_id)?.name ?? "" },
            { label: "Длительность", render: (r) => minutes(Number(r.duration_min)) },
            { label: "Цена", render: (r) => money(String(r.base_price)) },
          ]}
        />
      )}

      {tab === "Мастера" && <MastersAdmin />}
      {tab === "Смены" && <Shifts />}
      {tab === "Статистика" && <Stats />}
    </>
  );
}
