import { NavLink, Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import s from "./Layout.module.css";

export default function Layout() {
  const { loggedIn, user, role, logout } = useAuth();
  const navigate = useNavigate();

  // Записываются гости и клиенты; у мастера и администратора свои разделы
  const canBook = !loggedIn || role === "client";

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? s.active : undefined);

  return (
    <>
      <header className={s.header}>
        <div className={s.pole} />
        <div className={s.bar}>
          <Link to="/" className={s.logo}>
            FADE<small>барбершопы</small>
          </Link>
          <nav className={s.nav}>
            <NavLink to="/" end className={link}>
              Услуги и цены
            </NavLink>
            <NavLink to="/masters" className={link}>
              Мастера
            </NavLink>
            {canBook && (
              <NavLink to="/book" className={link}>
                Записаться
              </NavLink>
            )}
            {role === "client" && (
              <NavLink to="/my" className={link}>
                Мои записи
              </NavLink>
            )}
            {role === "master" && (
              <NavLink to="/schedule" className={link}>
                Расписание
              </NavLink>
            )}
            {role === "admin" && (
              <NavLink to="/admin" className={link}>
                Управление
              </NavLink>
            )}
          </nav>
          <div className={s.user}>
            {loggedIn ? (
              <>
                <Link to="/profile">{user?.full_name ?? "Профиль"}</Link>
                <button
                  className="ghost small"
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                >
                  Выйти
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Войти</Link>
                <Link to="/register">Регистрация</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={s.main}>
        <Outlet />
      </main>

      <footer className={s.footer}>
        <span>Fade — онлайн-запись в сеть барбершопов. Учебный проект.</span>
        <span>Время везде указано по Москве</span>
      </footer>
    </>
  );
}
