import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LuCalendarCheck,
  LuCheck,
  LuLoaderCircle,
  LuPencil,
  LuPhone,
  LuPlus,
  LuSearch,
  LuSparkles,
  LuTrash2,
  LuUserRoundCheck,
  LuUsers,
} from "react-icons/lu";
import { api } from "@/lib/api";
import Button from "@/components/ui/Button";

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
  appointments: Appointment[];
  _count: { appointments: number };
};
type Form = {
  name: string;
  specialty: string;
  phone: string;
  isActive: boolean;
};
const blank: Form = { name: "", specialty: "", phone: "", isActive: true };
const colors = [
  "from-violet-700 to-fuchsia-500",
  "from-sky-700 to-cyan-400",
  "from-emerald-700 to-lime-500",
  "from-orange-700 to-rose-500",
];

export default function ServiceProviders() {
  const [providers, setProviders] = useState<Provider[]>([]),
    [query, setQuery] = useState(""),
    [form, setForm] = useState<Form>(blank),
    [editing, setEditing] = useState<Provider | null>(null),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Provider | null>(null),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
  function create() {
    setEditing(null);
    setForm(blank);
    setOpen(true);
    setError("");
  }
  function edit(provider: Provider) {
    setEditing(provider);
    setForm({
      name: provider.name,
      specialty: provider.specialty ?? "",
      phone: provider.phone ?? "",
      isActive: provider.isActive,
    });
    setOpen(true);
    setError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(
        editing
          ? `/service-center/providers/${editing.id}`
          : "/service-center/providers",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...form,
            specialty: form.specialty || null,
            phone: form.phone || null,
          }),
        },
      );
      setOpen(false);
      setNotice(
        editing
          ? "Provider profile updated."
          : "Provider added to the Service Centre.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save provider");
    } finally {
      setSaving(false);
    }
  }
  async function toggle(provider: Provider) {
    try {
      await api(`/service-center/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !provider.isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update provider");
    }
  }
  async function remove(provider: Provider) {
    if (!confirm(`Delete ${provider.name}?`)) return;
    try {
      await api(`/service-center/providers/${provider.id}`, {
        method: "DELETE",
      });
      setNotice("Provider deleted.");
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete provider");
    }
  }

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
              Manage specialists and keep their profiles connected to services
              and appointments.
            </p>
          </div>
          <Button onClick={create} className="shrink-0">
            <LuPlus /> Add provider
          </Button>
        </div>
      </header>
      {error && <Message error text={error} />}{" "}
      {notice && <Message text={notice} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<LuUsers />}
          value={providers.length}
          label="Provider profiles"
        />
        <Metric
          icon={<LuUserRoundCheck />}
          value={providers.filter((p) => p.isActive).length}
          label="Active providers"
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggle(provider);
                  }}
                  className={`absolute right-5 top-4 rounded-full px-3 py-1 text-xs font-bold ${provider.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                >
                  {provider.isActive ? (
                    <>
                      <LuCheck className="mr-1 inline" />
                      Available
                    </>
                  ) : (
                    "Inactive"
                  )}
                </button>
                <h3 className="text-xl font-bold">{provider.name}</h3>
                <p className="text-sm font-medium text-secondary">
                  {provider.specialty || "Service specialist"}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <LuPhone />
                  {provider.phone || "No phone added"}
                </p>
                <div className="mt-5 rounded-xl bg-muted/50 p-3 text-center text-xs">
                  <div>
                    <b className="block text-lg">
                      {provider._count.appointments}
                    </b>
                    Appointments
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-1 border-t pt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      edit(provider);
                    }}
                    className="rounded-lg p-2 text-secondary hover:bg-muted"
                    aria-label="Edit"
                  >
                    <LuPencil />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(provider);
                    }}
                    className="rounded-lg p-2 text-destructive hover:bg-muted"
                    aria-label="Delete"
                  >
                    <LuTrash2 />
                  </button>
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
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <form
            onSubmit={save}
            className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-2xl"
          >
            <p className="text-sm font-bold text-sky-700">
              {editing ? "Edit specialist" : "New specialist"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Provider profile</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <input
                  autoFocus
                  required
                  minLength={2}
                  maxLength={100}
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Wanjiku Mwangi"
                />
              </Field>
              <Field label="Specialty">
                <input
                  maxLength={120}
                  className="input"
                  value={form.specialty}
                  onChange={(e) =>
                    setForm({ ...form, specialty: e.target.value })
                  }
                  placeholder="Massage therapy"
                />
              </Field>
              <Field label="Kenyan phone number">
                <input
                  maxLength={30}
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+254 7XX XXX XXX"
                />
              </Field>
              <label className="flex items-center justify-between rounded-xl border p-4">
                <span>
                  <b className="block text-sm">Available</b>
                  <span className="text-xs text-muted-foreground">
                    Can receive bookings
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm({ ...form, isActive: e.target.checked })
                  }
                  className="h-5 w-5"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border px-4 py-2.5"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-sky-800 px-4 py-2.5 font-bold text-white"
              >
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? "Save profile" : "Add provider"}
              </button>
            </div>
          </form>
        </div>
      )}
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
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-sm font-medium">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
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
