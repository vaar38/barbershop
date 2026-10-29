// Хуки TanStack Query: загрузка данных с кешем. Ключи собраны в одном месте,
// чтобы после изменения данных сбрасывать кеш нужного раздела (invalidateQueries)

import { QueryClient, useQueries, useQuery } from "@tanstack/react-query";
import { adminApi, appointmentsApi, catalogApi, type Service } from ".";
import { ApiError } from "./client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // ошибки 4xx повторять бессмысленно — сервер ответит так же
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

type AppointmentsQuery = Parameters<typeof appointmentsApi.list>[0];

export const keys = {
  me: ["me"] as const,
  branches: ["branches"] as const,
  categories: ["categories"] as const,
  services: (q: { category_id?: number; branch_id?: number } = {}) => ["services", q] as const,
  masters: (q: { branch_id?: number; service_id?: number } = {}) => ["masters", q] as const,
  master: (id: number) => ["masters", "one", id] as const,
  reviews: (id: number) => ["reviews", id] as const,
  slots: (id: number, date: string, serviceIds: number[]) => ["slots", id, date, serviceIds] as const,
  appointments: (q: AppointmentsQuery = {}) => ["appointments", q] as const,
  shifts: (masterId: number, from: string, to: string) => ["shifts", masterId, from, to] as const,
  stats: (from: string, to: string) => ["stats", from, to] as const,
};

export const useBranches = () => useQuery({ queryKey: keys.branches, queryFn: catalogApi.branches });

export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: catalogApi.categories });

export const useServices = (q: { category_id?: number; branch_id?: number } = {}, enabled = true) =>
  useQuery({ queryKey: keys.services(q), queryFn: () => catalogApi.services(q), enabled });

export const useMasters = (q: { branch_id?: number; service_id?: number } = {}, enabled = true) =>
  useQuery({ queryKey: keys.masters(q), queryFn: () => catalogApi.masters(q), enabled });

export const useMaster = (id: number) => useQuery({ queryKey: keys.master(id), queryFn: () => catalogApi.master(id) });

export const useReviews = (id: number) => useQuery({ queryKey: keys.reviews(id), queryFn: () => catalogApi.reviews(id) });

export const useSlots = (masterId: number | null, date: string, serviceIds: number[]) =>
  useQuery({
    queryKey: keys.slots(masterId ?? 0, date, serviceIds),
    queryFn: () => catalogApi.slots(masterId!, date, serviceIds),
    enabled: masterId !== null && serviceIds.length > 0,
    staleTime: 0, // свободное время меняется часто — всегда спрашиваем заново
  });

export const useAppointments = (q: AppointmentsQuery = {}, enabled = true) =>
  useQuery({ queryKey: keys.appointments(q), queryFn: () => appointmentsApi.list(q), enabled, staleTime: 0 });

export const useShifts = (masterId: number | null, from: string, to: string) =>
  useQuery({
    queryKey: keys.shifts(masterId ?? 0, from, to),
    queryFn: () => adminApi.shifts(masterId!, from, to),
    enabled: masterId !== null,
  });

export const useStats = (from: string, to: string) =>
  useQuery({ queryKey: keys.stats(from, to), queryFn: () => adminApi.stats(from, to), staleTime: 0 });

// Отдельного эндпоинта «услуги мастера» нет, поэтому собираем по списку мастеров каждой услуги:
// результат — { id мастера: [id услуг] }
export function useMasterServices(services: Service[] | undefined) {
  const results = useQueries({
    queries: (services ?? []).map((sv) => ({
      queryKey: keys.masters({ service_id: sv.id }),
      queryFn: () => catalogApi.masters({ service_id: sv.id }),
    })),
  });

  const byMaster: Record<number, number[]> = {};
  results.forEach((r, i) => {
    for (const m of r.data ?? []) (byMaster[m.id] ??= []).push(services![i].id);
  });
  return byMaster;
}
