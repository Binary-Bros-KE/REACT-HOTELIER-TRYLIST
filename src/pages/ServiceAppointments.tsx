import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  LuCalendarCheck,
  LuCheck,
  LuCircleAlert,
  LuPlus,
  LuClock3,
  LuCreditCard,
  LuIdCard,
  LuLoaderCircle,
  LuPencil,
  LuPrinter,
  LuTrash2,
  LuUsers,
  LuWallet,
} from "react-icons/lu";
import { api } from "@/lib/api";
import SharedStatCard from "@/components/ui/StatCard";
import PageBanner from "@/components/ui/PageBanner";
import ActionButton from "@/components/ui/ActionButton";
import ModalShell from "@/components/ui/ModalShell";
import StatusPill from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import OrderSettlementPanel from "@/components/pos/OrderSettlementPanel";
import ReceiptPreviewModal from "@/components/pos/ReceiptPreviewModal";
import type { ReceiptProfile } from "@/components/pos/OrderReceipt";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
};
type ServiceVariant = {
  id: string;
  name: string;
  price: string | number;
  durationMinutes: number | null;
};
type Service = {
  id: string;
  name: string;
  durationMinutes: number | null;
  price: string | number;
  variants: ServiceVariant[];
  locations: { id: string }[];
};
type Provider = { id: string; name: string; specialty: string | null; locationIds?: string[] };
type Plan = { name: string; discountPercent: string | number };
type Membership = {
  id: string;
  customerId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  plan: Plan;
  customer: Customer;
};
type PaymentMethod = { id: string; name: string; requiresReference: boolean };
type Location = { id: string; name: string };
type MembershipPayment = {
  id: string;
  amount: string | number;
  status: string;
  reference: string | null;
  membership: { customer: Customer; plan: Plan };
  paymentMethod: PaymentMethod;
};
type Status =
  | "BOOKED"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";
