import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorNotice, Loading } from "../components/Notice";
import { minutes, money } from "../format";
import { useBranches, useCategories, useServices } from "../api/queries";
import s from "./pages.module.css";

export default function Catalog() {
  const [branchId, setBranchId] = useState<number | undefined>();

  const branches = useBranches();
  const categories = useCategories();
  const services = useServices({ branch_id: branchId });

  return (
    <>
      <h1>Стрижки без звонков</h1>
      <p className={s.lead}>
        Выберите филиал, услугу и мастера — свободное время видно сразу. Цены указаны для мастера; у старшего и топ-мастера дороже
        на 20 и 50&nbsp;%.
      </p>

      <section className={s.section}>
        <h2>Филиалы</h2>
        <ErrorNotice error={branches.error} />
        {branches.isPending && <Loading />}
        <ul className={s.branches}>
          {branches.data?.map((b) => (
            <li key={b.id}>
              <strong>{b.name}</strong>
              <div>{b.address}</div>
              {b.phone && <div className="muted">{b.phone}</div>}
              <Link to={`/masters?branch_id=${b.id}`}>Мастера филиала →</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Прайс</h2>
          <label style={{ margin: 0, minWidth: 220 }}>
            <span>Показать услуги филиала</span>
            <select value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">все филиалы</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ErrorNotice error={services.error ?? categories.error} />
        {services.isPending && <Loading />}
        {services.data && services.data.length === 0 && <p className="muted">В этом филиале пока нет услуг.</p>}

        <div className={s.columns}>
          {categories.data?.map((c) => {
            const items = services.data?.filter((sv) => sv.category_id === c.id) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={c.id}>
                <h3>{c.name}</h3>
                <ul className={s.price}>
                  {items.map((sv) => (
                    <li key={sv.id}>
                      <div className={s.priceLine}>
                        <span className={s.name}>{sv.name}</span>
                        <span className={s.dots} />
                        <span className={s.value}>от {money(sv.base_price)}</span>
                      </div>
                      <span className={s.sub}>
                        {minutes(sv.duration_min)}
                        {sv.description ? ` · ${sv.description}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p style={{ marginTop: 20 }}>
          <Link to="/book">
            <button>Записаться</button>
          </Link>
        </p>
      </section>
    </>
  );
}
