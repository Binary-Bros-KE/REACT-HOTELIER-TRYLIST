import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LuBadgeCheck,
  LuCalendarClock,
  LuCircleDollarSign,
  LuGrid2X2,
  LuLoaderCircle,
  LuPalette,
  LuPencil,
  LuPlus,
  LuSearch,
  LuSettings2,
  LuTable2,
  LuTrash2,
  LuUsers,
} from "react-icons/lu";
import { api } from "@/lib/api";
import SharedStatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";

type Status = "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELLED";
type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
};
type Plan = {
  id: string;
  visitLimit?: number | null;
  discountOnProducts?: boolean;
  name: string;
  price: string | number;
  durationDays: number;
  discountPercent: string | number;
  isActive: boolean;
};
type Payment = {
  id: string;
  amount: string | number;
  status: string;
  reference: string | null;
  paidAt: string | null;
  paymentMethod: { name: string };
};
type Membership = {
  id: string;
  customerId: string;
  planId: string | null;
  visitLimit: number | null;
  visitsUsed: number;
  discountOnProducts: boolean;
  visits: { id: string; visitedAt: string; note: string | null }[];
  planName: string;
  planPrice: string | number;
  durationDays: number;
  discountPercent: string | number;
  startsAt: string;
  endsAt: string;
  status: Status;
  customer: Customer;
  plan: Plan;
  payments: Payment[];
  _count: { appointments: number };
};
type CatalogPlan = Plan & { description: string | null; _count?: { memberships: number } };
type Summary = {
  total: number;
  active: number;
  expiringSoon: number;
  revenue: number;
};
type Form = {
  customerId: string;
  planId: string;
  visitLimit: string;
  discountOnProducts: boolean;
  planName: string;
  planPrice: string;
  durationDays: string;
  discountPercent: string;
  startsAt: string;
  endsAt: string;
  status: Status;
};
const blank: Form = {
  customerId: "",
  planId: "",
  visitLimit: "",
  discountOnProducts: false,
  planName: "",
  planPrice: "0",
  durationDays: "30",
  discountPercent: "0",
  startsAt: "",
  endsAt: "",
  status: "ACTIVE",
};
const dateInput = (value: Date | string) =>
  new Date(value).toISOString().slice(0, 10);