type Order = { id: string; orderNumber: number; status: string };
type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: Status;
  amount: string | number;
  notes: string | null;
  customer: Customer;
  service: Service;
  serviceVariant: ServiceVariant | null;
  provider: Provider;
  membership: { id: string; plan: Plan } | null;
  paymentMethod: PaymentMethod | null;
  location: Location | null;
  order: Order | null;
};
type Summary = {
  total: number;
  today: number;
  upcoming: number;
  completed: number;
};
type Form = {
  customerId: string;
  serviceId: string;
  serviceVariantId: string;
  providerId: string;
  membershipId: string;
  paymentMethodId: string;
  locationId: string;
  startsAt: string;
  status: Status;
  notes: string;
};
const blank: Form = {
  customerId: "",
  serviceId: "",
  serviceVariantId: "",
  providerId: "",
  membershipId: "",
  paymentMethodId: "",
  locationId: "",
  startsAt: "",
  status: "BOOKED",
  notes: "",
};
const money = (value: number) =>
  `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const STATUS_LABEL: Record<Status, string> = {
  BOOKED: "Booked",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

export default function ServiceAppointments() {
  const toast = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [services, setServices] = useState<Service[]>([]),
    [providers, setProviders] = useState<Provider[]>([]),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]),
    [locations, setLocations] = useState<Location[]>([]),
    [profile, setProfile] = useState<ReceiptProfile | null>(null),
    [membershipPayments, setMembershipPayments] = useState<MembershipPayment[]>(
      [],
    );
  const [summary, setSummary] = useState<Summary>({
      total: 0,
      today: 0,
      upcoming: 0,
      completed: 0,
    }),
    [form, setForm] = useState<Form>(blank),
    [editing, setEditing] = useState<Appointment | null>(null),
    [open, setOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [completingId, setCompletingId] = useState(""),
    [error, setError] = useState(""),
    [settlingOrderId, setSettlingOrderId] = useState<string | null>(null),
    [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, o, p] = await Promise.all([
        api<{ appointments: Appointment[]; summary: Summary }>(
          "/service-center/appointments",
        ),
        api<{
          customers: Customer[];
          services: Service[];
          providers: Provider[];
          memberships: Membership[];
          paymentMethods: PaymentMethod[];
          membershipPayments: MembershipPayment[];
          locations: Location[];
        }>("/service-center/appointment-options"),
        api<{ profile: ReceiptProfile | null }>("/business-profile"),
      ]);
      setAppointments(a.appointments);
      setSummary(a.summary);
      setCustomers(o.customers);
      setServices(o.services);
      setProviders(o.providers);
      setMemberships(o.memberships);
      setPaymentMethods(o.paymentMethods);
      setLocations(o.locations);
      setMembershipPayments(o.membershipPayments);
      setProfile(p.profile);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load appointments");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const validMemberships = useMemo(
    () =>
      memberships.filter(
        (m) => m.customerId === form.customerId && m.status === "ACTIVE",
      ),
    [form.customerId, memberships],
  );
  const selectedService = services.find((s) => s.id === form.serviceId);
  const selectedVariant = selectedService?.variants.find(
    (v) => v.id === form.serviceVariantId,
  );
  const previewMinutes =
    selectedVariant?.durationMinutes ?? selectedService?.durationMinutes ?? null;
  const previewEndsAt =
    form.startsAt && previewMinutes
      ? new Date(new Date(form.startsAt).getTime() + previewMinutes * 60000)
      : null;

  function create() {
    setEditing(null);
    setForm({
      ...blank,
      startsAt: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    });
    setOpen(true);
  }
  function edit(a: Appointment) {
    setEditing(a);
    setForm({
      customerId: a.customer.id,
      serviceId: a.service.id,
      serviceVariantId: a.serviceVariant?.id ?? "",
      providerId: a.provider.id,
      membershipId: a.membership?.id ?? "",
      paymentMethodId: a.paymentMethod?.id ?? "",
      locationId: a.location?.id ?? "",
      startsAt: new Date(a.startsAt).toISOString().slice(0, 16),
      status: a.status,
      notes: a.notes ?? "",
    });
    setOpen(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(
        editing
          ? `/service-center/appointments/${editing.id}`
          : "/service-center/appointments",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...form,
            serviceVariantId: form.serviceVariantId || null,
            membershipId: form.membershipId || null,
            paymentMethodId: form.paymentMethodId || null,
            locationId: form.locationId || null,
            notes: form.notes || null,
          }),
        },
      );
      toast.success(editing ? "Appointment updated." : "Appointment created.");
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save appointment");
    } finally {
      setSaving(false);
    }
  }
  async function remove(a: Appointment) {
    if (!confirm(`Delete ${a.customer.firstName}'s appointment?`)) return;
    try {
      await api(`/service-center/appointments/${a.id}`, { method: "DELETE" });
      toast.success("Appointment deleted.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete appointment");
    }
  }
  async function updateStatus(a: Appointment, status: Status) {
    try {
      await api(`/service-center/appointments/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update status");
    }
  }
  /** Turns a due appointment into a real, taxed sale: the service (with its option and
   * any membership discount) is rung up, its stock is consumed, and it's either paid
   * immediately (a payment method was already chosen and needs no reference) or handed
   * to the settlement panel — same as completing an active service tab. */
  async function complete(a: Appointment) {
    setCompletingId(a.id);
    try {
      const { order } = await api<{ order: Order & { financials: { total: number } } }>(
        `/service-center/appointments/${a.id}/complete`,
        { method: "POST", body: JSON.stringify({}) },
      );
      await load();
      const method = a.paymentMethod && paymentMethods.find((m) => m.id === a.paymentMethod!.id);
      if (method && !method.requiresReference) {
        try {
          await api(`/pos/orders/${order.id}/payments`, {
            method: "POST",
            body: JSON.stringify({ method: "PAY", paymentMethodId: method.id, amount: order.financials.total }),
          });
          toast.success(`Completed and paid with ${method.name}.`);
          await load();
          return;
        } catch (payError) {
          toast.error(payError instanceof Error ? payError.message : "Completed, but the automatic payment failed — take payment manually");
        }
      } else {
        toast.success("Service completed — take payment to finish the sale.");
      }
      setSettlingOrderId(order.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete this appointment");
    } finally {
      setCompletingId("");
    }
  }
  const tdBase = "px-5 py-4";
  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Service centre" title="Appointments" />
      {error && <Message error text={error} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric index={0} icon={<LuCalendarCheck />} label="All appointments" value={summary.total} />
        <Metric index={1} icon={<LuClock3 />} label="Today" value={summary.today} />
        <Metric index={2} icon={<LuUsers />} label="Upcoming" value={summary.upcoming} />
        <Metric index={3} icon={<LuCheck />} label="Completed" value={summary.completed} />
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 overflow-hidden border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="border-l-4 border-accent pl-3">
              <h2 className="font-display text-xl font-semibold leading-tight">Bookings</h2>
              <p className="text-xs text-muted-foreground">Booked from the same catalogue the till sells from — completing one is a real, taxed sale with a receipt.</p>
            </div>
            <ActionButton tone="primary" icon={<LuPlus />} onClick={create}>New appointment</ActionButton>
          </div>
          {loading ? (
            <div className="p-20 text-center">
              <LuLoaderCircle className="mx-auto animate-spin" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="p-20 text-center text-sm text-muted-foreground">No appointments yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                  <tr>
                    <th className="px-5 py-3 font-bold">Customer</th>
                    <th className="px-5 py-3 font-bold">Service</th>
                    <th className="px-5 py-3 font-bold">Time</th>
                    <th className="px-5 py-3 font-bold">Membership / Sale</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y [&>tr:nth-child(even)]:bg-muted/30">
                  {appointments.map((a) => {
                    const finalized = Boolean(a.order);
                    const due = ["BOOKED", "CONFIRMED", "IN_PROGRESS"].includes(a.status) && !finalized;
                    return (
                      <tr key={a.id}>
                        <td className={tdBase + " font-semibold"}>
                          {a.customer.firstName} {a.customer.lastName}
                        </td>
                        <td className={tdBase}>
                          <b>{a.service.name}{a.serviceVariant ? ` · ${a.serviceVariant.name}` : ""}</b>
                          <p className="text-xs text-muted-foreground">
                            {a.provider.name}{a.location ? ` · ${a.location.name}` : ""}
                          </p>
                        </td>
                        <td className={tdBase + " text-xs"}>
                          <b>{new Date(a.startsAt).toLocaleDateString()}</b>
                          <p className="text-muted-foreground">
                            {new Date(a.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            –
                            {new Date(a.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </td>
                        <td className={tdBase + " text-xs"}>
                          <b>{money(Number(a.amount))}</b>
                          <p className="text-muted-foreground">{a.membership?.plan.name ?? "No membership"}</p>
                          {a.order && (
                            <p className="mt-1">
                              {a.order.status === "COMPLETED" ? (
                                <StatusPill tone="success">Paid · #{a.order.orderNumber}</StatusPill>
                              ) : (
                                <StatusPill tone="warning">Awaiting payment · #{a.order.orderNumber}</StatusPill>
                              )}
                            </p>
                          )}
                        </td>
                        <td className={tdBase}>
                          <select
                            value={a.status}
                            disabled={finalized}
                            onChange={(e) => void updateStatus(a, e.target.value as Status)}
                            className="border bg-background p-2 text-xs font-semibold disabled:opacity-60"
                          >
                            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className={tdBase}>
                          <div className="flex justify-end gap-1.5">
                            {due && (
                              <ActionButton tone="success" icon={<LuWallet />} title="Complete and sell" loading={completingId === a.id} onClick={() => void complete(a)} />
                            )}
                            {a.order && a.order.status !== "COMPLETED" && (
                              <ActionButton tone="warning" icon={<LuWallet />} title="Take payment" onClick={() => setSettlingOrderId(a.order!.id)} />
                            )}
                            {a.order && (
                              <ActionButton tone="neutral" icon={<LuPrinter />} title="Receipt" onClick={() => setReceiptOrderId(a.order!.id)} />
                            )}
                            {!finalized && (
                              <ActionButton tone="neutral" icon={<LuPencil />} title="Edit appointment" onClick={() => edit(a)} />
                            )}
                            {!finalized && (
                              <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete appointment" onClick={() => void remove(a)} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <div className="border border-l-4 border-l-accent bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <LuIdCard className="text-secondary" /> Active memberships
            </h2>
            <p className="mt-2 text-3xl font-bold">{memberships.filter((m) => m.status === "ACTIVE").length}</p>
            <p className="text-xs text-muted-foreground">Discounts apply automatically at completion.</p>
          </div>
          <div className="border border-l-4 border-l-accent bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <LuCreditCard className="text-secondary" /> Membership payments
            </h2>
            <div className="mt-3 space-y-2">
              {membershipPayments.length === 0 && <p className="text-xs text-muted-foreground">No payments yet.</p>}
              {membershipPayments.slice(0, 4).map((p) => (
                <div key={p.id} className="bg-muted/50 p-3 text-xs">
                  <b>
                    {p.membership.customer.firstName} · {money(Number(p.amount))}
                  </b>
                  <p className="text-muted-foreground">
                    {p.paymentMethod.name} · {p.status}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
      {open && (
        <ModalShell
          size="lg"
          kicker={editing ? "Edit booking" : "New booking"}
          title="Service appointment"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="appointment-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? "Save changes" : "Create appointment"}
              </button>
            </>
          }
        >
          <form id="appointment-form" onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Customer" required>
              <select
                required
                className="input"
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value, membershipId: "" })}
              >
                <option value="" disabled>Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
            </Field>
            <Field label="Service" required>
              <select
                required
                className="input"
                value={form.serviceId}
                onChange={(e) => setForm({ ...form, serviceId: e.target.value, serviceVariantId: "" })}
              >
                <option value="" disabled>Select service</option>
                {services.map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name}
                    {sv.variants.length === 0
                      ? ` · ${sv.durationMinutes ?? "?"} min · ${money(Number(sv.price))}`
                      : " (choose an option below)"}
                  </option>
                ))}
              </select>
            </Field>
            {selectedService && selectedService.variants.length > 0 && (
              <Field label="Option" required className="sm:col-span-2">
                <select
                  required
                  className="input"
                  value={form.serviceVariantId}
                  onChange={(e) => setForm({ ...form, serviceVariantId: e.target.value })}
                >
                  <option value="" disabled>Select an option</option>
                  {selectedService.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.durationMinutes ?? "?"} min · {money(Number(v.price))}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Provider" required>
              <select
                required
                className="input"
                value={form.providerId}
                onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              >
                <option value="" disabled>Select provider</option>
                {providers.filter((p) => !form.locationId || (p.locationIds ?? []).includes(form.locationId)).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.specialty ? ` · ${p.specialty}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date and time" required>
              <input
                required
                type="datetime-local"
                className="input"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
              {previewEndsAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Ends around {previewEndsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </Field>
            {locations.length > 0 && (
              <Field label="Location">
                <select className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">Not set</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {selectedService && selectedService.locations.length > 0 && (
                  <p className="mt-1 text-xs text-warning">This service is only offered at specific locations — choose one it's offered at.</p>
                )}
              </Field>
            )}
            <Field label="Membership">
              <select
                className="input"
                value={form.membershipId}
                onChange={(e) => setForm({ ...form, membershipId: e.target.value })}
              >
                <option value="">No membership</option>
                {validMemberships.map((m) => (
                  <option key={m.id} value={m.id}>{m.plan.name} · {m.plan.discountPercent}% discount</option>
                ))}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                className="input"
                value={form.paymentMethodId}
                onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}
              >
                <option value="">Decide at completion</option>
                {paymentMethods.filter((p) => !p.requiresReference).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — charged automatically on completion</option>
                ))}
              </select>
            </Field>
            {editing && (
              <Field label="Appointment status">
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                >
                  {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
                    <option key={st} value={st}>{STATUS_LABEL[st]}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Notes" className="sm:col-span-2">
              <textarea rows={2} className="input" placeholder="Anything the provider should know" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </form>
        </ModalShell>
      )}
      {settlingOrderId && (
        <OrderSettlementPanel
          orderId={settlingOrderId}
          title="Appointment sale"
          paymentMethods={paymentMethods}
          onClose={() => setSettlingOrderId(null)}
          onChanged={() => void load()}
        />
      )}
      {receiptOrderId && profile && (
        <ReceiptPreviewModal
          orderId={receiptOrderId}
          profile={profile}
          onClose={() => setReceiptOrderId(null)}
        />
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
  icon: React.ReactNode;
  label: string;
  value: number;
  index?: number;
}) {
  return <SharedStatCard index={index} icon={icon} label={label} value={value} />;
}
function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={"block text-sm font-medium " + (className ?? "")}>
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
function Message({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div
      className={"mt-5 flex items-center gap-2 border p-3 text-sm " + (error ? "border-destructive/25 bg-destructive/10 text-destructive" : "border-success/25 bg-success/10 text-success")}
    >
      {error ? <LuCircleAlert /> : <LuCheck />}
      {text}
    </div>
  );
}
