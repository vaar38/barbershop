import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api";
import { useAuth } from "../auth";
import { ErrorNotice } from "../components/Notice";
import s from "./pages.module.css";

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "" });
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.register({ ...form, phone: form.phone || null });
      await login(form.email, form.password);
      navigate("/book");
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit}>
      <h1>Регистрация</h1>
      <ErrorNotice error={error} />
      <label>
        <span>Имя и фамилия</span>
        <input required maxLength={100} value={form.full_name} onChange={set("full_name")} autoComplete="name" />
      </label>
      <label>
        <span>Телефон (необязательно)</span>
        <input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
      </label>
      <label>
        <span>Email</span>
        <input type="email" required value={form.email} onChange={set("email")} autoComplete="email" />
      </label>
      <label>
        <span>Пароль, не короче 8 символов</span>
        <input
          type="password"
          required
          minLength={8}
          maxLength={72}
          value={form.password}
          onChange={set("password")}
          autoComplete="new-password"
        />
      </label>
      <button disabled={busy}>{busy ? "Создаём…" : "Зарегистрироваться"}</button>
      <p style={{ marginTop: 16 }}>
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </form>
  );
}
