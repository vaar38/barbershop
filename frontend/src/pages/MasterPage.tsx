import { Link, useParams } from "react-router-dom";
import { useBranches, useMaster, useReviews } from "../api/queries";
import { ErrorNotice, Loading } from "../components/Notice";
import { day, LEVEL } from "../format";
import { Avatar } from "./Masters";
import s from "./pages.module.css";

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export default function MasterPage() {
  const id = Number(useParams().id);
  const master = useMaster(id);
  const branches = useBranches();
  const reviews = useReviews(id);

  if (master.isPending) return <Loading />;
  if (master.error || !master.data) return <ErrorNotice error={master.error ?? new Error("Мастер не найден")} />;

  const m = master.data;
  const branch = branches.data?.find((b) => b.id === m.branch_id);
  const avg = reviews.data?.length ? reviews.data.reduce((sum, r) => sum + r.rating, 0) / reviews.data.length : null;

  return (
    <>
      <div className={s.masterHead}>
        <Avatar master={m} big />
        <div>
          <p className="label">{LEVEL[m.level]}</p>
          <h1>{m.full_name}</h1>
          {branch && (
            <p>
              {branch.name}, {branch.address}
            </p>
          )}
          {avg !== null && (
            <p>
              <span className={s.stars}>{stars(Math.round(avg))}</span> {avg.toFixed(1)} · {reviews.data!.length} отз.
            </p>
          )}
          <Link to={`/book?master_id=${m.id}`}>
            <button>Записаться к мастеру</button>
          </Link>
        </div>
      </div>

      {m.bio && (
        <section className={s.section}>
          <h2>О мастере</h2>
          <p style={{ maxWidth: 640 }}>{m.bio}</p>
        </section>
      )}

      <section className={s.section}>
        <h2>Отзывы</h2>
        {reviews.isPending && <Loading />}
        <ErrorNotice error={reviews.error} />
        {reviews.data && reviews.data.length === 0 && <p className="muted">Отзывов пока нет.</p>}
        {reviews.data?.map((r) => (
          <div key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)", maxWidth: 640 }}>
            <span className={s.stars}>{stars(r.rating)}</span> <span className="muted">{day(r.created_at)}</span>
            {r.text && <p style={{ margin: "4px 0 0" }}>{r.text}</p>}
          </div>
        ))}
      </section>
    </>
  );
}
