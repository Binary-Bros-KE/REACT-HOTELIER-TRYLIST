import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LuBadgeCheck,
  LuCalendarCheck,
  LuCircleDollarSign,
  LuLayoutGrid,
  LuList,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuReceiptText,
  LuSearch,
  LuTrash2,
  LuWalletCards,
} from "react-icons/lu";
import { api } from "@/lib/api";
import SharedStatCard from "@/components/ui/StatCard";
import { useToast } from "@/components/ui/Toast";
import PageBanner from "@/components/ui/PageBanner";
import ActionButton from "@/components/ui/ActionButton";
import ModalShell from "@/components/ui/ModalShell";

type Status = "PENDING" | "PAID" | "REFUNDED" | "FAILED";
type CustomerGroup = { id: string; name: string; isActive: boolean };
type Customer = { firstName: string; lastName: string; phone: string | null; serviceGroup: CustomerGroup | null };
type Plan = { name: string; price: string | number };
type Appointment = {
  id: string;
  startsAt: string;
  service: { name: string };
  provider?: { name: string };
};
type Membership = {
  id: string;
  status: string;
  customer: Customer;
  plan: Plan;
  appointments: Appointment[];
};
type Method = { id: string; name: string };
type Payment = {
  id: string;
  membershipId: string;
  paymentMethodId: string;
  amount: string | number;
  status: Status;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
  paymentMethod: Method;
  membership: Membership;
};
type Form = {
  membershipId: string;
  paymentMethodId: string;
  amount: string;
  status: Status;
  reference: string;
  paidAt: string;
};
const blank: Form = {
  membershipId: "",
  paymentMethodId: "",
  amount: "",
  status: "PAID",
  reference: "",
  paidAt: "",
};
const money = (value: number) =>
  `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const statusStyle: Record<Status, string> = {
  PAID: "border-success/70 text-success",
  PENDING: "border-warning/70 text-warning",
  REFUNDED: "border-secondary/70 text-secondary",
  FAILED: "border-destructive/70 text-destructive",
};

export default function ServiceMembershipPayments() {
  const [payments, setPayments] = useState<Payment[]>([]),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [methods, setMethods] = useState<Method[]>([]),
    [groups, setGroups] = useState<CustomerGroup[]>([]),
    [form, setForm] = useState<Form>(blank),
    [editing, setEditing] = useState<Payment | null>(null),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"ALL" | Status>("ALL"),
    [groupFilter, setGroupFilter] = useState(""),
    [view, setView] = useState<"cards" | "list">(
      () =>
        (localStorage.getItem("membership-payment-view") as "cards" | "list") ||
        "cards",
    ),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const toast = useToast();
  const setNotice = (message: string) => { if (message) toast.success(message); };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ledger, options] = await Promise.all([
        api<{ membershipPayments: Payment[] }>(
          `/service-center/membership-payments${groupFilter ? `?groupId=${groupFilter}` : ""}`,
        ),
        api<{ memberships: Membership[]; paymentMethods: Method[]; groups: CustomerGroup[] }>(
          "/service-center/membership-payment-options",
        ),
      ]);
      setPayments(ledger.membershipPayments);
      setMemberships(options.memberships);
      setMethods(options.paymentMethods);
      setGroups(options.groups);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments");
    } finally {
      setLoading(false);
    }
  }, [groupFilter]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    localStorage.setItem("membership-payment-view", view);
  }, [view]);
  const visible = useMemo(
    () =>
      payments.filter(
        (p) =>
          (filter === "ALL" || p.status === filter) &&
          `${p.membership.customer.firstName} ${p.membership.customer.lastName} ${p.membership.plan.name} ${p.reference ?? ""} ${p.paymentMethod.name}`
            .concat(` ${p.membership.customer.serviceGroup?.name ?? ""}`)
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [payments, filter, query],
  );
  const paid = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const pending = payments
    .filter((p) => p.status === "PENDING")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const linkedAppointments = new Set(
    payments.flatMap((p) => p.membership.appointments.map((a) => a.id)),
  ).size;
  function create() {
    setEditing(null);
    setForm({
      ...blank,
      paidAt: new Date().toISOString().slice(0, 16),
    });
    setOpen(true);
    setError("");
  }
  function edit(payment: Payment) {
    setEditing(payment);
    setForm({
      membershipId: payment.membershipId,
      paymentMethodId: payment.paymentMethodId,
      amount: String(payment.amount),
      status: payment.status,
      reference: payment.reference ?? "",
      paidAt: payment.paidAt
        ? new Date(payment.paidAt).toISOString().slice(0, 16)
        : "",
    });
    setOpen(true);
    setError("");
  }
  function chooseMembership(id: string) {
    const membership = memberships.find((m) => m.id === id);
    setForm({
      ...form,
      membershipId: id,
      amount: membership ? String(membership.plan.price) : form.amount,
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(
        editing
          ? `/service-center/membership-payments/${editing.id}`
          : "/service-center/membership-payments",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...form,
            amount: Number(form.amount),
            reference: form.reference || null,
            paidAt: form.paidAt ? new Date(form.paidAt) : null,
          }),
        },
      );
      setOpen(false);
      setNotice(
        editing
          ? "Payment updated across connected records."
          : "Membership payment recorded.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save payment");
    } finally {
      setSaving(false);
    }
  }
  async function remove(payment: Payment) {
    if (!confirm(`Delete payment ${payment.reference || payment.id}?`)) return;
    try {
      await api(`/service-center/membership-payments/${payment.id}`, {
        method: "DELETE",
      });
      setNotice("Payment deleted.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete payment");
    }
  }
  async function updateStatus(payment: Payment, status: Status) {
    try {
      await api(`/service-center/membership-payments/${payment.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update payment");
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Service centre" title="Membership Payments" />
      {error && <Message error text={error} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric index={0} icon={<LuCircleDollarSign />} value={money(paid)} label="Successfully paid" />
        <Metric index={1} icon={<LuWalletCards />} value={money(pending)} label="Awaiting payment" />
        <Metric index={2} icon={<LuReceiptText />} value={payments.length} label="Payment records" />
        <Metric index={3} icon={<LuCalendarCheck />} value={linkedAppointments} label="Linked appointments" />
      </section>
      <section className="mt-6 border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Payment ledger</h2>
            <p className="text-xs text-muted-foreground">Every receipt stays linked to its customer, membership plan, membership and associated appointments.</p>
          </div>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={create}>Record payment</ActionButton>
        </div>
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap border bg-background">
            {(["ALL", "PAID", "PENDING", "REFUNDED", "FAILED"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={"px-3 py-2 text-xs font-bold uppercase tracking-wider " + (filter === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">All groups</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <label className="relative flex-1">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full min-w-56 border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Customer, plan or reference"
              />
            </label>
            <div className="flex border bg-background">
              <button onClick={() => setView("cards")} className={"p-2.5 " + (view === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} aria-label="Card view" title="Card view">
                <LuLayoutGrid />
              </button>
              <button onClick={() => setView("list")} className={"p-2.5 " + (view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} aria-label="List view" title="List view">
                <LuList />
              </button>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="p-20 text-center">
            <LuLoaderCircle className="mx-auto animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-20 text-center text-sm text-muted-foreground">No matching payments.</div>
        ) : (
          <div className={view === "cards" ? "grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3" : "space-y-3 p-5"}>
            {visible.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                compact={view === "list"}
                onEdit={() => edit(payment)}
                onDelete={() => void remove(payment)}
                onStatus={(status) => void updateStatus(payment, status)}
              />
            ))}
          </div>
        )}
      </section>
      {open && (
        <ModalShell
          size="lg"
          kicker={editing ? "Edit transaction" : "New transaction"}
          title="Membership payment"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="membership-payment-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? "Save changes" : "Record payment"}
              </button>
            </>
          }
        >
          <form id="membership-payment-form" onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Customer membership" required>
              <select
                required
                className="input"
                value={form.membershipId}
                onChange={(e) => chooseMembership(e.target.value)}
              >
                <option value="" disabled>Select membership</option>
                {memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.customer.firstName} {m.customer.lastName} · {m.plan.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment method" required>
              <select
                required
                className="input"
                value={form.paymentMethodId}
                onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}
              >
                <option value="" disabled>Select payment method</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (KSh)" required>
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                className="input"
                placeholder="e.g. 5000"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
              >
                {["PENDING", "PAID", "REFUNDED", "FAILED"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Transaction reference">
              <input
                maxLength={120}
                className="input"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="e.g. M-Pesa code"
              />
            </Field>
            <Field label="Payment date and time">
              <input
                type="datetime-local"
                className="input"
                value={form.paidAt}
                onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
              />
            </Field>
          </form>
        </ModalShell>
      )}
    </div>
  );
}

function PaymentCard({
  payment,
  compact,
  onEdit,
  onDelete,
  onStatus,
}: {
  payment: Payment;
  compact: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: Status) => void;
}) {
  return (
    <article
      className={"border bg-background shadow-sm " + (compact ? "flex flex-col gap-3 border-l-4 border-l-accent p-4 md:flex-row md:items-center" : "overflow-hidden border-t-4 border-t-accent")}
    >
      <div className={compact ? "flex min-w-56 flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-between" : "p-5"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {payment.membership.plan.name}
            </p>
            <h3 className="mt-1 text-lg font-bold">
              {payment.membership.customer.firstName} {payment.membership.customer.lastName}
            </h3>
            {payment.membership.customer.serviceGroup && <p className="mt-1 text-xs font-semibold text-secondary">{payment.membership.customer.serviceGroup.name}</p>}
          </div>
          {!compact && (
            <select
              value={payment.status}
              onChange={(e) => onStatus(e.target.value as Status)}
              className={"border border-dashed bg-background px-2 py-1 text-xs font-bold " + statusStyle[payment.status]}
            >
              {["PENDING", "PAID", "REFUNDED", "FAILED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
        <div className={compact ? "flex flex-wrap items-center gap-5" : "mt-4"}>
          <b className="text-2xl">{money(Number(payment.amount))}</b>
          <div>
            <p className="text-xs text-muted-foreground">
              {payment.paymentMethod.name} · {payment.reference || "No reference"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "Payment date pending"}
            </p>
          </div>
          {compact && (
            <select
              value={payment.status}
              onChange={(e) => onStatus(e.target.value as Status)}
              className={"border border-dashed bg-background px-2 py-1 text-xs font-bold " + statusStyle[payment.status]}
            >
              {["PENDING", "PAID", "REFUNDED", "FAILED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
        <div className={compact ? "flex items-center gap-4" : "mt-4 flex items-center justify-between border-t pt-3"}>
          <span className="flex items-center gap-1 text-xs font-semibold text-secondary">
            <LuBadgeCheck /> {payment.membership.appointments.length} linked appointments
          </span>
          <div className="flex gap-1.5">
            <ActionButton tone="neutral" icon={<LuPencil />} title="Edit payment" onClick={onEdit} />
            <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete payment" onClick={onDelete} />
          </div>
        </div>
      </div>
    </article>
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
function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
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
      className={"mt-4 border p-3 text-sm " + (error ? "border-destructive/25 bg-destructive/10 text-destructive" : "border-success/25 bg-success/10 text-success")}
    >
      {text}
    </div>
  );
}
