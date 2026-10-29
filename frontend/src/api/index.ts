// Все запросы к API в одном месте. Пути и поля — как в разделе «API» в readme

import { api } from "./client";

export type Branch = { id: number; name: string; address: string; phone: string | null };
export type Category = { id: number; name: string };
export type Service = {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  duration_min: number;
  base_price: string;
};
export type Level = "junior" | "middle" | "top";
export type Master = {
  id: number;
  full_name: string;
  branch_id: number;
  level: Level;
  bio: string | null;
  photo_url: string | null;
};
export type Status = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
export type Appointment = {
  id: number;
  master_id: number;
  branch_id: number;
  start_at: string;
  end_at: string;
  status: Status;
  total_price: string;
  comment: string | null;
  client_name: string;
  client_phone: string | null;
  services: string[];
};
export type Review = { id: number; appointment_id: number; rating: number; text: string | null; created_at: string };
export type Shift = { id: number; master_id: number; branch_id: number; work_date: string; start_time: string; end_time: string };
export type Role = "client" | "master" | "admin";
export type Me = { id: number; email: string; full_name: string; phone: string | null; created_at: string; role: Role };
export type Stats = {
  date_from: string;
  date_to: string;
  by_status: Partial<Record<Status, number>>;
  total: number;
  revenue: string;
  per_master: { master_id: number; full_name: string; appointments: number }[];
};
export type MasterForm = {
  full_name: string;
  branch_id: number;
  level: Level;
  bio: string | null;
  service_ids: number[];
};

type Tokens = { access_token: string; refresh_token: string };

export const authApi = {
  register: (body: { email: string; password: string; full_name: string; phone?: string | null }) =>
    api<Me>("/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) => api<Tokens>("/auth/login", { method: "POST", body }),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  me: () => api<Me>("/users/me"),
  updateMe: (body: { full_name?: string; phone?: string | null }) => api<Me>("/users/me", { method: "PATCH", body }),
};

export const catalogApi = {
  branches: () => api<Branch[]>("/branches"),
  categories: () => api<Category[]>("/categories"),
  services: (query: { category_id?: number; branch_id?: number } = {}) => api<Service[]>("/services", { query }),
  masters: (query: { branch_id?: number; service_id?: number } = {}) => api<Master[]>("/masters", { query }),
  master: (id: number) => api<Master>(`/masters/${id}`),
  reviews: (id: number) => api<Review[]>(`/masters/${id}/reviews`),
  slots: (id: number, date: string, serviceIds: number[]) =>
    api<string[]>(`/masters/${id}/slots`, { query: { date, service_ids: serviceIds } }),
};

export const appointmentsApi = {
  list: (query: { status?: string; date_from?: string; date_to?: string; master_id?: number; branch_id?: number } = {}) =>
    api<Appointment[]>("/appointments", { query }),
  create: (body: { master_id: number; service_ids: number[]; start_at: string; comment?: string | null }) =>
    api<Appointment>("/appointments", { method: "POST", body }),
  cancel: (id: number) => api<Appointment>(`/appointments/${id}/cancel`, { method: "POST" }),
  setStatus: (id: number, status: Status) =>
    api<Appointment>(`/appointments/${id}/status`, { method: "PATCH", body: { status } }),
  review: (id: number, body: { rating: number; text?: string | null }) =>
    api<Review>(`/appointments/${id}/review`, { method: "POST", body }),
};

// Админские операции: путь справочника + id
export const adminApi = {
  list: <T>(path: string) => api<T[]>(path),
  create: <T>(path: string, body: unknown) => api<T>(path, { method: "POST", body }),
  update: <T>(path: string, id: number, body: unknown) => api<T>(`${path}/${id}`, { method: "PUT", body }),
  remove: (path: string, id: number) => api<void>(`${path}/${id}`, { method: "DELETE" }),
  createMaster: (body: MasterForm & { email: string; password: string }) => api<Master>("/masters", { method: "POST", body }),
  updateMaster: (id: number, body: MasterForm) => api<Master>(`/masters/${id}`, { method: "PUT", body }),
  shifts: (masterId: number, dateFrom: string, dateTo: string) =>
    api<Shift[]>(`/masters/${masterId}/shifts`, { query: { date_from: dateFrom, date_to: dateTo } }),
  addShift: (masterId: number, body: { work_date: string; start_time: string; end_time: string; branch_id?: number }) =>
    api<Shift>(`/masters/${masterId}/shifts`, { method: "POST", body }),
  removeShift: (id: number) => api<void>(`/shifts/${id}`, { method: "DELETE" }),
  stats: (dateFrom: string, dateTo: string) => api<Stats>("/stats", { query: { date_from: dateFrom, date_to: dateTo } }),
};
