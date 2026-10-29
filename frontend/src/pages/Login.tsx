import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { homeFor, useAuth } from "../auth";
import { ErrorNotice } from "../components/Notice";
import s from "./pages.module.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      // клиента возвращаем туда, откуда он пришёл (например, на шаг записи)
      const next = params.get("next");
      navigate(user.role === "client" && next ? next : homeFor(user.role));
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit}>
      <h1>Вход</h1>
      <ErrorNotice error={error} />
      <label>
        <span>Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        <span>Пароль</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <button disabled={busy}>{busy ? "Входим…" : "Войти"}</button>
      <p style={{ marginTop: 16 }}>
        Нет аккаунта? <Link to="/register">Регистрация</Link>
      </p>
    </form>
  );
}
