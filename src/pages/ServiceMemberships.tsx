import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LuBadgeCheck,
  LuCalendarDays,
  LuCalendarClock,
  LuChevronLeft,
  LuChevronRight,
  LuCircleDollarSign,
  LuGrid2X2,
  LuLayers,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTable2,
  LuTrash2,
  LuUsers,
  LuWallet,
} from "react-icons/lu";
import { api } from "@/lib/api";
import SharedStatCard from "@/components/ui/StatCard";
import { useToast } from "@/components/ui/Toast";
import PageBanner from "@/components/ui/PageBanner";
import ActionButton from "@/components/ui/ActionButton";
import ModalShell from "@/components/ui/ModalShell";

type Status = "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELLED";
type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  serviceGroup: CustomerGroup | null;
};
type CustomerGroup = { id: string; name: string; description: string | null; isActive: boolean; _count?: { customers: number } };
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
type PaymentMethod = { id: string; name: string; requiresReference?: boolean };
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
  planPrice: "",
  durationDays: "",
  discountPercent: "",
  startsAt: "",
  endsAt: "",
  status: "ACTIVE",
};
const dateInput = (value: Date | string) =>
  new Date(value).toISOString().slice(0, 10);
const money = (value: number) =>
  `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
type View = "table" | "cards";
type WalletTab = "payment" | "plan" | "history";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function calendarWeeks(year: number, month: number): (number | null)[][] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function dateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysRemaining(m: Membership) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(m.endsAt); end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86_400_000));
}

export default function ServiceMemberships() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    active: 0,
    expiringSoon: 0,
    revenue: 0,
  });
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [attendanceFor, setAttendanceFor] = useState<Membership | null>(null);
  const [walletFor, setWalletFor] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const setNotice = (message: string) => { if (message) toast.success(message); };
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [managingPlans, setManagingPlans] = useState(false);
  const [managingGroups, setManagingGroups] = useState(false);
  const [view, setView] = useState<View>(
    () => (localStorage.getItem("membership-view") as View) || "table",
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, options, planList] = await Promise.all([
        api<{ memberships: Membership[]; summary: Summary }>(
          `/service-center/memberships${groupFilter ? `?groupId=${groupFilter}` : ""}`,
        ),
        api<{ customers: Customer[]; groups: CustomerGroup[]; paymentMethods: PaymentMethod[] }>(
          "/service-center/membership-options",
        ),
        api<{ plans: CatalogPlan[] }>("/service-center/membership-plans"),
      ]);
      setPlans(planList.plans);
      setMemberships(list.memberships);
      setSummary(list.summary);
      setCustomers(options.customers);
      setGroups(options.groups);
      setPaymentMethods(options.paymentMethods);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load memberships");
    } finally {
      setLoading(false);
    }
  }, [groupFilter]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    localStorage.setItem("membership-view", view);
  }, [view]);

  const visible = useMemo(() => {
    const term = query.toLowerCase().trim();
    return memberships.filter((m) =>
      `${m.customer.firstName} ${m.customer.lastName} ${m.plan.name} ${m.status}`
        .concat(` ${m.customer.serviceGroup?.name ?? ""}`)
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
  function pickPlan(id: string) {
    const plan = plans.find((p) => p.id === id);
    setForm(plan
      ? { ...form, planId: id, planName: plan.name, planPrice: String(plan.price), durationDays: String(plan.durationDays), discountPercent: String(plan.discountPercent), visitLimit: plan.visitLimit != null ? String(plan.visitLimit) : "", discountOnProducts: Boolean(plan.discountOnProducts), endsAt: "" }
      : { ...form, planId: "" });
  }
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

  const paidTotal = (m: Membership) => m.payments.filter((p) => p.status === "PAID").reduce((sum, p) => sum + Number(p.amount), 0);
  const statusSelect = (m: Membership, className = "") => (
    <select
      value={m.status}
      onChange={(e) => void setStatus(m, e.target.value as Status)}
      className={"border bg-background p-2 text-xs font-semibold " + className}
    >
      {["ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"].map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Service centre" title="Memberships" />
      {error && <Message error text={error} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric index={0} icon={<LuUsers />} label="All memberships" value={summary.total} />
        <Metric index={1} icon={<LuBadgeCheck />} label="Active" value={summary.active} />
        <Metric index={2} icon={<LuCalendarClock />} label="Expiring in 30 days" value={summary.expiringSoon} />
        <Metric index={3} icon={<LuCircleDollarSign />} label="Paid revenue" value={money(summary.revenue)} />
      </section>
      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Customer memberships</h2>
            <p className="text-xs text-muted-foreground">Changes immediately flow into appointment eligibility and discounts.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search memberships"
                className="w-56 border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">All groups</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="flex border bg-background">
              <button onClick={() => setView("table")} aria-label="Table view" title="Table view" className={"p-2.5 " + (view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                <LuTable2 />
              </button>
              <button onClick={() => setView("cards")} aria-label="Card view" title="Card view" className={"p-2.5 " + (view === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                <LuGrid2X2 />
              </button>
            </div>
            <ActionButton tone="neutral" icon={<LuLayers />} onClick={() => setManagingGroups(true)}>Groups</ActionButton>
            <ActionButton tone="neutral" icon={<LuBadgeCheck />} onClick={() => setManagingPlans(true)}>Plans</ActionButton>
            <ActionButton tone="primary" icon={<LuPlus />} onClick={create}>New membership</ActionButton>
          </div>
        </div>
        {loading ? (
          <div className="p-20 text-center">
            <LuLoaderCircle className="mx-auto animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-20 text-center text-sm text-muted-foreground">No memberships found.</div>
        ) : view === "cards" ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((m) => (
              <article key={m.id} className="relative overflow-hidden border border-t-4 border-t-accent bg-background p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-12 w-12 items-center justify-center bg-secondary/10 text-lg font-black text-secondary">
                    {m.customer.firstName[0]}
                    {m.customer.lastName?.[0]}
                  </span>
                  {statusSelect(m, "py-1 text-[11px]")}
                </div>
                <h3 className="mt-4 text-lg font-bold">
                  {m.customer.firstName} {m.customer.lastName}
                </h3>
                <p className="text-xs text-muted-foreground">{m.customer.phone ?? m.customer.email ?? "No contact details"}</p>
                {m.customer.serviceGroup && <p className="mt-1 text-xs font-semibold text-secondary">{m.customer.serviceGroup.name}</p>}
                <div className="mt-4 bg-secondary/10 p-3 text-secondary">
                  <p className="text-xs font-bold uppercase tracking-wide">{m.plan.name}</p>
                  <p className="mt-1 text-sm">
                    {m.plan.discountPercent}% savings · {m.plan.durationDays} days
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Valid until</span>
                    <b className="mt-1 block">{new Date(m.endsAt).toLocaleDateString()}</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Remaining</span>
                    <b className="mt-1 block">{daysRemaining(m)} days</b>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t pt-3">
                  <b className="text-sm">{money(paidTotal(m))} paid</b>
                  <div className="flex gap-1.5">
                    <ActionButton tone="neutral" icon={<LuCalendarDays />} title="Attendance" onClick={() => setAttendanceFor(m)} />
                    <ActionButton tone="neutral" icon={<LuWallet />} title="Payments and plan" onClick={() => setWalletFor(m)} />
                    <ActionButton tone="neutral" icon={<LuPencil />} title="Edit membership" onClick={() => edit(m)} />
                    <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete membership" onClick={() => void remove(m)} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Plan</th>
                  <th className="px-5 py-3 font-bold">Validity</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y [&>tr:nth-child(even)]:bg-muted/30">
                {visible.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-4">
                      <b>
                        {m.customer.firstName} {m.customer.lastName}
                      </b>
                      <p className="text-xs text-muted-foreground">{m.customer.phone ?? m.customer.email ?? "No contact details"}</p>
                      {m.customer.serviceGroup && <p className="mt-1 text-xs font-semibold text-secondary">{m.customer.serviceGroup.name}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <b>{m.plan.name}</b>
                      <p className="text-xs text-muted-foreground">
                        {m.plan.discountPercent}% discount · {money(Number(m.plan.price))}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <b>{new Date(m.startsAt).toLocaleDateString()}</b>
                      <p className="text-muted-foreground">to {new Date(m.endsAt).toLocaleDateString()}</p>
                      <p className="mt-1 font-semibold text-secondary">{daysRemaining(m)} days remaining</p>
                    </td>
                    <td className="px-5 py-4">
                      {statusSelect(m)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <ActionButton tone="neutral" icon={<LuCalendarDays />} title="Attendance" onClick={() => setAttendanceFor(m)} />
                        <ActionButton tone="neutral" icon={<LuWallet />} title="Payments and plan" onClick={() => setWalletFor(m)} />
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit membership" onClick={() => edit(m)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete membership" onClick={() => void remove(m)} />
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
      {managingGroups && (
        <GroupsModal groups={groups} onClose={() => setManagingGroups(false)} onChanged={load} />
      )}
      {attendanceFor && (
        <MembershipAttendanceModal membership={attendanceFor} onClose={() => setAttendanceFor(null)} onChanged={load} />
      )}
      {walletFor && (
        <MembershipWalletModal membership={walletFor} plans={plans} paymentMethods={paymentMethods} onClose={() => setWalletFor(null)} onChanged={load} />
      )}
      {open && (
        <ModalShell
          size="lg"
          kicker={editing ? "Edit membership" : "Enroll customer"}
          title="Membership details"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="membership-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? "Save changes" : "Create membership"}
              </button>
            </>
          }
        >
          <form id="membership-form" onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Customer" required>
              <select
                required
                className="input"
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              >
                <option value="" disabled>Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}{c.serviceGroup ? ` - ${c.serviceGroup.name}` : ""}
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
            <label className="flex items-center justify-between border bg-background px-3 py-2.5 text-sm font-medium sm:self-end">
              Discount also applies to products
              <input type="checkbox" className="size-4 accent-secondary" checked={form.discountOnProducts} onChange={(e) => setForm({ ...form, discountOnProducts: e.target.checked })} />
            </label>
            <Field label="Membership name" required>
              <input
                required
                className="input"
                value={form.planName}
                onChange={(e) => setForm({ ...form, planName: e.target.value, endsAt: "" })}
                placeholder="e.g. Gold monthly"
              />
            </Field>
            <Field label="Price" required>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                className="input"
                placeholder="e.g. 5000"
                value={form.planPrice}
                onChange={(e) => setForm({ ...form, planPrice: e.target.value })}
              />
            </Field>
            <Field label="Duration days" required>
              <input
                required
                type="number"
                min="1"
                step="1"
                className="input"
                placeholder="e.g. 30"
                value={form.durationDays}
                onChange={(e) => setForm({ ...form, durationDays: e.target.value, endsAt: "" })}
              />
            </Field>
            <Field label="Appointment discount %">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="input"
                placeholder="e.g. 10 (blank = none)"
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
              />
            </Field>
            <Field label="Start date" required>
              <input
                required
                type="date"
                className="input"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
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
                onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
              >
                {["ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <div className="border border-l-4 border-l-accent bg-muted/40 p-3 text-xs">
              <b>{form.planName || "Membership preview"}</b>
              <p className="mt-1">
                {money(previewPrice)} · {previewDays || 0} days · {previewDiscount}% appointment discount
              </p>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}

function MembershipAttendanceModal({ membership, onClose, onChanged }: { membership: Membership; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [markDate, setMarkDate] = useState(dateInput(now));
  const [saving, setSaving] = useState(false);
  const weeks = useMemo(() => calendarWeeks(year, month), [year, month]);
  const visitDays = useMemo(() => new Set(membership.visits.map((v) => dateKey(v.visitedAt))), [membership.visits]);
  const start = new Date(membership.startsAt); start.setHours(0, 0, 0, 0);
  const end = new Date(membership.endsAt); end.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  let eligiblePast = 0;
  for (let d = new Date(Math.max(start.getTime(), new Date(year, month - 1, 1).getTime())); d <= today && d <= end && d.getMonth() === month - 1; d = addDays(d, 1)) eligiblePast += 1;
  const attended = [...visitDays].filter((k) => k.startsWith(`${year}-${String(month).padStart(2, "0")}`)).length;
  const missed = Math.max(0, eligiblePast - attended);
  const attendance = eligiblePast ? Math.round((attended / eligiblePast) * 100) : 0;

  function shiftMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  }

  async function markAttendance(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/service-center/memberships/${membership.id}/visits`, { method: "POST", body: JSON.stringify({ visitedAt: new Date(`${markDate}T12:00:00`) }) });
      toast.success("Attendance marked.");
      await onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark attendance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell size="xl" kicker="Membership attendance" title={`${membership.customer.firstName} ${membership.customer.lastName}`} subtitle={`${membership.planName} - expires ${new Date(membership.endsAt).toLocaleDateString()}`} onClose={onClose}>
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold">{monthLabel}</h3>
            <p className="text-xs text-muted-foreground">Past unmarked eligible days count as missed. Future days are ignored.</p>
          </div>
          <div className="flex gap-2">
            <ActionButton tone="neutral" icon={<LuChevronLeft />} title="Previous month" onClick={() => shiftMonth(-1)} />
            <ActionButton tone="neutral" icon={<LuChevronRight />} title="Next month" onClick={() => shiftMonth(1)} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Mini label="Attended days" value={String(attended)} />
          <Mini label="Missed days" value={String(missed)} />
          <Mini label="Attendance" value={`${attendance}%`} />
        </div>
        <div className="mt-5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => <div key={label}>{label}</div>)}
        </div>
        <div className="mt-1.5 space-y-1.5">
          {weeks.map((week, i) => (
            <div key={i} className="grid grid-cols-7 gap-1.5">
              {week.map((day, j) => {
                if (day === null) return <div key={j} />;
                const date = new Date(year, month - 1, day);
                const key = dateInput(date);
                const inTerm = date >= start && date <= end;
                const isFuture = date > today;
                const present = visitDays.has(key);
                const missedDay = inTerm && !isFuture && !present;
                return (
                  <div key={j} className={`min-h-20 border p-2 text-center text-sm ${present ? "border-success/50 bg-success/10 text-success" : missedDay ? "border-destructive/40 bg-destructive/5 text-destructive" : inTerm ? "bg-card" : "bg-muted/30 text-muted-foreground"}`}>
                    <b>{day}</b>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wide">{present ? "Attended" : missedDay ? "Missed" : inTerm ? "Pending" : ""}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <form onSubmit={markAttendance} className="mt-5 flex flex-wrap items-end gap-3 border-t pt-4">
          <Field label="Mark attendance for">
            <input type="date" className="input" value={markDate} max={dateInput(now)} onChange={(e) => setMarkDate(e.target.value)} />
          </Field>
          <button disabled={saving} className="h-10 bg-primary px-5 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">{saving ? "Saving..." : "Mark attended"}</button>
        </form>
      </div>
    </ModalShell>
  );
}

function MembershipWalletModal({ membership, plans, paymentMethods, onClose, onChanged }: { membership: Membership; plans: CatalogPlan[]; paymentMethods: PaymentMethod[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [tab, setTab] = useState<WalletTab>("payment");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [planId, setPlanId] = useState(membership.planId ?? "");
  const [saving, setSaving] = useState(false);
  const selectedPlan = plans.find((p) => p.id === (planId || membership.planId));
  const amount = Number(membership.planPrice);

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentMethodId) { toast.error("Choose a payment method"); return; }
    setSaving(true);
    try {
      await api("/service-center/membership-payments", { method: "POST", body: JSON.stringify({ membershipId: membership.id, paymentMethodId, amount, paidAt: new Date(paidAt), reference: reference || null }) });
      toast.success("Membership payment recorded.");
      await onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record payment");
    } finally {
      setSaving(false);
    }
  }

  async function switchPlan(event: FormEvent) {
    event.preventDefault();
    if (!planId) { toast.error("Choose a plan"); return; }
    setSaving(true);
    try {
      await api(`/service-center/memberships/${membership.id}`, { method: "PATCH", body: JSON.stringify({ planId }) });
      toast.success("Membership plan updated.");
      await onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell size="lg" kicker="Membership wallet" title={`${membership.customer.firstName} ${membership.customer.lastName}`} subtitle={`${membership.planName} - full payment only`} onClose={onClose}>
      <div className="p-5">
        <div className="flex border bg-background">
          {(["payment", "plan", "history"] as WalletTab[]).map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{item}</button>
          ))}
        </div>
        {tab === "payment" && (
          <form onSubmit={recordPayment} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Mini label="Locked amount" value={money(amount)} />
            <Field label="Payment method" required>
              <select required className="input" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                <option value="">Choose method</option>
                {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Reference"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction code" /></Field>
            <Field label="Paid at"><input type="datetime-local" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
            <div className="sm:col-span-2"><button disabled={saving} className="bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">{saving ? "Saving..." : "Record full payment"}</button></div>
          </form>
        )}
        {tab === "plan" && (
          <form onSubmit={switchPlan} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Current plan"><input className="input" value={membership.planName} disabled /></Field>
            <Field label="Switch to" required>
              <select required className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Choose plan</option>
                {plans.filter((p) => p.isActive || p.id === membership.planId).map((p) => <option key={p.id} value={p.id}>{p.name} - {money(Number(p.price))}</option>)}
              </select>
            </Field>
            {selectedPlan && <div className="sm:col-span-2 border border-l-4 border-l-accent bg-muted/30 p-3 text-sm">{selectedPlan.durationDays} days - {Number(selectedPlan.discountPercent)}% discount - {money(Number(selectedPlan.price))}</div>}
            <div className="sm:col-span-2"><button disabled={saving || !planId} className="bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">{saving ? "Saving..." : "Switch plan"}</button></div>
          </form>
        )}
        {tab === "history" && (
          <div className="mt-5 divide-y border">
            {membership.payments.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No payments recorded.</p> : membership.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div><p className="font-semibold">{p.paymentMethod.name}</p><p className="text-xs text-muted-foreground">{p.paidAt ? new Date(p.paidAt).toLocaleString() : "No payment date"}{p.reference ? ` - ${p.reference}` : ""}</p></div>
                <b>{money(Number(p.amount))}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
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
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
function PlansModal({ plans, onClose, onChanged }: { plans: CatalogPlan[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const empty = { name: "", price: "", durationDays: "", discountPercent: "", description: "", visitLimit: "", discountOnProducts: false };
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
    <ModalShell
      size="lg"
      kicker="Service centre"
      title="Membership plans"
      subtitle="Define a plan once, sell it repeatedly. Editing a plan never changes members already on it."
      onClose={onClose}
    >
      <div className="p-5">
        {err && <Message text={err} error />}
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Plan name" required><input required className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Gold monthly" /></Field>
          <Field label="Price" required><input required type="number" min="0" step="0.01" className="input" placeholder="e.g. 5000" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></Field>
          <Field label="Duration (days)" required><input required type="number" min="1" className="input" placeholder="e.g. 30" value={draft.durationDays} onChange={(e) => setDraft({ ...draft, durationDays: e.target.value })} /></Field>
          <Field label="Discount on services (%)"><input type="number" min="0" max="100" step="0.01" className="input" placeholder="e.g. 10 (blank = none)" value={draft.discountPercent} onChange={(e) => setDraft({ ...draft, discountPercent: e.target.value })} /></Field>
          <Field label="Visit limit per term (blank = unlimited)"><input type="number" min="1" className="input" placeholder="e.g. 12" value={draft.visitLimit} onChange={(e) => setDraft({ ...draft, visitLimit: e.target.value })} /></Field>
          <label className="flex items-center justify-between border bg-background px-3 py-2.5 text-sm font-medium sm:self-end">
            Discount also applies to products
            <input type="checkbox" className="size-4 accent-secondary" checked={draft.discountOnProducts} onChange={(e) => setDraft({ ...draft, discountOnProducts: e.target.checked })} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110">{editingId ? "Save plan" : "Add plan"}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(empty); }} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>}
          </div>
        </form>
        <ul className="mt-5 divide-y border">
          {plans.length === 0 && <li className="p-4 text-sm text-muted-foreground">No plans yet.</li>}
          {plans.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-accent p-3 text-sm">
              <div>
                <p className={`font-semibold ${p.isActive ? "" : "text-muted-foreground line-through"}`}>{p.name}</p>
                <p className="text-xs text-muted-foreground">{money(Number(p.price))} · {p.durationDays} days · {Number(p.discountPercent)}% off{p.discountOnProducts ? " (incl. products)" : ""} · {p.visitLimit ? `${p.visitLimit} visits` : "unlimited visits"} · {p._count?.memberships ?? 0} member(s)</p>
              </div>
              <div className="flex gap-1.5">
                <ActionButton tone="neutral" icon={<LuPencil />} title="Edit plan" onClick={() => { setEditingId(p.id); setDraft({ name: p.name, price: String(p.price), durationDays: String(p.durationDays), discountPercent: String(p.discountPercent), description: p.description ?? "", visitLimit: p.visitLimit != null ? String(p.visitLimit) : "", discountOnProducts: Boolean(p.discountOnProducts) }); }} />
                <ActionButton tone="neutral" onClick={() => void toggle(p)}>{p.isActive ? "Deactivate" : "Activate"}</ActionButton>
                <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete plan" onClick={() => void remove(p)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}
function GroupsModal({ groups, onClose, onChanged }: { groups: CustomerGroup[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const empty = { name: "", description: "" };
  const [draft, setDraft] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setErr("");
    try {
      await api(editingId ? `/service-center/customer-groups/${editingId}` : "/service-center/customer-groups", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ name: draft.name, description: draft.description || null }),
      });
      setDraft(empty);
      setEditingId(null);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save group");
    }
  }
  async function toggle(group: CustomerGroup) {
    try {
      await api(`/service-center/customer-groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !group.isActive }) });
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update group");
    }
  }
  async function remove(group: CustomerGroup) {
    if (!confirm(`Delete ${group.name}?`)) return;
    try {
      await api(`/service-center/customer-groups/${group.id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete group");
    }
  }
  return (
    <ModalShell size="md" kicker="Service centre" title="Customer groups" subtitle="Use groups to track corporate, gym or family memberships. Discounts still come from membership plans." onClose={onClose}>
      <div className="p-5">
        {err && <Message text={err} error />}
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Group name" required><input required className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. ABC Gym Group" /></Field>
          <div className="flex items-end">
            <button type="submit" className="h-10 bg-primary px-5 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110">{editingId ? "Save" : "Add"}</button>
          </div>
          <Field label="Notes" className="sm:col-span-2"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional internal note" /></Field>
        </form>
        <ul className="mt-5 divide-y border">
          {groups.length === 0 && <li className="p-4 text-sm text-muted-foreground">No groups yet.</li>}
          {groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-accent p-3 text-sm">
              <div>
                <p className={`font-semibold ${g.isActive ? "" : "text-muted-foreground line-through"}`}>{g.name}</p>
                <p className="text-xs text-muted-foreground">{g._count?.customers ?? 0} customer{(g._count?.customers ?? 0) === 1 ? "" : "s"}{g.description ? ` - ${g.description}` : ""}</p>
              </div>
              <div className="flex gap-1.5">
                <ActionButton tone="neutral" icon={<LuPencil />} title="Edit group" onClick={() => { setEditingId(g.id); setDraft({ name: g.name, description: g.description ?? "" }); }} />
                <ActionButton tone="neutral" onClick={() => void toggle(g)}>{g.isActive ? "Deactivate" : "Activate"}</ActionButton>
                <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete group" onClick={() => void remove(g)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}
function Field({ label, required, children, className }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm font-medium ${className ?? ""}`}>
      <span className="mb-1.5 block">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}
function Message({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div
      className={`mt-4 border p-3 text-sm ${error ? "border-destructive/25 bg-destructive/10 text-destructive" : "border-success/25 bg-success/10 text-success"}`}
    >
      {text}
    </div>
  );
}
