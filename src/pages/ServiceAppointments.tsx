import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  LuCalendarCheck,
  LuCheck,
  LuCircleAlert,
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
import Button from "@/components/ui/Button";
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
type Provider = { id: string; name: string; specialty: string | null };
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
    [notice, setNotice] = useState(""),
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
      customerId: customers[0]?.id ?? "",
      serviceId: services[0]?.id ?? "",
      providerId: providers[0]?.id ?? "",
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
      setNotice(
        editing
          ? "Appointment updated."
          : "Appointment created.",
      );
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
      setNotice("Appointment deleted.");
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
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <header className="rounded-3xl bg-linear-to-r from-[#172554] to-secondary p-7 text-white shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-white/60">
              Service centre
            </p>
            <h1 className="mt-3 text-3xl font-semibold">
              Appointments that stay connected.
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Booked from the same catalogue the till sells from — completing one
              is a real, taxed sale with a receipt.
            </p>
          </div>
          <Button onClick={create} className="shrink-0">
            New appointment
          </Button>
        </div>
      </header>
      {error && <Message error text={error} />}{" "}
      {notice && <Message text={notice} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          index={0}
          icon={<LuCalendarCheck />}
          label="All appointments"
          value={summary.total}
        />
        <Metric index={1} icon={<LuClock3 />} label="Today" value={summary.today} />
        <Metric index={2} icon={<LuUsers />} label="Upcoming" value={summary.upcoming} />
        <Metric
          index={3}
          icon={<LuCheck />}
          label="Completed"
          value={summary.completed}
        />
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {loading ? (
            <div className="p-20 text-center">
              <LuLoaderCircle className="mx-auto animate-spin" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="p-20 text-center text-sm text-muted-foreground">
              No appointments yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Service</th>
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Membership / Sale</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a) => {
                    const finalized = Boolean(a.order);
                    const due = ["BOOKED", "CONFIRMED", "IN_PROGRESS"].includes(a.status) && !finalized;
                    return (
                    <tr key={a.id} className="border-t">
                      <td className="px-5 py-4 font-semibold">
                        {a.customer.firstName} {a.customer.lastName}
                      </td>
                      <td className="px-5 py-4">
                        <b>{a.service.name}{a.serviceVariant ? ` · ${a.serviceVariant.name}` : ""}</b>
                        <p className="text-xs text-muted-foreground">
                          {a.provider.name}{a.location ? ` · ${a.location.name}` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <b>{new Date(a.startsAt).toLocaleDateString()}</b>
                        <p className="text-muted-foreground">
                          {new Date(a.startsAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          –
                          {new Date(a.endsAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <b>{money(Number(a.amount))}</b>
                        <p className="text-muted-foreground">
                          {a.membership?.plan.name ?? "No membership"}
                        </p>
                        {a.order && (
                          <p className="mt-1 font-semibold">
                            {a.order.status === "COMPLETED" ? (
                              <span className="text-success">Paid · #{a.order.orderNumber}</span>
                            ) : (
                              <span className="text-warning">Awaiting payment · #{a.order.orderNumber}</span>
                            )}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={a.status}
                          disabled={finalized}
                          onChange={(e) =>
                            void updateStatus(a, e.target.value as Status)
                          }
                          className="rounded-lg border bg-background p-2 text-xs font-semibold disabled:opacity-60"
                        >
                          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1">
                          {due && (
                            <button
                              onClick={() => void complete(a)}
                              disabled={completingId === a.id}
                              title="Complete and sell"
                              className="p-2 text-success disabled:opacity-50"
                            >
                              {completingId === a.id ? <LuLoaderCircle className="animate-spin" /> : <LuWallet />}
                            </button>
                          )}
                          {a.order && a.order.status !== "COMPLETED" && (
                            <button onClick={() => setSettlingOrderId(a.order!.id)} title="Take payment" className="p-2 text-warning">
                              <LuWallet />
                            </button>
                          )}
                          {a.order && (
                            <button onClick={() => setReceiptOrderId(a.order!.id)} title="Receipt" className="p-2 text-secondary">
                              <LuPrinter />
                            </button>
                          )}
                          {!finalized && (
                            <button
                              onClick={() => edit(a)}
                              className="p-2 text-secondary"
                            >
                              <LuPencil />
                            </button>
                          )}
                          {!finalized && (
                            <button
                              onClick={() => void remove(a)}
                              className="p-2 text-destructive"
                            >
                              <LuTrash2 />
                            </button>
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
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <LuIdCard className="text-secondary" /> Active memberships
            </h2>
            <p className="mt-2 text-3xl font-bold">
              {memberships.filter((m) => m.status === "ACTIVE").length}
            </p>
            <p className="text-xs text-muted-foreground">
              Discounts apply automatically at completion.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <LuCreditCard className="text-secondary" /> Membership payments
            </h2>
            <div className="mt-3 space-y-2">
              {membershipPayments.slice(0, 4).map((p) => (
                <div key={p.id} className="rounded-xl bg-muted/50 p-3 text-xs">
                  <b>
                    {p.membership.customer.firstName} ·{" "}
                    {money(Number(p.amount))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"
          >
            <p className="text-sm font-semibold text-secondary">
              {editing ? "Edit booking" : "New booking"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Service appointment</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Customer">
                <select
                  required
                  className="input"
                  value={form.customerId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      customerId: e.target.value,
                      membershipId: "",
                    })
                  }
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Service">
                <select
                  required
                  className="input"
                  value={form.serviceId}
                  onChange={(e) =>
                    setForm({ ...form, serviceId: e.target.value, serviceVariantId: "" })
                  }
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.variants.length === 0
                        ? ` · ${s.durationMinutes ?? "?"} min · ${money(Number(s.price))}`
                        : " (choose an option below)"}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedService && selectedService.variants.length > 0 && (
                <Field label="Option" className="sm:col-span-2">
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
              <Field label="Provider">
                <select
                  required
                  className="input"
                  value={form.providerId}
                  onChange={(e) =>
                    setForm({ ...form, providerId: e.target.value })
                  }
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.specialty}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start date and time">
                <input
                  required
                  type="datetime-local"
                  className="input"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm({ ...form, startsAt: e.target.value })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, membershipId: e.target.value })
                  }
                >
                  <option value="">No membership</option>
                  {validMemberships.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.plan.name} · {m.plan.discountPercent}% discount
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment method">
                <select
                  className="input"
                  value={form.paymentMethodId}
                  onChange={(e) =>
                    setForm({ ...form, paymentMethodId: e.target.value })
                  }
                >
                  <option value="">Decide at completion</option>
                  {paymentMethods.filter((p) => !p.requiresReference).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — charged automatically on completion
                    </option>
                  ))}
                </select>
              </Field>
              {editing && (
                <Field label="Appointment status">
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as Status })
                    }
                  >
                    {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Notes" className="sm:col-span-2">
                <textarea
                  className="input"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
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
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-bold text-white"
              >
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? "Save changes" : "Create appointment"}
              </button>
            </div>
          </form>
        </div>
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
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`text-sm font-semibold ${className ?? ""}`}>
      {label}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
function Message({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div
      className={`mt-5 flex items-center gap-2 rounded-xl p-3 text-sm ${error ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}
    >
      {error ? <LuCircleAlert /> : <LuCheck />}
      {text}
    </div>
  );
}
