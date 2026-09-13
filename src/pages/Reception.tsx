import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LuBedDouble,
  LuCalendarCheck,
  LuCircleAlert,
  LuCheck,
  LuHotel,
  LuLoaderCircle,
  LuPlus,
  LuUsers,
  LuX,
} from "react-icons/lu";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import SharedStatCard from "@/components/ui/StatCard";

const RESERVATION_SOURCES = ["WALK_IN", "PHONE", "WEBSITE", "BOOKING_ENGINE", "TRAVEL_AGENT", "OTA", "CORPORATE", "OTHER"] as const;
const CANCELLATION_REASONS = ["CHANGED_MIND", "NO_SHOW", "FOUND_ALTERNATIVE", "DUPLICATE_BOOKING", "HOTEL_CANCELLED", "OTHER"] as const;
const MEAL_PLANS = ["ROOM_ONLY", "BED_AND_BREAKFAST", "HALF_BOARD", "FULL_BOARD"] as const;
const MEAL_PLAN_LABELS: Record<(typeof MEAL_PLANS)[number], string> = {
  ROOM_ONLY: "Room Only",
  BED_AND_BREAKFAST: "Bed & Breakfast",
  HALF_BOARD: "Half Board",
  FULL_BOARD: "Full Board",
};
const CUSTOMER_TYPES = ["PERSONAL", "BUSINESS"] as const;

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");

type Customer = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };
type Room = {
  id: string;
  number: string;
  name: string | null;
  roomType: { id: string; name: string; rates: { mealPlan: (typeof MEAL_PLANS)[number]; price: string | number }[] };
  capacity: number;
  nightlyRate: string | number;
  status: string;
  cleanliness: string;
};
type Service = { id: string; name: string; price: string | number; unit: { name: string } };
type FolioLineItem = { id: string; source: "ROOM" | "SERVICE" | "POS_ORDER" | "AD_HOC"; label: string; amount: string | number; quantity: number; createdAt: string };
type PaymentMethod = { id: string; name: string; requiresReference: boolean };
type FolioPayment = { id: string; kind: "DEPOSIT" | "SETTLEMENT"; paymentMethod: PaymentMethod; amount: string | number; reference: string | null; createdAt: string };
type Folio = { id: string; folioNo: string; status: "OPEN" | "SETTLED"; lineItems: FolioLineItem[]; payments: FolioPayment[] };
type Guest = { id: string; name: string; idNumber: string | null; notes: string | null; addedAt: string };
type ReservationStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
type ReservationActivity = {
  id: string;
  action: string;
  summary: string;
  occurredAt: string;
  employee: { id: string; firstName: string; lastName: string } | null;
  location: { id: string; name: string } | null;
};
type Reservation = {
  id: string;
  reservationNo: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  source: (typeof RESERVATION_SOURCES)[number];
  bookingDate: string;
  status: ReservationStatus;
  cancellationReason: (typeof CANCELLATION_REASONS)[number] | null;
  cancellationNotes: string | null;
  notes: string | null;
  customer: Customer;
  room: Room;
  location: { id: string; name: string } | null;
  folio: Folio | null;
  additionalGuests: Guest[];
  activities: ReservationActivity[];
};

