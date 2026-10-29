import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireRole from "./components/RequireRole";
import Admin from "./pages/Admin";
import Booking from "./pages/Booking";
import Catalog from "./pages/Catalog";
import Login from "./pages/Login";
import MasterPage from "./pages/MasterPage";
import Masters from "./pages/Masters";
import MyAppointments from "./pages/MyAppointments";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import Schedule from "./pages/Schedule";

// Карта страниц. Закрытые разделы обёрнуты в RequireRole
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Catalog />} />
        <Route path="/masters" element={<Masters />} />
        <Route path="/masters/:id" element={<MasterPage />} />
        <Route path="/book" element={<Booking />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/my"
          element={
            <RequireRole roles={["client"]}>
              <MyAppointments />
            </RequireRole>
          }
        />
        <Route
          path="/schedule"
          element={
            <RequireRole roles={["master"]}>
              <Schedule />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole roles={["admin"]}>
              <Admin />
            </RequireRole>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireRole roles={["client", "master", "admin"]}>
              <Profile />
            </RequireRole>
          }
        />
        <Route path="*" element={<p>Такой страницы нет.</p>} />
      </Route>
    </Routes>
  );
}