const money = (value: number) =>
  `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
type Theme = "royal" | "ocean" | "sunset";
type View = "table" | "cards";
const themes: Record<
  Theme,
  { hero: string; accent: string; soft: string; ring: string }
> = {
  royal: {
    hero: "from-[#24104f] via-[#6d28d9] to-[#db2777]",
    accent: "bg-purple-700",
    soft: "bg-purple-100 text-purple-700",
    ring: "ring-purple-500",
  },
  ocean: {
    hero: "from-[#082f49] via-[#0369a1] to-[#0d9488]",
    accent: "bg-sky-700",
    soft: "bg-sky-100 text-sky-700",
    ring: "ring-sky-500",
  },
  sunset: {
    hero: "from-[#431407] via-[#c2410c] to-[#e11d48]",
    accent: "bg-orange-700",
    soft: "bg-orange-100 text-orange-700",
    ring: "ring-orange-500",
  },
};

export default function ServiceMemberships() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    active: 0,
    expiringSoon: 0,
    revenue: 0,
  });
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customizing, setCustomizing] = useState(false);
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [managingPlans, setManagingPlans] = useState(false);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("membership-theme") as Theme) || "royal",
  );
  const [view, setView] = useState<View>(
    () => (localStorage.getItem("membership-view") as View) || "table",
  );
  const [compact, setCompact] = useState(
    () => localStorage.getItem("membership-compact") === "true",
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, options, planList] = await Promise.all([
        api<{ memberships: Membership[]; summary: Summary }>(
          "/service-center/memberships",
        ),
        api<{ customers: Customer[] }>(
          "/service-center/membership-options",
        ),
        api<{ plans: CatalogPlan[] }>("/service-center/membership-plans"),
      ]);
      setPlans(planList.plans);
      setMemberships(list.memberships);
      setSummary(list.summary);
      setCustomers(options.customers);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load memberships");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    localStorage.setItem("membership-theme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("membership-view", view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem("membership-compact", String(compact));
  }, [compact]);

  const visible = useMemo(() => {
    const term = query.toLowerCase().trim();
    return memberships.filter((m) =>
      `${m.customer.firstName} ${m.customer.lastName} ${m.plan.name} ${m.status}`
        .toLowerCase()
        .includes(term),
    );
  }, [memberships, query]);
  const previewPrice = Number(form.planPrice) || 0;
  const previewDays = Number(form.durationDays) || 0;
  const previewDiscount = Number(form.discountPercent) || 0;

  function create() {
    const start = new Date();
    setEditing(null);
    setForm({
      ...blank,
      customerId: customers[0]?.id ?? "",
      planName: "",
      startsAt: dateInput(start),
    });
    setOpen(true);
    setError("");
  }
  function edit(item: Membership) {
    setEditing(item);
    setForm({
      customerId: item.customerId,
      planId: item.planId ?? "",
      visitLimit: item.visitLimit != null ? String(item.visitLimit) : "",
      discountOnProducts: item.discountOnProducts,
      planName: item.planName,
      planPrice: String(item.planPrice ?? 0),
      durationDays: String(item.durationDays ?? 30),
      discountPercent: String(item.discountPercent ?? 0),
      startsAt: dateInput(item.startsAt),
      endsAt: dateInput(item.endsAt),
      status: item.status,
    });
    setOpen(true);
    setError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(
        editing
          ? `/service-center/memberships/${editing.id}`
          : "/service-center/memberships",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...form,
            planId: form.planId || null,
            visitLimit: form.visitLimit ? Number(form.visitLimit) : null,
            planPrice: Number(form.planPrice) || 0,
            durationDays: Number(form.durationDays) || 30,
            discountPercent: Number(form.discountPercent) || 0,
            startsAt: new Date(`${form.startsAt}T00:00:00`),
            endsAt: form.endsAt
              ? new Date(`${form.endsAt}T23:59:59`)
              : undefined,
          }),
        },
      );
      setOpen(false);
      setNotice(editing ? "Membership updated." : "Membership created.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save membership");
    } finally {
      setSaving(false);
    }
  }
  async function remove(item: Membership) {
    if (
      !confirm(
        `Delete ${item.customer.firstName} ${item.customer.lastName}'s ${item.plan.name} membership? Its payment records will also be removed.`,
      )
    )
      return;
    try {
      await api(`/service-center/memberships/${item.id}`, { method: "DELETE" });
      setNotice("Membership deleted.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete membership");
    }
  }
  async function renew(item: Membership) {
    if (!confirm(`Renew ${item.customer.firstName} ${item.customer.lastName}'s ${item.planName} for another ${item.durationDays} days?`)) return;
    try {
      await api(`/service-center/memberships/${item.id}/renew`, { method: "POST" });
      setNotice("Membership renewed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not renew");
    }
  }
  function pickPlan(id: string) {
    const plan = plans.find((p) => p.id === id);
    setForm(plan
      ? { ...form, planId: id, planName: plan.name, planPrice: String(plan.price), durationDays: String(plan.durationDays), discountPercent: String(plan.discountPercent), visitLimit: plan.visitLimit != null ? String(plan.visitLimit) : "", discountOnProducts: Boolean(plan.discountOnProducts), endsAt: "" }
      : { ...form, planId: "" });
  }
  async function checkIn(item: Membership) {
    try {
      await api(`/service-center/memberships/${item.id}/visits`, { method: "POST", body: JSON.stringify({}) });
      setNotice(`${item.customer.firstName} checked in.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check in");
    }
  }
  async function undoVisit(item: Membership) {
    const last = item.visits[0];
    if (!last || !confirm("Remove the most recent visit?")) return;
    try {
      await api(`/service-center/memberships/${item.id}/visits/${last.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove visit");
    }
  }
  const visitsText = (m: Membership) => (m.visitLimit != null ? `${m.visitsUsed} / ${m.visitLimit} visits` : `${m.visitsUsed} visit${m.visitsUsed === 1 ? "" : "s"} this term`);
  async function setStatus(item: Membership, status: Status) {
    try {
      await api(`/service-center/memberships/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <header
        className={`relative overflow-hidden rounded-[2rem] bg-linear-to-br ${themes[theme].hero} p-7 text-white shadow-2xl`}
      >
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[45px] border-white/10" />
        <div className="pointer-events-none absolute bottom-0 right-1/3 h-32 w-32 translate-y-1/2 rounded-full bg-white/10 blur-2xl" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-white/60">
              Service centre
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Memberships built around every guest.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/75">
              Manage customer plans, validity, discounts, payments and connected
              appointments.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <button
              onClick={() => setCustomizing(!customizing)}
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold backdrop-blur"
            >
              <LuPalette /> Customize
            </button>
            <button
              onClick={() => setManagingPlans(true)}
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold backdrop-blur"
            >
              <LuBadgeCheck /> Plans
            </button>
            <Button onClick={create} className="shrink-0">
              <LuPlus /> New membership
            </Button>
          </div>
        </div>
      </header>
      {customizing && (
        <section className="mt-4 flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <LuSettings2 /> Personalize workspace
            </h2>
            <p className="text-xs text-muted-foreground">
              Your choices are saved on this device.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2" aria-label="Color theme">
              {(["royal", "ocean", "sunset"] as Theme[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setTheme(item)}
                  aria-label={`${item} theme`}
                  className={`h-8 w-8 rounded-full bg-linear-to-br ${themes[item].hero} ${theme === item ? `ring-2 ring-offset-2 ${themes[item].ring}` : ""}`}
                />
              ))}
            </div>
            <div className="flex rounded-xl bg-muted p-1">
              <button
                onClick={() => setView("table")}
                className={`rounded-lg p-2 ${view === "table" ? "bg-card shadow" : "text-muted-foreground"}`}
                aria-label="Table view"
              >
                <LuTable2 />
              </button>
              <button
                onClick={() => setView("cards")}
                className={`rounded-lg p-2 ${view === "cards" ? "bg-card shadow" : "text-muted-foreground"}`}
                aria-label="Card view"
              >
                <LuGrid2X2 />
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={compact}
                onChange={(e) => setCompact(e.target.checked)}
              />{" "}
              Compact spacing
            </label>
          </div>
        </section>
      )}
      {error && <Message error text={error} />}
      {notice && <Message text={notice} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          index={0}
          icon={<LuUsers />}
          label="All memberships"
          value={summary.total}
        />
        <Metric index={1} icon={<LuBadgeCheck />} label="Active" value={summary.active} />
        <Metric
          index={2}
          icon={<LuCalendarClock />}
          label="Expiring in 30 days"
          value={summary.expiringSoon}
        />
        <Metric
          index={3}
          icon={<LuCircleDollarSign />}
          label="Paid revenue"
          value={money(summary.revenue)}
        />
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Customer memberships</h2>
            <p className="text-xs text-muted-foreground">
              Changes immediately flow into appointment eligibility and
              discounts.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-xl border bg-background px-3">
            <LuSearch className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memberships"
              className="h-10 bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        {loading ? (
          <div className="p-20 text-center">
            <LuLoaderCircle className="mx-auto animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-20 text-center text-sm text-muted-foreground">
            No memberships found.
          </div>
        ) : view === "cards" ? (
          <div
            className={`grid gap-4 ${compact ? "p-3 sm:grid-cols-2 xl:grid-cols-3" : "p-5 sm:grid-cols-2 xl:grid-cols-3"}`}
          >
            {visible.map((m) => (
              <article
                key={m.id}
                className="group relative overflow-hidden rounded-2xl border bg-background p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1.5 ${themes[theme].accent}`}
                />
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black ${themes[theme].soft}`}
                  >
                    {m.customer.firstName[0]}
                    {m.customer.lastName[0]}
                  </span>
                  <select
                    value={m.status}
                    onChange={(e) =>
                      void setStatus(m, e.target.value as Status)
                    }
                    className="rounded-full border bg-background px-2 py-1 text-[11px] font-bold"
                  >
                    {["ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  {m.status !== "CANCELLED" && (
                    <button onClick={() => void renew(m)} className="rounded-full border px-2 py-1 text-[11px] font-bold hover:bg-muted">Renew</button>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl border p-2 text-xs">
                  <span className="font-semibold">{visitsText(m)}</span>
                  <span className="flex gap-1.5">
                    <button onClick={() => void checkIn(m)} className="rounded-full bg-secondary px-3 py-1 font-bold text-white">Check in</button>
                    {m.visits.length > 0 && <button onClick={() => void undoVisit(m)} className="rounded-full border px-2 py-1 font-bold">Undo</button>}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold">
                  {m.customer.firstName} {m.customer.lastName}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {m.customer.phone ?? m.customer.email ?? "No contact details"}
                </p>
                <div className={`mt-4 rounded-xl p-3 ${themes[theme].soft}`}>
                  <p className="text-xs font-bold uppercase tracking-wide">
                    {m.plan.name}
                  </p>
                  <p className="mt-1 text-sm">
                    {m.plan.discountPercent}% savings · {m.plan.durationDays}{" "}
                    days
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Valid until</span>
                    <b className="mt-1 block">
                      {new Date(m.endsAt).toLocaleDateString()}
                    </b>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Activity</span>
                    <b className="mt-1 block">
                      {m._count.appointments} bookings
                    </b>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t pt-3">
                  <b className="text-sm">
                    {money(
                      m.payments
                        .filter((p) => p.status === "PAID")
                        .reduce((sum, p) => sum + Number(p.amount), 0),
                    )}{" "}
                    paid
                  </b>
                  <div className="flex">
                    <button
                      onClick={() => edit(m)}
                      aria-label="Edit membership"
                      className="rounded-lg p-2 text-secondary hover:bg-muted"
                    >
                      <LuPencil />
                    </button>
                    <button
                      onClick={() => void remove(m)}
                      aria-label="Delete membership"
                      className="rounded-lg p-2 text-destructive hover:bg-muted"
                    >
                      <LuTrash2 />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Validity</th>
                  <th className="px-5 py-3">Activity</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr
                    key={m.id}
                    className="border-t transition-colors hover:bg-muted/30"
                  >
                    <td className={compact ? "px-5 py-2.5" : "px-5 py-4"}>
                      <b>
                        {m.customer.firstName} {m.customer.lastName}
                      </b>
                      <p className="text-xs text-muted-foreground">
                        {m.customer.phone ??
                          m.customer.email ??
                          "No contact details"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <b>{m.plan.name}</b>
                      <p className="text-xs text-muted-foreground">
                        {m.plan.discountPercent}% discount ·{" "}
                        {money(Number(m.plan.price))}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <b>{new Date(m.startsAt).toLocaleDateString()}</b>
                      <p className="text-muted-foreground">
                        to {new Date(m.endsAt).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <b>{m._count.appointments} appointments</b>
                      <p className="text-muted-foreground">
                        {m.payments.length} payments ·{" "}
                        {money(
                          m.payments
                            .filter((p) => p.status === "PAID")
                            .reduce((sum, p) => sum + Number(p.amount), 0),
                        )}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={m.status}
                        onChange={(e) =>
                          void setStatus(m, e.target.value as Status)
                        }
                        className="rounded-lg border bg-background p-2 text-xs font-semibold"
                      >
                        {["ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"].map(
                          (s) => (
                            <option key={s}>{s}</option>
                          ),
                        )}
                      </select>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-semibold">{visitsText(m)}</span>
                        <button onClick={() => void checkIn(m)} className="rounded-full bg-secondary px-2 py-0.5 font-bold text-white">Check in</button>
                        {m.status !== "CANCELLED" && <button onClick={() => void renew(m)} className="rounded-full border px-2 py-0.5 font-bold">Renew</button>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => edit(m)}
                          aria-label="Edit membership"
                          className="p-2 text-secondary"
                        >
                          <LuPencil />
                        </button>
                        <button
                          onClick={() => void remove(m)}
                          aria-label="Delete membership"
                          className="p-2 text-destructive"
                        >
                          <LuTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {managingPlans && (
        <PlansModal plans={plans} onClose={() => setManagingPlans(false)} onChanged={load} />
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={save}
            className="w-full max-w-xl rounded-3xl bg-card p-6 shadow-2xl"
          >
            <p className="text-sm font-semibold text-purple-700">
              {editing ? "Edit membership" : "Enroll customer"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Membership details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Customer">
                <select
                  required
                  className="input"
                  value={form.customerId}
                  onChange={(e) =>
                    setForm({ ...form, customerId: e.target.value })
                  }
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plan">
                <select className="input" value={form.planId} onChange={(e) => pickPlan(e.target.value)}>
                  <option value="">Custom (one-off)</option>
                  {plans.filter((p) => p.isActive || p.id === form.planId).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {money(Number(p.price))} · {p.durationDays}d · {Number(p.discountPercent)}% off</option>
                  ))}
                </select>
              </Field>
              <Field label="Visit limit per term (blank = unlimited)">
                <input type="number" min="1" className="input" value={form.visitLimit} onChange={(e) => setForm({ ...form, visitLimit: e.target.value })} placeholder="e.g. 12" />
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.discountOnProducts} onChange={(e) => setForm({ ...form, discountOnProducts: e.target.checked })} /> Discount also applies to products
              </label>
              <Field label="Membership name">
                <input
                  required
                  className="input"
                  value={form.planName}
                  onChange={(e) =>
                    setForm({ ...form, planName: e.target.value, endsAt: "" })
                  }
                  placeholder="e.g. Gold monthly"
                />
              </Field>
              <Field label="Price">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={form.planPrice}
                  onChange={(e) => setForm({ ...form, planPrice: e.target.value })}
                />
              </Field>
              <Field label="Duration days">
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  className="input"
                  value={form.durationDays}
                  onChange={(e) => setForm({ ...form, durationDays: e.target.value, endsAt: "" })}
                />
              </Field>
              <Field label="Appointment discount %">
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input"
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                />
              </Field>
              <Field label="Start date">
                <input
                  required
                  type="date"
                  className="input"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm({ ...form, startsAt: e.target.value })
                  }
                />
              </Field>
              <Field label="End date (optional)">
                <input
                  type="date"
                  className="input"
                  min={form.startsAt}
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </Field>
              <Field label="Status">
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as Status })
                  }
                >
                  {["ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <div className="rounded-xl bg-purple-50 p-3 text-xs text-purple-900">
                <b>{form.planName || "Membership preview"}</b>
                <p className="mt-1">
                  {money(previewPrice)} · {previewDays || 0} days · {previewDiscount}% appointment discount
                </p>
              </div>
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
                className="flex items-center gap-2 rounded-xl bg-purple-800 px-4 py-2.5 font-bold text-white"
              >
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? "Save changes" : "Create membership"}
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
  label,
  value,
  index,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  index?: number;
}) {
  return <SharedStatCard index={index} icon={icon} label={label} value={value} />;
}
function PlansModal({ plans, onClose, onChanged }: { plans: CatalogPlan[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const empty = { name: "", price: "", durationDays: "30", discountPercent: "0", description: "", visitLimit: "", discountOnProducts: false };
  const [draft, setDraft] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setErr("");
    try {
      await api(editingId ? `/service-center/membership-plans/${editingId}` : "/service-center/membership-plans", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ ...draft, price: Number(draft.price) || 0, durationDays: Number(draft.durationDays) || 30, discountPercent: Number(draft.discountPercent) || 0, description: draft.description || null, visitLimit: draft.visitLimit ? Number(draft.visitLimit) : null }),
      });
      setDraft(empty);
      setEditingId(null);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save plan");
    }
  }
  async function toggle(plan: CatalogPlan) {
    try {
      await api(`/service-center/membership-plans/${plan.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !plan.isActive }) });
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update plan");
    }
  }
  async function remove(plan: CatalogPlan) {
    if (!confirm(`Delete the ${plan.name} plan?`)) return;
    try {
      await api(`/service-center/membership-plans/${plan.id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete plan");
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Membership plans</h2>
            <p className="text-xs text-muted-foreground">Define a plan once, sell it repeatedly. Editing a plan never changes members already on it.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">Close</button>
        </div>
        {err && <Message text={err} error />}
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Plan name"><input required className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Gold monthly" /></Field>
          <Field label="Price"><input required type="number" min="0" step="0.01" className="input" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></Field>
          <Field label="Duration (days)"><input required type="number" min="1" className="input" value={draft.durationDays} onChange={(e) => setDraft({ ...draft, durationDays: e.target.value })} /></Field>
          <Field label="Discount on services (%)"><input required type="number" min="0" max="100" step="0.01" className="input" value={draft.discountPercent} onChange={(e) => setDraft({ ...draft, discountPercent: e.target.value })} /></Field>
          <Field label="Visit limit per term (blank = unlimited)"><input type="number" min="1" className="input" value={draft.visitLimit} onChange={(e) => setDraft({ ...draft, visitLimit: e.target.value })} /></Field>
          <label className="flex items-center gap-2 pt-6 text-sm font-medium"><input type="checkbox" checked={draft.discountOnProducts} onChange={(e) => setDraft({ ...draft, discountOnProducts: e.target.checked })} /> Discount also applies to products</label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">{editingId ? "Save plan" : "Add plan"}</Button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(empty); }} className="rounded-lg border px-3 text-sm font-semibold">Cancel</button>}
          </div>
        </form>
        <ul className="mt-5 divide-y rounded-xl border">
          {plans.length === 0 && <li className="p-4 text-sm text-muted-foreground">No plans yet.</li>}
          {plans.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className={`font-semibold ${p.isActive ? "" : "text-muted-foreground line-through"}`}>{p.name}</p>
                <p className="text-xs text-muted-foreground">{money(Number(p.price))} · {p.durationDays} days · {Number(p.discountPercent)}% off{p.discountOnProducts ? " (incl. products)" : ""} · {p.visitLimit ? `${p.visitLimit} visits` : "unlimited visits"} · {p._count?.memberships ?? 0} member(s)</p>
              </div>
              <div className="flex gap-1.5 text-xs font-semibold">
                <button onClick={() => { setEditingId(p.id); setDraft({ name: p.name, price: String(p.price), durationDays: String(p.durationDays), discountPercent: String(p.discountPercent), description: p.description ?? "", visitLimit: p.visitLimit != null ? String(p.visitLimit) : "", discountOnProducts: Boolean(p.discountOnProducts) }); }} className="rounded-lg border px-2 py-1">Edit</button>
                <button onClick={() => void toggle(p)} className="rounded-lg border px-2 py-1">{p.isActive ? "Deactivate" : "Activate"}</button>
                <button onClick={() => void remove(p)} className="rounded-lg border px-2 py-1 text-destructive">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
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
