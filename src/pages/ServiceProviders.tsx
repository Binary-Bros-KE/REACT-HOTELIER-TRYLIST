import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  LuCalendarCheck,
  LuCheck,
  LuLoaderCircle,
  LuPhone,
  LuSearch,
  LuSparkles,
  LuUserRoundCheck,
  LuUsers,
} from "react-icons/lu";
import { api } from "@/lib/api";

type Appointment = {
  id: string;
  startsAt: string;
  status: string;
  customer: { firstName: string; lastName: string };
  service: { name: string };
};
type Provider = {
  id: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  isActive: boolean;
  locations: { id: string; name: string }[];
  shift: { name: string; startTime: string; endTime: string } | null;
  appointments: Appointment[];
  _count: { appointments: number };
};
const colors = [
  "from-violet-700 to-fuchsia-500",
  "from-sky-700 to-cyan-400",
  "from-emerald-700 to-lime-500",
  "from-orange-700 to-rose-500",
];

export default function ServiceProviders() {
  const [providers, setProviders] = useState<Provider[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Provider | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ providers: Provider[] }>(
        "/service-center/providers",
      );
      setProviders(data.providers);
      setSelected((current) =>
        current
          ? (data.providers.find((p) => p.id === current.id) ?? null)
          : null,
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load providers");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      providers.filter((p) =>
        `${p.name} ${p.specialty ?? ""} ${p.phone ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [providers, query],
  );
  const upcoming = providers
    .flatMap((p) => p.appointments)
    .filter(
      (a) =>
        new Date(a.startsAt) > new Date() &&
        !["CANCELLED", "NO_SHOW"].includes(a.status),
    ).length;
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <header className="relative overflow-hidden rounded-[2rem] bg-[#101827] p-8 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(14,165,233,.4),transparent_32%),radial-gradient(circle_at_10%_100%,rgba(168,85,247,.35),transparent_30%)]" />
        <div className="absolute right-12 top-8 grid grid-cols-3 gap-2 opacity-20">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-white" />
          ))}
        </div>
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold backdrop-blur">
              <LuSparkles /> Service experts
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              The people behind every experience.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Service centre staff are employees pinned to a service location.
              Add someone here by assigning them to that location under Team;
              their shifts decide when they can be booked.
            </p>
          </div>
        </div>
      </header>
      {error && <Message error text={error} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<LuUsers />}
          value={providers.length}
          label="Service staff"
        />
        <Metric
          icon={<LuUserRoundCheck />}
          value={providers.filter((p) => p.shift).length}
          label="On a shift rota"
        />
        <Metric
          icon={<LuCalendarCheck />}
          value={upcoming}
          label="Upcoming appointments"
        />
      </section>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Provider directory</h2>
          <p className="text-sm text-muted-foreground">
            Select a profile to inspect recent appointments.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border bg-card px-3 shadow-sm">
          <LuSearch />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 bg-transparent text-sm outline-none"
            placeholder="Search name or specialty"
          />
        </label>
      </div>
      {loading ? (
        <div className="p-20 text-center">
          <LuLoaderCircle className="mx-auto animate-spin" />
        </div>
      ) : (
        <section className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((provider, index) => (
            <article
              key={provider.id}
              onClick={() => setSelected(provider)}
              className="group cursor-pointer overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div
                className={`h-24 bg-linear-to-br ${colors[index % colors.length]}`}
              />
              <div className="relative p-5 pt-10">
                <span
                  className={`absolute -top-9 flex h-18 w-18 items-center justify-center rounded-2xl border-4 border-card bg-linear-to-br text-xl font-black text-white shadow ${colors[index % colors.length]}`}
                >
                  {provider.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="absolute right-5 top-4 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                  <LuCheck className="mr-1 inline" />
                  {provider.shift ? `${provider.shift.name} ${provider.shift.startTime}-${provider.shift.endTime}` : "Any time"}
                </span>
                <h3 className="text-xl font-bold">{provider.name}</h3>
                <p className="text-sm font-medium text-secondary">
                  {provider.specialty || "Service specialist"}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <LuPhone />
                  {provider.phone || "No phone added"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{provider.locations.map((l) => l.name).join(", ")}</p>
                <div className="mt-5 rounded-xl bg-muted/50 p-3 text-center text-xs">
                  <div>
                    <b className="block text-lg">
                      {provider._count.appointments}
                    </b>
                    Appointments
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-slate-950/50 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <aside
            className="h-full w-full max-w-lg overflow-y-auto bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="float-right rounded-lg border px-3 py-1 text-sm"
            >
              Close
            </button>
            <p className="text-xs font-bold uppercase tracking-wider text-secondary">
              Provider profile
            </p>
            <h2 className="mt-2 text-3xl font-bold">{selected.name}</h2>
            <p className="text-muted-foreground">
              {selected.specialty || "Service specialist"}
            </p>
            <h3 className="mt-8 font-bold">Recent appointments</h3>
            <div className="mt-3 space-y-2">
              {selected.appointments.slice(0, 8).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border p-3 text-sm"
                >
                  <div>
                    <b>{a.service.name}</b>
                    <p className="text-xs text-muted-foreground">
                      {a.customer.firstName} {a.customer.lastName} ·{" "}
                      {new Date(a.startsAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs font-bold">{a.status}</span>
                </div>
              ))}
              {selected.appointments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No appointments recorded.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
function Message({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div
      className={`mt-4 rounded-xl border p-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {text}
    </div>
  );
}
function Metric({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <span className="inline-flex rounded-xl bg-sky-100 p-2.5 text-sky-700">
        {icon}
      </span>
      <b className="mt-4 block text-2xl">{value}</b>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