const date = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const formatKes = (value: number) => `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
function folioTotals(folio: Folio | null) {
  if (!folio) return { charges: 0, paid: 0, balance: 0 };
  const charges = folio.lineItems.reduce((sum, item) => sum + Number(item.amount) * item.quantity, 0);
  const paid = folio.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return { charges, paid, balance: charges - paid };
}
// Mirrors the backend's fallback: a RoomType may not have every tier
// configured, so an unpriced meal plan just bills at the room's own rate.
function rateFor(room: Room, mealPlan: (typeof MEAL_PLANS)[number]): number {
  const tier = room.roomType.rates.find((r) => r.mealPlan === mealPlan);
  return tier ? Number(tier.price) : Number(room.nightlyRate);
}

const statusStyles: Record<ReservationStatus, string> = {
  PENDING: "bg-warning/15 text-warning",
  CONFIRMED: "bg-secondary/10 text-secondary",
  CHECKED_IN: "bg-success/10 text-success",
  CHECKED_OUT: "bg-muted text-muted-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
  NO_SHOW: "bg-destructive/10 text-destructive",
};

export default function Reception() {
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [guest, setGuest] = useState({ firstName: "", lastName: "", phone: "", email: "", customerType: "PERSONAL" as (typeof CUSTOMER_TYPES)[number] });
  const [booking, setBooking] = useState({
    customerId: "",
    roomId: "",
    checkIn: date(),
    checkOut: date(1),
    adults: "1",
    children: "0",
    mealPlan: "ROOM_ONLY" as (typeof MEAL_PLANS)[number],
    source: "WALK_IN" as (typeof RESERVATION_SOURCES)[number],
    bookingDate: date(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState("");
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [stayOpen, setStayOpen] = useState<Reservation | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [c, r, b] = await Promise.all([
        api<{ customers: Customer[] }>("/reception/customers"),
        api<{ rooms: Room[] }>("/rooms/rooms"),
        api<{ reservations: Reservation[] }>("/reception/reservations"),
      ]);
      setCustomers(c.customers);
      setRooms(r.rooms);
      setBookings(b.reservations);
      setBooking((x) => ({
        ...x,
        customerId: c.customers.some((y) => y.id === x.customerId) ? x.customerId : "",
        roomId: r.rooms.some((y) => y.id === x.roomId && y.status === "VACANT" && y.cleanliness === "CLEAN") ? x.roomId : "",
      }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Reception");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Keep the open stay panel's data fresh against the latest load, and close
  // it automatically once the reservation reaches a terminal state.
  useEffect(() => {
    if (!stayOpen) return;
    const fresh = bookings.find((b) => b.id === stayOpen.id);
    if (!fresh || fresh.status !== "CHECKED_IN") { setStayOpen(null); return; }
    setStayOpen(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  const available = rooms.filter((r) => r.status === "VACANT" && r.cleanliness === "CLEAN");
  const selectedRoom = rooms.find((room) => room.id === booking.roomId);
  // Checked-out and cancelled/no-show stays move to Guest Stays — this list
  // stays a working queue instead of growing without bound.
  const activeBookings = bookings.filter((b) => b.status !== "CHECKED_OUT" && b.status !== "CANCELLED" && b.status !== "NO_SHOW");

  async function addGuest(e: FormEvent) {
    e.preventDefault();
    try {
      const x = await api<{ customer: Customer }>("/reception/customers", {
        method: "POST",
        body: JSON.stringify({ ...guest, lastName: guest.lastName || undefined, email: guest.email || undefined }),
      });
      setGuest({ firstName: "", lastName: "", phone: "", email: "", customerType: "PERSONAL" });
      setBooking((b) => ({ ...b, customerId: x.customer.id }));
      setNotice("Guest profile created.");
      toast.success("Guest profile created.");
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create guest";
      setError(message);
      toast.error(message);
    }
  }

  async function addBooking(e: FormEvent, walkIn: boolean) {
    e.preventDefault();
    try {
      await api("/reception/reservations", {
        method: "POST",
        body: JSON.stringify({
          ...booking,
          adults: Number(booking.adults),
          children: Number(booking.children),
          status: walkIn ? "CHECKED_IN" : "PENDING",
        }),
      });
      setNotice(walkIn ? "Guest checked in." : "Reservation created.");
      toast.success(walkIn ? "Guest checked in." : "Reservation created.");
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create reservation";
      setError(message);
      toast.error(message);
    }
  }

  async function checkIn(reservation: Reservation) {
    setWorking(reservation.id);
    try {
      await api(`/reception/reservations/${reservation.id}/check-in`, { method: "PATCH" });
      toast.success(`Room ${reservation.room.number}: guest checked in.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check in");
    } finally {
      setWorking("");
    }
  }

  async function markNoShow(reservation: Reservation) {
    if (!window.confirm(`Mark ${reservation.customer.firstName} ${reservation.customer.lastName} as a no-show?`)) return;
    setWorking(reservation.id);
    try {
      await api(`/reception/reservations/${reservation.id}/no-show`, { method: "PATCH" });
      toast.success("Marked as no-show.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update reservation");
    } finally {
      setWorking("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="relative overflow-hidden rounded-sm bg-linear-to-r from-primary to-secondary p-7 text-white shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-white/60">Front desk</p>
        <h1 className="mt-3 font-display text-3xl font-semibold">A warmer welcome starts here.</h1>
        <p className="mt-2 text-sm text-white/70">Guests, reservations, room availability, and housekeeping readiness in real time.</p>
      </header>
      {error && <Msg error text={error} />} {notice && <Msg text={notice} />}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={<LuBedDouble className="size-4" />} label="Ready rooms" value={available.length} tone="primary" />
        <StatCard icon={<LuUsers className="size-4" />} label="Guests in house" value={bookings.filter((b) => b.status === "CHECKED_IN").length} tone="secondary" />
        <StatCard icon={<LuCalendarCheck className="size-4" />} label="Upcoming" value={bookings.filter((b) => b.status === "PENDING" || b.status === "CONFIRMED").length} tone="accent" />
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-sm border bg-card shadow-sm">
          <div className="border-b p-5">
            <h2 className="font-display text-xl font-semibold">Reservations &amp; check-ins</h2>
            <p className="text-sm text-muted-foreground">Check guests in and manage active stays — completed and cancelled stays move to Guest Stays.</p>
          </div>
          {loading ? (
            <div className="p-16 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-primary text-xs uppercase text-primary-foreground">
                  <tr>
                    <th className="px-5 py-3">Guest</th>
                    <th className="px-5 py-3">Room</th>
                    <th className="px-5 py-3">Stay</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBookings.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{b.customer.firstName} {b.customer.lastName}</p>
                        <p className="text-xs text-muted-foreground">{b.reservationNo}</p>
                      </td>
                      <td className="px-5 py-4">{b.room.number} · {b.room.roomType.name}</td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        {new Date(b.checkIn).toLocaleDateString()} – {new Date(b.checkOut).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusStyles[b.status]}`}>{titleCase(b.status)}</span>
                        {b.status === "CANCELLED" && b.cancellationReason && <p className="mt-1 text-[10px] text-muted-foreground">{titleCase(b.cancellationReason)}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1.5">
                          {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                            <>
                              <button onClick={() => void checkIn(b)} disabled={working === b.id} className="rounded-sm bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                                {working === b.id ? "…" : "Check in"}
                              </button>
                              <button onClick={() => setCancelling(b)} className="rounded-sm border border-destructive/30 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10">Cancel</button>
                              {new Date(b.checkIn) <= new Date() && (
                                <button onClick={() => void markNoShow(b)} className="rounded-sm border px-3 py-2 text-xs font-bold hover:bg-muted">No-show</button>
                              )}
                            </>
                          )}
                          {b.status === "CHECKED_IN" && (
                            <button onClick={() => setStayOpen(b)} className="rounded-sm bg-success px-3 py-2 text-xs font-bold text-white">Manage stay</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {activeBookings.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">No reservations yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="space-y-5">
          <form className="rounded-sm border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">New reservation</h2>
            <div className="mt-4 space-y-2">
              <select required className="input" value={booking.customerId} onChange={(e) => setBooking({ ...booking, customerId: e.target.value })}>
                <option value="">Select guest</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
              <select required className="input" value={booking.roomId} onChange={(e) => setBooking({ ...booking, roomId: e.target.value })}>
                <option value="">Select a room created in Room Operations</option>
                <optgroup label="Ready to occupy">
                  {available.map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.number}{room.name ? ` — ${room.name}` : ""} · {room.roomType.name} · {room.capacity} guests · KSh {Number(room.nightlyRate).toLocaleString("en-KE")}
                    </option>
                  ))}
                </optgroup>
                {rooms.length > available.length && (
                  <optgroup label="Currently unavailable">
                    {rooms.filter((room) => !available.some((ready) => ready.id === room.id)).map((room) => (
                      <option key={room.id} value={room.id} disabled>
                        Room {room.number}{room.name ? ` — ${room.name}` : ""} · {room.status.replaceAll("_", " ").toLowerCase()} · {room.cleanliness.toLowerCase()}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <select className="input" value={booking.mealPlan} onChange={(e) => setBooking({ ...booking, mealPlan: e.target.value as (typeof MEAL_PLANS)[number] })}>
                {MEAL_PLANS.map((plan) => (
                  <option key={plan} value={plan}>
                    {MEAL_PLAN_LABELS[plan]}{selectedRoom ? ` — KSh ${rateFor(selectedRoom, plan).toLocaleString("en-KE")}` : ""}
                  </option>
                ))}
              </select>
              {selectedRoom && (
                <div className="rounded-sm border border-secondary/20 bg-secondary/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Room {selectedRoom.number} · {selectedRoom.roomType.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedRoom.capacity} guests{selectedRoom.name ? ` · ${selectedRoom.name}` : ""} · {MEAL_PLAN_LABELS[booking.mealPlan]}</p>
                    </div>
                    <p className="text-sm font-bold text-secondary">KSh {rateFor(selectedRoom, booking.mealPlan).toLocaleString("en-KE")}</p>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success"><LuCheck /> Clean, vacant, and ready to occupy</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input type="date" required className="input" value={booking.checkIn} onChange={(e) => setBooking({ ...booking, checkIn: e.target.value })} />
                <input type="date" required className="input" value={booking.checkOut} onChange={(e) => setBooking({ ...booking, checkOut: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={booking.source} onChange={(e) => setBooking({ ...booking, source: e.target.value as (typeof RESERVATION_SOURCES)[number] })}>
                  {RESERVATION_SOURCES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </select>
                <input type="date" className="input" value={booking.bookingDate} onChange={(e) => setBooking({ ...booking, bookingDate: e.target.value })} title="Booking date" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={(e) => void addBooking(e, false)} disabled={!available.length} className="flex items-center justify-center gap-2 rounded-sm bg-secondary py-2.5 text-sm font-bold text-secondary-foreground disabled:opacity-50">
                <LuHotel /> Reserve
              </button>
              <button onClick={(e) => void addBooking(e, true)} disabled={!available.length} className="flex items-center justify-center gap-2 rounded-sm bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                <LuUsers /> Walk-in check-in
              </button>
            </div>
          </form>
          <form onSubmit={addGuest} className="rounded-sm border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">New guest</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <select required className="input col-span-2" value={guest.customerType} onChange={(e) => setGuest({ ...guest, customerType: e.target.value as (typeof CUSTOMER_TYPES)[number] })}>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
              <input required className="input" placeholder="First name" value={guest.firstName} onChange={(e) => setGuest({ ...guest, firstName: e.target.value })} />
              <input className="input" placeholder="Last name" value={guest.lastName} onChange={(e) => setGuest({ ...guest, lastName: e.target.value })} />
              <input required className="input col-span-2" placeholder="Phone" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              <input type="email" className="input col-span-2" placeholder="Email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
            </div>
            <button className="mt-3 flex w-full justify-center gap-2 rounded-sm border py-2.5 text-sm font-bold">
              <LuPlus /> Save guest
            </button>
          </form>
        </aside>
      </div>

      {cancelling && (
        <CancelModal
          reservation={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={() => { setCancelling(null); void load(); }}
        />
      )}
      {stayOpen && (
        <StayModal
          reservation={stayOpen}
          onClose={() => setStayOpen(null)}
          onChanged={() => load(true)}
          onCheckedOut={() => { setStayOpen(null); void load(); }}
        />
      )}
    </div>
  );
}

function CancelModal({ reservation, onClose, onCancelled }: { reservation: Reservation; onClose: () => void; onCancelled: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<(typeof CANCELLATION_REASONS)[number]>("CHANGED_MIND");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/reception/reservations/${reservation.id}/cancel`, { method: "PATCH", body: JSON.stringify({ cancellationReason: reason, cancellationNotes: notes || undefined }) });
      toast.success("Reservation cancelled.");
      onCancelled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel reservation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-sm rounded-sm border bg-card p-6 shadow-2xl">
        <p className="text-sm font-semibold text-destructive">Cancel reservation</p>
        <h2 className="mt-1 font-display text-xl font-semibold">{reservation.customer.firstName} {reservation.customer.lastName} — {reservation.reservationNo}</h2>
        <label className="mt-5 block text-sm font-medium">
          Reason
          <select className="input mt-1.5" value={reason} onChange={(e) => setReason(e.target.value as (typeof CANCELLATION_REASONS)[number])}>
            {CANCELLATION_REASONS.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm font-medium">
          Notes (optional)
          <textarea rows={2} className="input mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Back</button>
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />} Cancel reservation
          </button>
        </div>
      </form>
    </div>
  );
}

function StayModal({ reservation, onClose, onChanged, onCheckedOut }: { reservation: Reservation; onClose: () => void; onChanged: () => void; onCheckedOut: () => void }) {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [tab, setTab] = useState<"folio" | "extend" | "guests" | "checkout" | "activity">("folio");
  const [extendDate, setExtendDate] = useState(reservation.checkOut.slice(0, 10));
  const [serviceId, setServiceId] = useState("");
  const [serviceQty, setServiceQty] = useState("1");
  const [adHocLabel, setAdHocLabel] = useState("");
  const [adHocAmount, setAdHocAmount] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestIdNumber, setGuestIdNumber] = useState("");
  const [payMethodId, setPayMethodId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payReference, setPayReference] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ services: Service[] }>("/services").then((r) => setServices(r.services)).catch(() => {});
    api<{ methods: (PaymentMethod & { code: string })[] }>("/payment-methods?activeOnly=true").then((r) => {
      // Room Charge only makes sense as a way to bill a POS order to this
      // folio — offering it here, to settle the folio itself, is circular.
      const methods = r.methods.filter((m) => m.code !== "ROOM_CHARGE");
      setPaymentMethods(methods);
      setPayMethodId((current) => current || methods[0]?.id || "");
    }).catch(() => {});
  }, []);

  const selectedPayMethod = paymentMethods.find((m) => m.id === payMethodId);

  const totals = folioTotals(reservation.folio);

  async function extend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/reception/reservations/${reservation.id}/extend`, { method: "PATCH", body: JSON.stringify({ checkOut: extendDate }) });
      toast.success("Stay extended.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not extend stay");
    } finally {
      setBusy(false);
    }
  }

  async function addServiceCharge(e: FormEvent) {
    e.preventDefault();
    if (!serviceId) return;
    setBusy(true);
    try {
      await api(`/reception/reservations/${reservation.id}/folio/charges`, { method: "POST", body: JSON.stringify({ source: "SERVICE", sourceRefId: serviceId, quantity: Number(serviceQty) || 1 }) });
      toast.success("Service added to folio.");
      setServiceId(""); setServiceQty("1");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add service");
    } finally {
      setBusy(false);
    }
  }

  async function addAdHocCharge(e: FormEvent) {
    e.preventDefault();
    if (!adHocLabel.trim() || !adHocAmount) return;
    setBusy(true);
    try {
      await api(`/reception/reservations/${reservation.id}/folio/charges`, { method: "POST", body: JSON.stringify({ source: "AD_HOC", label: adHocLabel, amount: Number(adHocAmount) }) });
      toast.success("Charge added to folio.");
      setAdHocLabel(""); setAdHocAmount("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add charge");
    } finally {
      setBusy(false);
    }
  }

  async function removeCharge(lineItemId: string) {
    try {
      await api(`/reception/reservations/${reservation.id}/folio/charges/${lineItemId}`, { method: "DELETE" });
      toast.success("Charge removed.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove charge");
    }
  }

  async function addGuest(e: FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) return;
    setBusy(true);
    try {
      await api(`/reception/reservations/${reservation.id}/guests`, { method: "POST", body: JSON.stringify({ name: guestName, idNumber: guestIdNumber || undefined }) });
      toast.success("Guest added.");
      setGuestName(""); setGuestIdNumber("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add guest");
    } finally {
      setBusy(false);
    }
  }

  async function removeGuest(guestId: string) {
    try {
      await api(`/reception/reservations/${reservation.id}/guests/${guestId}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove guest");
    }
  }

  async function addDeposit() {
    if (!payAmount || !payMethodId) return;
    if (selectedPayMethod?.requiresReference && !payReference.trim()) { toast.error(`${selectedPayMethod.name} requires a reference number`); return; }
    setBusy(true);
    try {
      await api(`/reception/reservations/${reservation.id}/folio/deposits`, { method: "POST", body: JSON.stringify({ paymentMethodId: payMethodId, amount: Number(payAmount), reference: payReference || undefined }) });
      toast.success("Deposit recorded.");
      setPayAmount(""); setPayReference("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record deposit");
    } finally {
      setBusy(false);
    }
  }

  async function completeCheckout() {
    const amount = Number(payAmount) || 0;
    if (amount > 0 && !payMethodId) { toast.error("Choose a payment method"); return; }
    if (amount > 0 && selectedPayMethod?.requiresReference && !payReference.trim()) { toast.error(`${selectedPayMethod.name} requires a reference number`); return; }
    setBusy(true);
    try {
      await api(`/reception/reservations/${reservation.id}/checkout`, { method: "PATCH", body: JSON.stringify({ paymentMethodId: amount > 0 ? payMethodId : undefined, amount, reference: payReference || undefined }) });
      toast.success(`Room ${reservation.room.number}: checked out and sent to Housekeeping.`);
      onCheckedOut();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-sm border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b p-5">
          <div>
            <p className="text-sm font-semibold text-secondary">{reservation.folio?.folioNo}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{reservation.customer.firstName} {reservation.customer.lastName}</h2>
            <p className="text-xs text-muted-foreground">Room {reservation.room.number} · {reservation.room.roomType.name} · {reservation.reservationNo}</p>
          </div>
          <button onClick={onClose} className="rounded-sm p-2 text-muted-foreground hover:bg-muted"><LuX /></button>
        </div>

        <div className="flex gap-1 border-b bg-muted/30 px-5 pt-3">
          {([["folio", "Folio"], ["extend", "Extend"], ["guests", "Guests"], ["checkout", "Checkout"], ["activity", "Activity"]] as const).map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} className={`rounded-t-sm px-4 py-2 text-sm font-semibold ${tab === value ? "bg-card text-secondary" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "folio" && (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-sm border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                    <tr><th className="px-3 py-2">Charge</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2 text-right">Amount</th><th /></tr>
                  </thead>
                  <tbody>
                    {(reservation.folio?.lineItems ?? []).map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">{item.label}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatKes(Number(item.amount) * item.quantity)}</td>
                        <td className="px-2 py-2 text-right">
                          {item.source !== "ROOM" && <button onClick={() => void removeCharge(item.id)} className="text-xs text-destructive hover:underline">Remove</button>}
                        </td>
                      </tr>
                    ))}
                    {(reservation.folio?.lineItems.length ?? 0) === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">No charges yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="rounded-sm bg-muted/40 p-3 text-sm">
                <div className="flex justify-between"><span>Charges</span><span>{formatKes(totals.charges)}</span></div>
                <div className="flex justify-between text-success"><span>Paid</span><span>-{formatKes(totals.paid)}</span></div>
                <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>Balance</span><span>{formatKes(totals.balance)}</span></div>
              </div>

              <FieldGroup title="Add addon service">
                <form onSubmit={addServiceCharge} className="flex gap-2 sm:col-span-2">
                  <select className="input flex-1" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                    <option value="">Select a service</option>
                    {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatKes(Number(s.price))}/{s.unit.name}</option>)}
                  </select>
                  <input type="number" min="1" className="input w-20" value={serviceQty} onChange={(e) => setServiceQty(e.target.value)} />
                  <button disabled={busy || !serviceId} className="rounded-sm bg-secondary px-3 text-xs font-semibold text-secondary-foreground disabled:opacity-60">Add</button>
                </form>
              </FieldGroup>
              <FieldGroup title="Add one-time charge">
                <form onSubmit={addAdHocCharge} className="flex gap-2 sm:col-span-2">
                  <input placeholder="Description" className="input flex-1" value={adHocLabel} onChange={(e) => setAdHocLabel(e.target.value)} />
                  <input type="number" min="0" placeholder="Amount" className="input w-28" value={adHocAmount} onChange={(e) => setAdHocAmount(e.target.value)} />
                  <button disabled={busy || !adHocLabel.trim() || !adHocAmount} className="rounded-sm bg-secondary px-3 text-xs font-semibold text-secondary-foreground disabled:opacity-60">Add</button>
                </form>
              </FieldGroup>
            </div>
          )}

          {tab === "extend" && (
            <form onSubmit={extend} className="space-y-3">
              <label className="block text-sm font-medium">
                New check-out date
                <input type="date" required min={reservation.checkOut.slice(0, 10)} className="input mt-1.5" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
              </label>
              <p className="text-xs text-muted-foreground">Current check-out: {new Date(reservation.checkOut).toLocaleDateString()}</p>
              <button disabled={busy} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {busy && <LuLoaderCircle className="animate-spin" />} Extend stay
              </button>
            </form>
          )}

          {tab === "guests" && (
            <div className="space-y-4">
              <form onSubmit={addGuest} className="flex gap-2">
                <input placeholder="Guest name" className="input flex-1" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                <input placeholder="ID/Passport (optional)" className="input flex-1" value={guestIdNumber} onChange={(e) => setGuestIdNumber(e.target.value)} />
                <button disabled={busy || !guestName.trim()} className="rounded-sm bg-secondary px-3 text-xs font-semibold text-secondary-foreground disabled:opacity-60">Add</button>
              </form>
              <div className="space-y-2">
                {reservation.additionalGuests.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-sm border p-3 text-sm">
                    <div>
                      <p className="font-medium">{g.name}{g.idNumber ? ` · ${g.idNumber}` : ""}</p>
                      <p className="text-xs text-muted-foreground">Added {new Date(g.addedAt).toLocaleString()}</p>
                    </div>
                    <button onClick={() => void removeGuest(g.id)} className="text-xs text-destructive hover:underline">Remove</button>
                  </div>
                ))}
                {reservation.additionalGuests.length === 0 && <p className="text-center text-sm text-muted-foreground">No additional guests recorded.</p>}
              </div>
            </div>
          )}

          {tab === "checkout" && (
            <div className="space-y-4">
              <div className="rounded-sm bg-muted/40 p-3 text-sm">
                <div className="flex justify-between"><span>Total charges</span><span>{formatKes(totals.charges)}</span></div>
                <div className="flex justify-between text-success"><span>Paid so far</span><span>-{formatKes(totals.paid)}</span></div>
                <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>Balance due</span><span>{formatKes(totals.balance)}</span></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select className="input" value={payMethodId} onChange={(e) => setPayMethodId(e.target.value)}>
                  <option value="">Select method</option>
                  {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input type="number" min="0" placeholder="Amount" className="input" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                <input placeholder={selectedPayMethod?.requiresReference ? "Reference *" : "Reference (optional)"} required={selectedPayMethod?.requiresReference} className="input" value={payReference} onChange={(e) => setPayReference(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void addDeposit()} disabled={busy || !payAmount || !payMethodId} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60">Record deposit</button>
                <button type="button" onClick={() => void completeCheckout()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-sm bg-success px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {busy && <LuLoaderCircle className="animate-spin" />} Complete checkout
                </button>
              </div>
              <p className="text-xs text-muted-foreground">"Record deposit" adds a payment without ending the stay. "Complete checkout" settles the folio, frees the room, and sends it to Housekeeping.</p>
            </div>
          )}

          {tab === "activity" && (
            <div className="space-y-2">
              {reservation.activities.length === 0 && <p className="text-center text-sm text-muted-foreground">No activity recorded yet.</p>}
              {reservation.activities.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 rounded-sm border p-3 text-sm">
                  <div>
                    <p className="font-medium">{a.summary}</p>
                    <p className="text-xs text-muted-foreground">{a.location ? a.location.name : "Location unknown"}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">{new Date(a.occurredAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

const TONE_INDEX: Record<"primary" | "secondary" | "accent", number> = { primary: 2, secondary: 4, accent: 1 };

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "primary" | "secondary" | "accent" }) {
  return <SharedStatCard index={TONE_INDEX[tone]} icon={icon} label={label} value={value} />;
}
function Msg({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div className={`mt-5 flex items-center gap-2 rounded-sm p-3 text-sm ${error ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
      {error ? <LuCircleAlert /> : <LuCheck />}
      {text}
    </div>
  );
}
