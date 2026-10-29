import { Link, useSearchParams } from "react-router-dom";
import type { Master } from "../api";
import { ErrorNotice, Loading } from "../components/Notice";
import { LEVEL } from "../format";
import { useBranches, useMasters, useServices } from "../api/queries";
import s from "./pages.module.css";

export function Avatar({ master, big }: { master: Pick<Master, "full_name" | "photo_url">; big?: boolean }) {
  const cls = big ? `${s.avatar} ${s.avatarBig}` : s.avatar;
  if (master.photo_url) return <img className={cls} src={master.photo_url} alt={master.full_name} />;
  const initials = master.full_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return <div className={cls}>{initials}</div>;
}

export default function Masters() {
  const [params, setParams] = useSearchParams();
  const branchId = params.get("branch_id") ? Number(params.get("branch_id")) : undefined;
  const serviceId = params.get("service_id") ? Number(params.get("service_id")) : undefined;

  const branches = useBranches();
  const services = useServices({ branch_id: branchId });
  const masters = useMasters({ branch_id: branchId, service_id: serviceId });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "branch_id") next.delete("service_id");
    setParams(next);
  };

  const branchName = (id: number) => branches.data?.find((b) => b.id === id)?.name ?? "";

  return (
    <>
      <h1>Мастера</h1>

      <div className={s.filters}>
        <label>
          <span>Филиал</span>
          <select value={branchId ?? ""} onChange={(e) => setFilter("branch_id", e.target.value)}>
            <option value="">все</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Услуга</span>
          <select value={serviceId ?? ""} onChange={(e) => setFilter("service_id", e.target.value)}>
            <option value="">любая</option>
            {services.data?.map((sv) => (
              <option key={sv.id} value={sv.id}>
                {sv.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorNotice error={masters.error} />
      {masters.isPending && <Loading />}
      {masters.data && masters.data.length === 0 && <p className="muted">По этим условиям мастеров не нашлось.</p>}

      <ul className={s.masters}>
        {masters.data?.map((m) => (
          <li key={m.id}>
            <Avatar master={m} />
            <div>
              <Link to={`/masters/${m.id}`}>
                <strong>{m.full_name}</strong>
              </Link>
              <div className="muted">
                {LEVEL[m.level]} · {branchName(m.branch_id)}
              </div>
            </div>
            <Link to={`/book?master_id=${m.id}${serviceId ? `&service_id=${serviceId}` : ""}`}>
              <button className="ghost">Записаться</button>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
