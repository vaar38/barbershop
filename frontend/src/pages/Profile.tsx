import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { authApi, type Me } from "../api";
import { keys } from "../api/queries";
import { useAuth } from "../auth";
import { ErrorNotice, Loading, Notice } from "../components/Notice";
import s from "./pages.module.css";

const ROLE: Record<string, string> = { client: "клиент", master: "мастер", admin: "администратор" };

export default function Profile() {
  const { user } = useAuth();
  if (!user) return <Loading />;
  return <ProfileForm user={user} />;
}

function ProfileForm({ user }: { user: Me }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: user.full_name, phone: user.phone ?? "" });

  const save = useMutation({
    mutationFn: () => authApi.updateMe({ full_name: form.full_name, phone: form.phone || null }),
    onSuccess: (me) => queryClient.setQueryData(keys.me, me),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form className={s.form} onSubmit={submit}>
      <h1>Профиль</h1>
      <p className="muted">
        {user.email} · {ROLE[user.role]}
      </p>
      {save.isSuccess && <Notice kind="ok">Сохранено.</Notice>}
      <ErrorNotice error={save.error} />
      <label>
        <span>Имя и фамилия</span>
        <input
          required
          maxLength={100}
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
      </label>
      <label>
        <span>Телефон</span>
        <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </label>
      <button disabled={save.isPending}>{save.isPending ? "Сохраняем…" : "Сохранить"}</button>
    </form>
  );
}
