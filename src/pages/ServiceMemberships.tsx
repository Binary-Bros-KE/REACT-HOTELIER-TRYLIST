import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LuBadgeCheck,
  LuCalendarDays,
  LuCalendarClock,
  LuChevronLeft,
  LuChevronRight,
  LuCircleDollarSign,
  LuLayers,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuSearch,
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
import SearchableSelect from "@/components/ui/SearchableSelect";
import { cn } from "@/lib/utils";

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
  recordPayment: boolean;
  paymentMethodId: string;
  paymentReference: string;
  groupId: string;
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
  recordPayment: true,
  paymentMethodId: "",
  paymentReference: "",
  groupId: "",
};
// Local calendar date, not the UTC one — a membership's startsAt/endsAt are
// stored as exact instants (e.g. local midnight, which for a tenant east of
// UTC is still the previous day in UTC). toISOString() always reports the
// UTC date, so it silently showed Aug 31 for a membership that every other
// view (toLocaleDateString, used everywhere else in this file) correctly
// showed as Sep 1. Reading the Date object's own local fields matches how
// <input type="date"> values get turned back into Dates on save.
const dateInput = (value: Date | string) => {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const money = (value: number) =>
  `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
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

// Same local-date rule as dateInput — visit matching must agree with it.
const dateKey = dateInput;

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
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [open, setOpen] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState(false);
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

  const visible = useMemo(() => {
    const term = query.toLowerCase().trim();
    return memberships
      .filter((m) => !statusFilter || m.status === statusFilter)
      .filter((m) =>
        `${m.customer.firstName} ${m.customer.lastName} ${m.plan.name} ${m.status}`
          .concat(` ${m.customer.serviceGroup?.name ?? ""}`)
          .toLowerCase()
          .includes(term),
      );
  }, [memberships, query, statusFilter]);
  const previewPrice = Number(form.planPrice) || 0;
  const previewDays = Number(form.durationDays) || 0;
  const previewDiscount = Number(form.discountPercent) || 0;
  // A plan-backed membership's name/price/duration/discount/visit limit
  // come straight from the plan — the server re-pins them from there no
  // matter what's submitted, so editing them here would silently do
  // nothing (or worse, look changed locally and drift from what's actually
  // saved). Only a Custom (one-off) membership leaves them free to type.
  const lockedToPlan = Boolean(form.planId);
  const selectedPaymentMethod = paymentMethods.find((m) => m.id === form.paymentMethodId);

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
      recordPayment: false,
      paymentMethodId: "",
      paymentReference: "",
      groupId: item.customer.serviceGroup?.id ?? "",
    });
    setOpen(true);
    setError("");
  }
  function pickCustomer(id: string) {
    const customer = customers.find((c) => c.id === id);
    setForm((f) => ({ ...f, customerId: id, groupId: customer?.serviceGroup?.id ?? "" }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await api<{ membership: Membership }>(
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
      // The service group lives on the customer, not the membership — but
      // staff shouldn't have to leave this form and go edit the customer
      // separately just to put them in a group, so it's synced from here.
      const customer = customers.find((c) => c.id === form.customerId);
      if (form.customerId && form.groupId !== (customer?.serviceGroup?.id ?? "")) {
        await api(`/customers/${form.customerId}`, {
          method: "PATCH",
          body: JSON.stringify({ serviceGroupId: form.groupId || null }),
        });
      }
      // Capturing the first payment right here — rather than leaving staff to
      // hit "Record Payment" afterward expecting it to extend the term it
      // just granted — is what keeps every *later* payment an unambiguous
      // renewal (see the payment-recording route's priorPaidCount check).
      let paymentRecorded = false;
      if (!editing && form.recordPayment && form.paymentMethodId) {
        await api("/service-center/membership-payments", {
          method: "POST",
          body: JSON.stringify({
            membershipId: result.membership.id,
            paymentMethodId: form.paymentMethodId,
            reference: form.paymentReference || undefined,
            status: "PAID",
          }),
        });
        paymentRecorded = true;
      }
      setOpen(false);
      setNotice(
        editing
          ? "Membership updated."
          : paymentRecorded
            ? "Membership created and first payment recorded."
            : "Membership created.",
      );
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
    const wasPaused = item.status === "PAUSED";
    try {
      const { membership } = await api<{ membership: Membership }>(`/service-center/memberships/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      // Resuming from a pause pushes endsAt out by however long it was
      // paused (see the NODE route) - surfacing that here so it doesn't look
      // like the date silently moved for no reason.
      if (wasPaused && status === "ACTIVE") {
        toast.success(`Resumed — membership now runs through ${new Date(membership.endsAt).toLocaleDateString()} (paused time added back).`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status");
    }
  }

  // Active = green, Paused = amber, Expired/Cancelled = red (cancelled a
  // touch muted, since it was a deliberate stop rather than simply lapsing).
  const statusStyles: Record<Status, string> = {
    ACTIVE: "border-success/40 bg-success/10 text-success",
    PAUSED: "border-warning/40 bg-warning/10 text-warning",
    EXPIRED: "border-destructive/40 bg-destructive/10 text-destructive",
    CANCELLED: "border-destructive/30 bg-destructive/5 text-destructive/80",
  };
  const statusSelect = (m: Membership, className = "") => (
    <select
      value={m.status}
      onChange={(e) => void setStatus(m, e.target.value as Status)}
      className={cn("border p-2 text-xs font-bold uppercase tracking-wide", statusStyles[m.status], className)}
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
        <div className="flex flex-wrap items-center justify-end gap-2 border-b p-4">
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
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | "")} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All statuses</option>
            {(["ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"] as Status[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ActionButton tone="neutral" icon={<LuLayers />} onClick={() => setManagingGroups(true)}>Groups</ActionButton>
          <ActionButton tone="neutral" icon={<LuBadgeCheck />} onClick={() => setManagingPlans(true)}>Plans</ActionButton>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={create}>New membership</ActionButton>
        </div>
        {loading ? (
          <div className="p-20 text-center">
            <LuLoaderCircle className="mx-auto animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-20 text-center text-sm text-muted-foreground">No memberships found.</div>
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
      {quickCustomer && (
        <QuickCustomerModal
          onClose={() => setQuickCustomer(false)}
          onCreated={(c) => {
            setCustomers((cur) => [...cur, c].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));
            setForm((f) => ({ ...f, customerId: c.id, groupId: c.serviceGroup?.id ?? "" }));
            setQuickCustomer(false);
          }}
        />
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
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    value={form.customerId}
                    onChange={pickCustomer}
                    placeholder="Select customer"
                    searchPlaceholder="Search customers…"
                    emptyText="No customers match."
                    options={customers.map((c) => ({
                      value: c.id,
                      label: `${c.firstName} ${c.lastName}`.trim(),
                      hint: c.serviceGroup?.name ?? undefined,
                      keywords: c.phone ?? undefined,
                    }))}
                  />
                </div>
                <ActionButton tone="neutral" icon={<LuPlus />} title="Create a new customer without leaving this form" onClick={() => setQuickCustomer(true)} className="h-10 shrink-0" />
              </div>
            </Field>
            <Field label="Service group (optional)">
              <select className="input" value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
                <option value="">No group</option>
                {groups.filter((g) => g.isActive || g.id === form.groupId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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
            {lockedToPlan && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                These come from the plan and can't be typed over here — switch to a different plan (from the membership's wallet, once saved) or edit the plan itself to change them. Pick "Custom (one-off)" above to set them freely instead.
              </p>
            )}
            <Field label="Visit limit per term (blank = unlimited)">
              <input type="number" min="1" disabled={lockedToPlan} className="input disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground" value={form.visitLimit} onChange={(e) => setForm({ ...form, visitLimit: e.target.value })} placeholder="e.g. 12" />
            </Field>
            <label className={cn("flex items-center justify-between border bg-background px-3 py-2.5 text-sm font-medium sm:self-end", lockedToPlan && "bg-muted/50 text-muted-foreground")}>
              Discount also applies to products
              <input type="checkbox" disabled={lockedToPlan} className="size-4 accent-secondary disabled:cursor-not-allowed" checked={form.discountOnProducts} onChange={(e) => setForm({ ...form, discountOnProducts: e.target.checked })} />
            </label>
            <Field label="Membership name" required>
              <input
                required
                disabled={lockedToPlan}
                className="input disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground"
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
                disabled={lockedToPlan}
                className="input disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground"
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
                disabled={lockedToPlan}
                className="input disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground"
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
                disabled={lockedToPlan}
                className="input disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground"
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
            {!editing && (
              <label className="flex items-center justify-between border bg-background px-3 py-2.5 text-sm font-medium sm:col-span-2">
                Record first payment now
                <input
                  type="checkbox"
                  className="size-4 accent-secondary"
                  checked={form.recordPayment}
                  onChange={(e) => setForm({ ...form, recordPayment: e.target.checked, paymentMethodId: e.target.checked ? form.paymentMethodId : "", paymentReference: e.target.checked ? form.paymentReference : "" })}
                />
              </label>
            )}
            {!editing && form.recordPayment && (
              <>
                <Field label="Payment method" required>
                  <select required className="input" value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}>
                    <option value="">Choose method</option>
                    {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Reference" required={selectedPaymentMethod?.requiresReference}>
                  <input
                    required={selectedPaymentMethod?.requiresReference}
                    className="input"
                    value={form.paymentReference}
                    onChange={(e) => setForm({ ...form, paymentReference: e.target.value })}
                    placeholder="Transaction code"
                  />
                </Field>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  This settles the term being granted now — it won't add extra time. Every payment recorded after this one extends the membership by a full term.
                </p>
              </>
            )}
            {!editing && !form.recordPayment && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                No payment will be recorded — this membership is created on credit. Record its first payment later from the membership's wallet.
              </p>
            )}
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
  // A day only counts as eligible-to-be-missed once it's actually over —
  // today isn't "missed" yet just because it hasn't been marked, it's
  // still in progress (d < today, not <=).
  let eligiblePast = 0;
  for (let d = new Date(Math.max(start.getTime(), new Date(year, month - 1, 1).getTime())); d < today && d <= end && d.getMonth() === month - 1; d = addDays(d, 1)) eligiblePast += 1;
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
                // Today counts as "not over yet", same as a real future day —
                // it only becomes eligible to show as Missed once it's past.
                const isFuture = date >= today;
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
  // The membership's very first payment just settles the term it was
  // enrolled with (already on the row) — it isn't extended again. Every
  // payment after that is a renewal: one more full term from whichever is
  // later, today or the current end date (mirrors the server's own rule).
  const priorPaidCount = membership.payments.filter((p) => p.status === "PAID").length;
  const isRenewal = priorPaidCount > 0;
  const currentEndsAt = new Date(membership.endsAt);
  // Keyed off the payment date, not literal "now" — a late renewal (paid
  // after the old end date already passed) starts fresh from the day it was
  // actually paid, never from the stale old end date (which would silently
  // hand back the days the member didn't show up for) and never from
  // whatever day staff happen to be sitting at when they get around to
  // recording it (if that's backdated via "Paid at" below).
  const paidAtDate = new Date(paidAt);
  const renewalFrom = currentEndsAt > paidAtDate ? currentEndsAt : paidAtDate;
  const renewalTo = new Date(renewalFrom.getTime() + membership.durationDays * 86_400_000);
  const [termFrom, setTermFrom] = useState(() => dateInput(renewalFrom));
  const [termTo, setTermTo] = useState(() => dateInput(renewalTo));
  useEffect(() => {
    const paidAtDate = new Date(paidAt);
    const from = currentEndsAt > paidAtDate ? currentEndsAt : paidAtDate;
    setTermFrom(dateInput(from));
    setTermTo(dateInput(new Date(from.getTime() + membership.durationDays * 86_400_000)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidAt]);

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentMethodId) { toast.error("Choose a payment method"); return; }
    setSaving(true);
    try {
      await api("/service-center/membership-payments", {
        method: "POST",
        body: JSON.stringify({
          membershipId: membership.id,
          paymentMethodId,
          amount,
          paidAt: new Date(paidAt),
          reference: reference || null,
          termEndsAt: isRenewal ? new Date(`${termTo}T23:59:59`) : undefined,
        }),
      });
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
            <div className="border border-l-4 border-l-accent bg-muted/40 p-3 text-xs sm:col-span-2">
              {isRenewal ? (
                <>
                  <b className="block text-sm">This payment renews the membership</b>
                  <p className="mt-1">Confirm or adjust the new term's dates below — they default to what the plan and payment date give, but you can correct them (e.g. a late payment should still start from the day it was actually paid, not get backdated to cover days the member didn't show up for).</p>
                </>
              ) : (
                <>
                  <b className="block text-sm">This is the first payment</b>
                  <p className="mt-1">No payment was captured when this membership was created, so this one just settles the term already on it (through {currentEndsAt.toLocaleDateString()}) — it won't add more time. The next payment recorded will extend it.</p>
                </>
              )}
            </div>
            <Field label="Payment method" required>
              <select required className="input" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                <option value="">Choose method</option>
                {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Reference"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction code" /></Field>
            <Field label="Paid at"><input type="datetime-local" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
            {isRenewal && (
              <>
                <Field label="New term from">
                  <input
                    type="date"
                    className="input"
                    value={termFrom}
                    onChange={(e) => {
                      setTermFrom(e.target.value);
                      setTermTo(dateInput(new Date(new Date(`${e.target.value}T00:00:00`).getTime() + membership.durationDays * 86_400_000)));
                    }}
                  />
                </Field>
                <Field label="New term up to">
                  <input type="date" className="input" min={termFrom} value={termTo} onChange={(e) => setTermTo(e.target.value)} />
                </Field>
              </>
            )}
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
            {selectedPlan && (
              <div className="sm:col-span-2 border border-l-4 border-l-accent bg-muted/30 p-3 text-sm">
                <p>{selectedPlan.durationDays} days - {Number(selectedPlan.discountPercent)}% discount - {money(Number(selectedPlan.price))}</p>
                <p className="mt-1 text-xs text-muted-foreground">Switching restarts this membership's validity from today: it will run {new Date().toLocaleDateString()} to {new Date(Date.now() + selectedPlan.durationDays * 86_400_000).toLocaleDateString()} under the new plan, regardless of time left on the current one.</p>
              </div>
            )}
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
function QuickCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (customer: Customer) => void }) {
  const toast = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!firstName.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      const { customer } = await api<{ customer: Customer }>("/customers", {
        method: "POST",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() || undefined, phone: phone.trim() }),
      });
      toast.success("Customer created.");
      onCreated(customer);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create customer");
    } finally {
      setSaving(false);
    }
  }
  return (
    <ModalShell
      size="sm"
      stacked
      kicker="Service centre"
      title="New customer"
      onClose={onClose}
      footer={
        <button form="quick-customer-form" disabled={saving || !firstName.trim() || !phone.trim()} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
          {saving && <LuLoaderCircle className="animate-spin" />}
          Create
        </button>
      }
    >
      <form id="quick-customer-form" onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="First name" required><input required autoFocus className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Faith" /></Field>
        <Field label="Last name"><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Wanjiru" /></Field>
        <Field label="Phone" required className="sm:col-span-2"><input required type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" /></Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">They're selected for you as soon as they're created — add email, ID or a service group later from Customers.</p>
      </form>
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
    <ModalShell size="md" kicker="Service centre" title="Customer groups" subtitle="Use groups to track corporate, gym or family memberships. Discounts still come from membership plans. Assign a member to a group from the membership's own create/edit form (or from Customers ▸ edit customer) — not here, this is just the list of groups." onClose={onClose}>
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
