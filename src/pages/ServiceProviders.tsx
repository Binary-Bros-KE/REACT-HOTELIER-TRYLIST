import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  LuCalendarCheck,
  LuLoaderCircle,
  LuPhone,
  LuSearch,
  LuUserRoundCheck,
  LuUsers,
} from "react-icons/lu";
import { api } from "@/lib/api";
import SharedStatCard from "@/components/ui/StatCard";
import PageBanner from "@/components/ui/PageBanner";
import ModalShell from "@/components/ui/ModalShell";
import StatusPill from "@/components/ui/StatusPill";

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
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Service centre" title="Providers" />
      {error && <Message error text={error} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric index={0} icon={<LuUsers />} value={providers.length} label="Service staff" />
        <Metric index={1} icon={<LuUserRoundCheck />} value={providers.filter((p) => p.shift).length} label="On a shift rota" />
        <Metric index={2} icon={<LuCalendarCheck />} value={upcoming} label="Upcoming appointments" />
      </section>
      <section className="mt-6 border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Provider directory</h2>
            <p className="text-xs text-muted-foreground">
              Service centre staff are employees pinned to a service location — add someone by assigning them to that location under Team; their shifts decide when they can be booked. Select a profile to inspect recent appointments.
            </p>
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-64 border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search name or specialty"
            />
          </label>
        </div>
        {loading ? (
          <div className="p-20 text-center">
            <LuLoaderCircle className="mx-auto animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-20 text-center text-sm text-muted-foreground">No providers found.</div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((provider) => (
              <article
                key={provider.id}
                onClick={() => setSelected(provider)}
                className="group cursor-pointer overflow-hidden border border-t-4 border-t-accent bg-background p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-14 w-14 items-center justify-center bg-secondary/10 text-xl font-black text-secondary">
                    {provider.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <StatusPill tone={provider.shift ? "success" : "muted"}>
                    {provider.shift ? `${provider.shift.name} ${provider.shift.startTime}-${provider.shift.endTime}` : "Any time"}
                  </StatusPill>
                </div>
                <h3 className="mt-4 text-lg font-bold">{provider.name}</h3>
                <p className="text-sm font-medium text-secondary">{provider.specialty || "Service specialist"}</p>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <LuPhone />
                  {provider.phone || "No phone added"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{provider.locations.map((l) => l.name).join(", ")}</p>
                <div className="mt-4 border bg-muted/40 p-3 text-center text-xs">
                  <b className="block text-lg">{provider._count.appointments}</b>
                  Appointments
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {selected && (
        <ModalShell
          size="md"
          kicker="Provider profile"
          title={selected.name}
          subtitle={selected.specialty || "Service specialist"}
          onClose={() => setSelected(null)}
        >
          <div className="p-5">
            <p className="border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent appointments</p>
            <div className="mt-3 space-y-2">
              {selected.appointments.slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 border p-3 text-sm">
                  <div>
                    <b>{a.service.name}</b>
                    <p className="text-xs text-muted-foreground">
                      {a.customer.firstName} {a.customer.lastName} · {new Date(a.startsAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wide">{a.status.replace("_", " ")}</span>
                </div>
              ))}
              {selected.appointments.length === 0 && (
                <p className="text-sm text-muted-foreground">No appointments recorded.</p>
              )}
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
function Message({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div
      className={"mt-4 border p-3 text-sm " + (error ? "border-destructive/25 bg-destructive/10 text-destructive" : "border-success/25 bg-success/10 text-success")}
    >
      {text}
    </div>
  );
}
function Metric({
  icon,
  value,
  label,
  index,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  index?: number;
}) {
  return <SharedStatCard index={index} icon={icon} label={label} value={value} />;
}
