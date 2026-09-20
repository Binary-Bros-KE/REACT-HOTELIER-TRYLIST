import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LuBan,
  LuBedDouble,
  LuBuilding2,
  LuCalendarCheck,
  LuCircleAlert,
  LuCheck,
  LuLoaderCircle,
  LuLogIn,
  LuMapPin,
  LuUserPlus,
  LuUserRound,
  LuUsersRound,
  LuUsers,
  LuUserX,
  LuX,
} from "react-icons/lu";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useAppSelector } from "@/store/hooks";
import { useWorkingLocation } from "@/lib/useWorkingLocation";
import SharedStatCard from "@/components/ui/StatCard";
import ActionButton from "@/components/ui/ActionButton";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { hasVariants, roomPricing, roomPriceHint, toApiDate, unitWord, type RoomRateOption } from "@/lib/roomRates";
import GroupCheckInModal from "@/components/reception/GroupCheckInModal";
import GroupModal from "@/components/reception/GroupModal";
import RoomTermsFields, { CreditFields, defaultTerms, termsDiscount, termsFromReservation, termsInvalid, termsPayload, type RoomTerms } from "@/components/reception/RoomTerms";

const RESERVATION_SOURCES = ["WALK_IN", "PHONE", "WEBSITE", "BOOKING_ENGINE", "TRAVEL_AGENT", "OTA", "CORPORATE", "OTHER"] as const;
const CANCELLATION_REASONS = ["CHANGED_MIND", "NO_SHOW", "FOUND_ALTERNATIVE", "DUPLICATE_BOOKING", "HOTEL_CANCELLED", "OTHER"] as const;
const CUSTOMER_TYPES = ["PERSONAL", "BUSINESS"] as const;

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");

type Customer = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };
type Room = {
  id: string;
  number: string;
  name: string | null;
  roomType: { id: string; name: string; rates: RoomRateOption[]; priceUnit: { id: string; name: string } | null };
  capacity: number;
  nightlyRate: string | number;
  status: string;
  cleanliness: string;
};
type Service = { id: string; name: string; price: string | number; unit: { name: string } };
type FolioLineItem = { id: string; source: "ROOM" | "SERVICE" | "POS_ORDER" | "AD_HOC" | "DISCOUNT"; label: string; amount: string | number; quantity: number; createdAt: string };
type PaymentMethod = { id: string; name: string; requiresReference: boolean };
type FolioPayment = { id: string; kind: "DEPOSIT" | "SETTLEMENT"; paymentMethod: PaymentMethod; amount: string | number; reference: string | null; createdAt: string };
type Folio = { id: string; folioNo: string; status: "OPEN" | "SETTLED"; lineItems: FolioLineItem[]; payments: FolioPayment[]; creditAmount?: string | number; creditReason?: string | null; creditExpectedAt?: string | null; creditOutstanding?: number };
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
  group?: { id: string; name: string; groupNo: string } | null;
  roomSaleType?: "PAID" | "COMPLIMENTARY";
  complimentaryReason?: string | null;
  discountType?: "PERCENT" | "AMOUNT" | null;
  discountValue?: string | number;
  discountReason?: string | null;
};
type DeskLocation = { id: string; name: string; isActive?: boolean };
type GroupRow = {
  id: string;
  groupNo: string;
  name: string;
  customer: { firstName: string; lastName: string };
  summary: { rooms: number; pending: number; checkedIn: number; checkedOut: number; guests: number; charges: number; paid: number; balance: number; creditOutstanding: number };
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

/** api() that also tells the server which reception desk (location) this action is happening at. */
function apiAt(locationId: string) {
  return <T,>(path: string, init: RequestInit = {}) =>
    api<T>(path, { ...init, headers: { ...(locationId ? { "x-location-id": locationId } : {}), ...(init.headers as Record<string, string> | undefined) } });
}

type PillTone = "warning" | "secondary" | "success" | "muted" | "danger";
const PILL_TONES: Record<PillTone, string> = {
  warning: "border-warning/70 text-warning",
  secondary: "border-secondary/70 text-secondary",
  success: "border-success/70 text-success",
  muted: "border-muted-foreground/50 text-muted-foreground",
  danger: "border-destructive/70 text-destructive",
};
function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={cn("keep-round inline-block border border-dashed px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", PILL_TONES[tone])}>{children}</span>;
}
const STATUS_TONE: Record<ReservationStatus, PillTone> = {
  PENDING: "warning",
  CONFIRMED: "secondary",
  CHECKED_IN: "success",
  CHECKED_OUT: "muted",
  CANCELLED: "danger",
  NO_SHOW: "danger",
};

const TH = "px-5 py-3 text-xs font-bold uppercase tracking-wider";

/** Shared hard-edged modal chrome for every Reception dialog. */
function ModalShell({ kicker, title, subtitle, onClose, footer, wide, children }: {
  kicker: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-start justify-between gap-4 border-b-4 border-accent bg-muted/60 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{kicker}</p>
            <h2 className="mt-0.5 truncate font-display text-2xl font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex shrink-0 items-center gap-1.5 bg-black px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-black/80"><LuX className="size-4" /> Close</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-foreground/15 bg-muted/40 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export default function Reception() {
  const toast = useToast();
  const user = useAppSelector((s) => s.auth.user);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [locations, setLocations] = useState<DeskLocation[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [stayOpen, setStayOpen] = useState<Reservation | null>(null);
  const [newGuestOpen, setNewGuestOpen] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupOpenId, setGroupOpenId] = useState<string | null>(null);
  const [showClosedGroups, setShowClosedGroups] = useState(false);
  const { fixed: fixedLocation, options: pickableLocations, selectedId: selectedLocationId, setLocation, effectiveId: deskId } = useWorkingLocation(locations);
  const at = useMemo(() => apiAt(deskId), [deskId]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [c, r, b, g] = await Promise.all([
        api<{ customers: Customer[] }>("/reception/customers"),
        api<{ rooms: Room[] }>("/rooms/rooms"),
        api<{ reservations: Reservation[] }>("/reception/reservations"),
        api<{ groups: GroupRow[] }>("/reception/groups"),
      ]);
      setCustomers(c.customers);
      setRooms(r.rooms);
      setBookings(b.reservations);
      setGroups(g.groups);
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
  useEffect(() => {
    api<{ locations: DeskLocation[] }>("/locations").then((r) => setLocations(r.locations)).catch(() => {});
    api<{ profile: { businessName: string } | null }>("/business-profile").then((r) => setBusinessName(r.profile?.businessName ?? "")).catch(() => {});
  }, []);

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
  // Checked-out and cancelled/no-show stays move to Guest Stays — this list
  // stays a working queue instead of growing without bound.
  const activeBookings = bookings.filter((b) => b.status !== "CHECKED_OUT" && b.status !== "CANCELLED" && b.status !== "NO_SHOW");

  async function checkIn(reservation: Reservation) {
    setWorking(reservation.id);
    try {
      await at(`/reception/reservations/${reservation.id}/check-in`, { method: "PATCH" });
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
      await at(`/reception/reservations/${reservation.id}/no-show`, { method: "PATCH" });
      toast.success("Marked as no-show.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update reservation");
    } finally {
      setWorking("");
    }
  }

  // Who received the guest, and at which desk: the check-in (or, for a booking
  // not yet arrived, the creation) event's employee + location.
  const deskInfo = (b: Reservation) => {
    const event = b.activities.find((a) => a.action === "CHECKED_IN") ?? b.activities.find((a) => a.action === "CREATED");
    return { desk: event?.location?.name ?? b.location?.name ?? null, by: event?.employee ? `${event.employee.firstName} ${event.employee.lastName}` : null };
  };

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <div className="relative">
        <div className="pointer-events-none absolute -bottom-2 left-3 right-1 top-2 rotate-[0.6deg] border border-black/10 bg-white/70" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-2.5 -top-2.5 size-12 rotate-12 bg-[#f2921a] shadow-lg" aria-hidden="true" />
        <div
          className="relative flex flex-wrap items-center justify-between gap-2.5 overflow-hidden border border-black/10 bg-[#faf7f0] px-4 py-3 text-slate-800 shadow-[0_1px_1px_rgba(2,6,23,0.05),0_3px_5px_rgba(2,6,23,0.06),0_12px_22px_-8px_rgba(2,6,23,0.18)] sm:gap-3 sm:px-5 sm:py-4"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(2,6,23,0.055) 28px)" }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reception</p>
            <h1 className="mt-0.5 font-display text-sm font-semibold text-slate-900 sm:mt-1 sm:text-2xl">Check In</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-600 sm:gap-4">
            <span className="hidden items-center gap-1.5 sm:flex"><LuBuilding2 className="size-3.5" /> {businessName || "—"}</span>
            <span className="flex items-center gap-1.5"><LuUserRound className="size-3.5" /> {user ? `${user.firstName} ${user.lastName}` : "—"}</span>
            {fixedLocation ? (
              <span className="flex items-center gap-1.5"><LuMapPin className="size-3.5" /> {fixedLocation.name}</span>
            ) : pickableLocations.length > 0 ? (
              <label className="flex items-center gap-1.5">
                <LuMapPin className="size-3.5" />
                <select value={selectedLocationId} onChange={(e) => setLocation(e.target.value)} className="border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium text-slate-700 outline-none">
                  <option value="">Select desk…</option>
                  {pickableLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={<LuBedDouble className="size-4" />} label="Ready rooms" value={available.length} tone="primary" />
        <StatCard icon={<LuUsers className="size-4" />} label="Guests in house" value={bookings.filter((b) => b.status === "CHECKED_IN").length} tone="secondary" />
        <StatCard icon={<LuCalendarCheck className="size-4" />} label="Upcoming" value={bookings.filter((b) => b.status === "PENDING" || b.status === "CONFIRMED").length} tone="accent" />
      </section>

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Reservations &amp; check-ins</h2>
            <p className="text-xs text-muted-foreground">Completed and cancelled stays move to Guest Stays.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton tone="secondary" icon={<LuUsersRound />} onClick={() => setNewGroupOpen(true)}>New Group</ActionButton>
            <ActionButton tone="primary" icon={<LuUserPlus />} onClick={() => setNewGuestOpen(true)}>New Guest</ActionButton>
          </div>
        </div>
        {loading ? (
          <div className="p-16 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={TH}>Guest</th>
                  <th className={TH}>Room</th>
                  <th className={TH}>Stay</th>
                  <th className={TH}>Desk</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, "text-right")}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeBookings.map((b) => {
                  const info = deskInfo(b);
                  return (
                    <tr key={b.id} className="align-middle even:bg-muted/30">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold">{b.customer.firstName} {b.customer.lastName}</p>
                        <p className="text-xs text-muted-foreground">{b.reservationNo}{b.group && <button type="button" onClick={() => setGroupOpenId(b.group!.id)} className="ml-2 font-semibold text-secondary hover:underline">Group: {b.group.name}</button>}</p>
                      </td>
                      <td className="px-5 py-3.5">{b.room.number} · {b.room.roomType.name}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-muted-foreground">
                        {new Date(b.checkIn).toLocaleDateString()} – {new Date(b.checkOut).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium">{info.desk ?? "—"}</p>
                        {info.by && <p className="text-xs text-muted-foreground">by {info.by}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <Pill tone={STATUS_TONE[b.status]}>{titleCase(b.status)}</Pill>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap justify-end gap-2">
                          {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                            <>
                              <ActionButton tone="primary" icon={<LuLogIn />} loading={working === b.id} onClick={() => void checkIn(b)}>Check in</ActionButton>
                              <ActionButton tone="danger" icon={<LuBan />} onClick={() => setCancelling(b)}>Cancel</ActionButton>
                              {new Date(b.checkIn) <= new Date() && (
                                <ActionButton tone="neutral" icon={<LuUserX />} onClick={() => void markNoShow(b)}>No-show</ActionButton>
                              )}
                            </>
                          )}
                          {b.status === "CHECKED_IN" && (
                            <ActionButton tone="success" icon={<LuBedDouble />} onClick={() => setStayOpen(b)}>Manage stay</ActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {activeBookings.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">No reservations yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(() => {
        const visibleGroups = groups.filter((g) => showClosedGroups || g.summary.pending + g.summary.checkedIn > 0 || g.summary.creditOutstanding > 0.01);
        if (groups.length === 0) return null;
        return (
          <section className="mt-6 overflow-hidden border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div className="border-l-4 border-secondary pl-3">
                <h2 className="font-display text-xl font-semibold leading-tight">Groups</h2>
                <p className="text-xs text-muted-foreground">Parties booked together — check in, check out and pay for all their rooms at once.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showClosedGroups} onChange={(e) => setShowClosedGroups(e.target.checked)} /> Show completed groups</label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-primary text-primary-foreground"><tr><th className={TH}>Group</th><th className={TH}>Rooms</th><th className={TH}>Guests</th><th className={cn(TH, "text-right")}>Balance</th><th className={cn(TH, "text-right")}>Action</th></tr></thead>
                <tbody className="divide-y">
                  {visibleGroups.map((g) => (
                    <tr key={g.id} className="align-middle even:bg-muted/30">
                      <td className="px-5 py-3.5"><p className="font-semibold">{g.name}</p><p className="text-xs text-muted-foreground">{g.groupNo} · {g.customer.firstName} {g.customer.lastName}</p></td>
                      <td className="px-5 py-3.5">{g.summary.rooms}<span className="block text-xs text-muted-foreground">{g.summary.checkedIn} in house{g.summary.pending > 0 ? ` · ${g.summary.pending} waiting` : ""}{g.summary.checkedOut > 0 ? ` · ${g.summary.checkedOut} out` : ""}</span></td>
                      <td className="px-5 py-3.5">{g.summary.guests}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{formatKes(Math.max(0, g.summary.balance))}{g.summary.creditOutstanding > 0.01 && <span className="block text-xs font-semibold text-warning">{formatKes(g.summary.creditOutstanding)} on credit</span>}</td>
                      <td className="px-5 py-3.5 text-right"><ActionButton tone="success" icon={<LuUsersRound />} onClick={() => setGroupOpenId(g.id)}>Manage group</ActionButton></td>
                    </tr>
                  ))}
                  {visibleGroups.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">No active groups.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}

      {newGroupOpen && (
        <GroupCheckInModal
          customers={customers}
          rooms={rooms}
          at={at}
          onClose={() => setNewGroupOpen(false)}
          onDone={(id) => { setNewGroupOpen(false); void load(); setGroupOpenId(id); }}
          onCustomerCreated={() => void load(true)}
        />
      )}
      {groupOpenId && (
        <GroupModal
          groupId={groupOpenId}
          at={at}
          rooms={rooms}
          customers={customers}
          onClose={() => setGroupOpenId(null)}
          onChanged={() => void load(true)}
          onOpenStay={(id) => { const b = bookings.find((x) => x.id === id); if (b) setStayOpen(b); }}
        />
      )}
      {newGuestOpen && (
        <NewGuestModal
          customers={customers}
          rooms={rooms}
          at={at}
          onClose={() => setNewGuestOpen(false)}
          onDone={() => { setNewGuestOpen(false); void load(); }}
          onCustomerCreated={() => void load(true)}
        />
      )}
      {cancelling && (
        <CancelModal
          reservation={cancelling}
          at={at}
          onClose={() => setCancelling(null)}
          onCancelled={() => { setCancelling(null); void load(); }}
        />
      )}
      {stayOpen && (
        <StayModal
          reservation={stayOpen}
          at={at}
          onClose={() => setStayOpen(null)}
          onChanged={() => load(true)}
          onCheckedOut={() => { setStayOpen(null); void load(); }}
        />
      )}
    </div>
  );
}

type ApiAt = ReturnType<typeof apiAt>;

const STEPS = ["Guest", "Room & stay", "Booking"] as const;

function StepLabel({ n, label, state, onClick }: { n: number; label: string; state: "done" | "current" | "todo"; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex flex-1 items-center gap-2 border-b-4 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider transition",
        state === "current" ? "border-secondary bg-card text-foreground" : state === "done" ? "border-success bg-card text-success hover:bg-muted" : "border-transparent text-muted-foreground",
      )}
    >
      <span className={cn("flex size-5 items-center justify-center text-[11px]", state === "current" ? "bg-secondary text-secondary-foreground" : state === "done" ? "bg-success text-white" : "bg-muted")}>
        {state === "done" ? <LuCheck className="size-3" /> : n}
      </span>
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function NewGuestModal({ customers, rooms, at, onClose, onDone, onCustomerCreated }: {
  customers: Customer[];
  rooms: Room[];
  at: ApiAt;
  onClose: () => void;
  onDone: () => void;
  onCustomerCreated: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [guest, setGuest] = useState({ firstName: "", lastName: "", phone: "", email: "", customerType: "PERSONAL" as (typeof CUSTOMER_TYPES)[number] });
  const [roomId, setRoomId] = useState("");
  const [rateId, setRateId] = useState("");
  const [checkIn, setCheckIn] = useState(date());
  const [checkOut, setCheckOut] = useState(date(1));
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [source, setSource] = useState<(typeof RESERVATION_SOURCES)[number]>("WALK_IN");
  const [bookingDate, setBookingDate] = useState(date());
  const [arrival, setArrival] = useState<"CHECKED_IN" | "PENDING">("CHECKED_IN");
  const [terms, setTerms] = useState<RoomTerms>(defaultTerms());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const available = rooms.filter((r) => r.status === "VACANT" && r.cleanliness === "CLEAN");
  const room = rooms.find((r) => r.id === roomId);
  const chosenCustomer = customers.find((c) => c.id === customerId);
  const pricing = room ? roomPricing(room, rateId, checkIn, checkOut) : null;
  const hourly = Boolean(pricing?.hourly);
  const qty = pricing?.quantity ?? 0;
  const roomGross = pricing?.total ?? 0;
  const needsRate = Boolean(room) && hasVariants(room!) && !rateId;
  const roomOff = termsDiscount(terms, roomGross);
  const guestValid = mode === "existing" ? Boolean(customerId) : Boolean(guest.firstName.trim()) && guest.phone.trim().length >= 5;
  const stayValid = Boolean(roomId) && !needsRate && new Date(checkOut) > new Date(checkIn) && Number(adults) >= 1 && !termsInvalid(terms);
  const valid = [guestValid, stayValid, true];
  const guestName = mode === "existing" ? (chosenCustomer ? `${chosenCustomer.firstName} ${chosenCustomer.lastName}` : "—") : `${guest.firstName} ${guest.lastName}`.trim() || "—";

  function pickRoom(id: string) {
    setRoomId(id);
    setRateId("");
    const dated = (v: string) => v.slice(0, 10);
    setCheckIn((v) => dated(v));
    setCheckOut((v) => dated(v));
  }
  function pickRate(id: string) {
    setRateId(id);
    const chosen = room?.roomType.rates.find((r) => r.id === id);
    const wantsTime = chosen ? /\bhours?\b|\bhrs?\b/i.test(chosen.unit?.name ?? "") && !/\b24\b/.test(chosen.unit?.name ?? "") : false;
    const stamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
    if (wantsTime) {
      const start = new Date();
      start.setMinutes(0, 0, 0);
      setCheckIn(stamp(start));
      setCheckOut(stamp(new Date(start.getTime() + 3_600_000)));
    } else {
      setCheckIn((v) => v.slice(0, 10) || date());
      setCheckOut((v) => (v.length > 10 || !v ? date(1) : v));
    }
  }

  async function complete() {
    setSaving(true);
    setError("");
    try {
      let id = customerId;
      if (mode === "new") {
        const created = await at<{ customer: Customer }>("/reception/customers", {
          method: "POST",
          body: JSON.stringify({ ...guest, lastName: guest.lastName || undefined, email: guest.email || undefined }),
        });
        id = created.customer.id;
        // If the booking below fails, retrying must not create the guest twice.
        setCustomerId(id);
        setMode("existing");
        onCustomerCreated();
      }
      await at("/reception/reservations", {
        method: "POST",
        body: JSON.stringify({
          customerId: id,
          roomId,
          rateId: rateId || undefined,
          checkIn: toApiDate(checkIn),
          checkOut: toApiDate(checkOut),
          adults: Number(adults),
          children: Number(children),
          source,
          bookingDate,
          notes: notes.trim() || undefined,
          status: arrival,
          ...termsPayload(terms),
        }),
      });
      toast.success(arrival === "CHECKED_IN" ? "Guest checked in." : "Reservation created.");
      onDone();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not complete this booking";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const last = step === STEPS.length - 1;
  return (
    <ModalShell
      wide
      kicker="Reception"
      title="New Guest"
      subtitle={STEPS[step]}
      onClose={onClose}
      footer={
        <>
          {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Back</button>}
          {!last ? (
            <button type="button" disabled={!valid[step]} onClick={() => setStep(step + 1)} className="bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-50">Next</button>
          ) : (
            <button type="button" disabled={saving || !valid[0] || !valid[1]} onClick={() => void complete()} className="inline-flex items-center gap-2 bg-success px-5 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
              {saving && <LuLoaderCircle className="size-4 animate-spin" />} Complete
            </button>
          )}
        </>
      }
    >
      <div className="flex border-b bg-muted/40">
        {STEPS.map((label, i) => (
          <StepLabel key={label} n={i + 1} label={label} state={i === step ? "current" : i < step ? "done" : "todo"} onClick={i < step || (i > step && valid.slice(0, i).every(Boolean)) ? () => setStep(i) : undefined} />
        ))}
      </div>

      <div className="space-y-5 p-5">
        {error && <div className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        {step === 0 && (
          <>
            <div className="grid grid-cols-2 border-2 border-foreground/20 text-xs font-bold uppercase tracking-wider">
              {(["existing", "new"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={cn("px-3 py-2.5 transition", mode === m ? "bg-secondary text-secondary-foreground" : "bg-card hover:bg-muted")}>
                  {m === "existing" ? "Existing guest" : "Create new guest"}
                </button>
              ))}
            </div>
            {mode === "existing" ? (
              <Section title="Select from your guests">
                <div className="sm:col-span-2">
                  <SearchableSelect
                    options={customers.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`.trim(), hint: c.phone ?? undefined }))}
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="Search guest by name or phone…"
                    searchPlaceholder="Search guests…"
                    emptyText="No guests match — create a new one."
                  />
                </div>
                {chosenCustomer && (
                  <p className="border bg-muted/40 p-3 text-xs text-muted-foreground sm:col-span-2">
                    {chosenCustomer.phone ?? "No phone"}{chosenCustomer.email ? ` · ${chosenCustomer.email}` : ""}
                  </p>
                )}
              </Section>
            ) : (
              <Section title="Guest details">
                <label className="text-sm font-medium sm:col-span-2">Guest type
                  <select className="input mt-1.5" value={guest.customerType} onChange={(e) => setGuest({ ...guest, customerType: e.target.value as (typeof CUSTOMER_TYPES)[number] })}>
                    {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">First name *<input className="input mt-1.5" value={guest.firstName} onChange={(e) => setGuest({ ...guest, firstName: e.target.value })} /></label>
                <label className="text-sm font-medium">Last name<input className="input mt-1.5" value={guest.lastName} onChange={(e) => setGuest({ ...guest, lastName: e.target.value })} /></label>
                <label className="text-sm font-medium">Phone *<input className="input mt-1.5" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></label>
                <label className="text-sm font-medium">Email<input type="email" className="input mt-1.5" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></label>
              </Section>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Section title="Room">
              <div className="sm:col-span-2">
                <SearchableSelect
                  options={available.map((r) => ({ value: r.id, label: `Room ${r.number}${r.name ? ` — ${r.name}` : ""} · ${r.roomType.name}`, hint: `${r.capacity} guests · ${roomPriceHint(r)}` }))}
                  value={roomId}
                  onChange={pickRoom}
                  placeholder={available.length ? "Select a clean, vacant room" : "No rooms are ready right now"}
                  searchPlaceholder="Search rooms…"
                  emptyText="No ready rooms match."
                  disabled={available.length === 0}
                />
                {rooms.length > available.length && <p className="mt-1.5 text-xs text-muted-foreground">{rooms.length - available.length} room(s) unavailable (occupied, dirty or out of service).</p>}
              </div>
              {room && hasVariants(room) && (
                <label className="text-sm font-medium sm:col-span-2">Rate *
                  <select className="input mt-1.5" value={rateId} onChange={(e) => pickRate(e.target.value)}>
                    <option value="" disabled>Select a rate</option>
                    {room.roomType.rates.map((r) => <option key={r.id} value={r.id}>{r.name} — KSh {Number(r.price).toLocaleString("en-KE")}{r.unit ? ` / ${unitWord(r.unit.name)}` : ""}</option>)}
                  </select>
                </label>
              )}
              {room && !hasVariants(room) && (
                <p className="border bg-muted/40 p-3 text-xs text-muted-foreground sm:col-span-2">Price: <span className="font-semibold text-foreground">{roomPriceHint(room)}</span></p>
              )}
            </Section>
            <Section title="Room terms">
              <div className="sm:col-span-2"><RoomTermsFields value={terms} onChange={setTerms} roomTotal={room ? roomGross : undefined} /></div>
            </Section>
            <Section title="Stay">
              <label className="text-sm font-medium">{hourly ? "Start" : "Check-in date"}<input type={hourly ? "datetime-local" : "date"} className="input mt-1.5" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></label>
              <label className="text-sm font-medium">{hourly ? "End" : "Check-out date"}<input type={hourly ? "datetime-local" : "date"} className="input mt-1.5" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></label>
              <label className="text-sm font-medium">Adults<input type="number" min="1" className="input mt-1.5" value={adults} onChange={(e) => setAdults(e.target.value)} /></label>
              <label className="text-sm font-medium">Children<input type="number" min="0" className="input mt-1.5" value={children} onChange={(e) => setChildren(e.target.value)} /></label>
            </Section>
            {room && (
              <div className="flex items-start justify-between gap-3 border border-l-4 border-l-secondary bg-secondary/5 p-3">
                <div>
                  <p className="text-sm font-semibold">Room {room.number} · {room.roomType.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{needsRate ? "Choose a rate to see the price" : `${qty} ${unitWord(pricing?.unitName)}${qty === 1 ? "" : "s"}${pricing?.rateName ? ` · ${pricing.rateName}` : ""}`} · sleeps {room.capacity}</p>
                </div>
                <p className="text-right text-sm font-bold text-secondary">{formatKes(roomGross - roomOff)}<span className="block text-[11px] font-normal text-muted-foreground">{roomOff > 0 ? `${formatKes(roomGross)} less ${formatKes(roomOff)}` : `${formatKes(pricing?.unitPrice ?? 0)} / ${unitWord(pricing?.unitName)}`}</span></p>
              </div>
            )}
            {new Date(checkOut) <= new Date(checkIn) && <p className="text-xs font-semibold text-destructive">{hourly ? "End must be after start." : "Check-out must be after check-in."}</p>}
            {needsRate && <p className="text-xs font-semibold text-destructive">This room is sold by rate — pick one to continue.</p>}
          </>
        )}

        {step === 2 && (
          <>
            <Section title="Booking details">
              <label className="text-sm font-medium">Source
                <select className="input mt-1.5" value={source} onChange={(e) => setSource(e.target.value as (typeof RESERVATION_SOURCES)[number])}>
                  {RESERVATION_SOURCES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Booking date<input type="date" className="input mt-1.5" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} /></label>
              <label className="text-sm font-medium sm:col-span-2">Notes <span className="font-normal text-muted-foreground">(optional)</span>
                <textarea rows={2} className="input mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </Section>
            <Section title="Arrival">
              <div className="grid grid-cols-2 border-2 border-foreground/20 text-xs font-bold uppercase tracking-wider sm:col-span-2">
                {([["CHECKED_IN", "Check in now"], ["PENDING", "Reserve for later"]] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setArrival(value)} className={cn("px-3 py-2.5 transition", arrival === value ? "bg-secondary text-secondary-foreground" : "bg-card hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </Section>
            <div className="divide-y border bg-muted/30 text-sm">
              {([
                ["Guest", guestName],
                ["Room", room ? `Room ${room.number} · ${room.roomType.name}` : "—"],
                ["Stay", hourly ? `${new Date(checkIn).toLocaleString()} – ${new Date(checkOut).toLocaleTimeString()} (${qty} ${unitWord(pricing?.unitName)}${qty === 1 ? "" : "s"})` : `${new Date(checkIn).toLocaleDateString()} – ${new Date(checkOut).toLocaleDateString()} (${qty} ${unitWord(pricing?.unitName)}${qty === 1 ? "" : "s"})`],
                ["Rate", pricing?.rateName ?? "Standard"],
                ["Guests", `${adults} adult${Number(adults) === 1 ? "" : "s"}${Number(children) > 0 ? `, ${children} child${Number(children) === 1 ? "" : "ren"}` : ""}`],
                ["Room sale", terms.roomSaleType === "COMPLIMENTARY" ? "Complimentary" : roomOff > 0 ? `Paid — ${formatKes(roomOff)} discount` : "Paid"],
                ["Room total", room ? formatKes(roomGross - roomOff) : "—"],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-3 py-2"><span className="text-muted-foreground">{k}</span><span className="text-right font-semibold">{v}</span></div>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function CancelModal({ reservation, at, onClose, onCancelled }: { reservation: Reservation; at: ApiAt; onClose: () => void; onCancelled: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<(typeof CANCELLATION_REASONS)[number]>("CHANGED_MIND");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await at(`/reception/reservations/${reservation.id}/cancel`, { method: "PATCH", body: JSON.stringify({ cancellationReason: reason, cancellationNotes: notes || undefined }) });
      toast.success("Reservation cancelled.");
      onCancelled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel reservation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      kicker="Cancel reservation"
      title={`${reservation.customer.firstName} ${reservation.customer.lastName}`}
      subtitle={reservation.reservationNo}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Back</button>
          <button form="cancel-reservation-form" disabled={saving} className="inline-flex items-center gap-2 bg-destructive px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />} Cancel reservation
          </button>
        </>
      }
    >
      <form id="cancel-reservation-form" onSubmit={submit} className="space-y-3 p-5">
        <label className="block text-sm font-medium">
          Reason
          <select className="input mt-1.5" value={reason} onChange={(e) => setReason(e.target.value as (typeof CANCELLATION_REASONS)[number])}>
            {CANCELLATION_REASONS.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Notes (optional)
          <textarea rows={2} className="input mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </form>
    </ModalShell>
  );
}

function StayModal({ reservation, at, onClose, onChanged, onCheckedOut }: { reservation: Reservation; at: ApiAt; onClose: () => void; onChanged: () => void; onCheckedOut: () => void }) {
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
  const [creditReason, setCreditReason] = useState("");
  const [creditExpectedAt, setCreditExpectedAt] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);
  const [terms, setTerms] = useState<RoomTerms>(termsFromReservation(reservation));
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
  const enteredPay = Number(payAmount) || 0;
  // Whatever the guest isn't paying now is left owing — completed on credit.
  const onCredit = Math.round((totals.balance - enteredPay) * 100) / 100;

  async function saveTerms() {
    if (termsInvalid(terms)) { toast.error(termsInvalid(terms)!); return; }
    setBusy(true);
    try {
      await at(`/reception/reservations/${reservation.id}/room-terms`, { method: "PATCH", body: JSON.stringify(termsPayload(terms)) });
      toast.success("Room terms updated.");
      setTermsOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update room terms");
    } finally {
      setBusy(false);
    }
  }

  async function extend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await at(`/reception/reservations/${reservation.id}/extend`, { method: "PATCH", body: JSON.stringify({ checkOut: extendDate }) });
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
      await at(`/reception/reservations/${reservation.id}/folio/charges`, { method: "POST", body: JSON.stringify({ source: "SERVICE", sourceRefId: serviceId, quantity: Number(serviceQty) || 1 }) });
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
      await at(`/reception/reservations/${reservation.id}/folio/charges`, { method: "POST", body: JSON.stringify({ source: "AD_HOC", label: adHocLabel, amount: Number(adHocAmount) }) });
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
      await at(`/reception/reservations/${reservation.id}/folio/charges/${lineItemId}`, { method: "DELETE" });
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
      await at(`/reception/reservations/${reservation.id}/guests`, { method: "POST", body: JSON.stringify({ name: guestName, idNumber: guestIdNumber || undefined }) });
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
      await at(`/reception/reservations/${reservation.id}/guests/${guestId}`, { method: "DELETE" });
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
      await at(`/reception/reservations/${reservation.id}/folio/deposits`, { method: "POST", body: JSON.stringify({ paymentMethodId: payMethodId, amount: Number(payAmount), reference: payReference || undefined }) });
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
    if (onCredit > 0.01 && (creditReason.trim().length < 3 || !creditExpectedAt)) { toast.error("Give a reason for the credit and an expected payment date"); return; }
    setBusy(true);
    try {
      await at(`/reception/reservations/${reservation.id}/checkout`, { method: "PATCH", body: JSON.stringify({ paymentMethodId: amount > 0 ? payMethodId : undefined, amount, reference: payReference || undefined, ...(onCredit > 0.01 ? { creditReason: creditReason.trim(), creditExpectedAt } : {}) }) });
      toast.success(onCredit > 0.01 ? `Room ${reservation.room.number}: checked out on credit (${formatKes(onCredit)} owing).` : `Room ${reservation.room.number}: checked out and sent to Housekeeping.`);
      onCheckedOut();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      wide
      kicker={reservation.folio?.folioNo ?? "Stay"}
      title={`${reservation.customer.firstName} ${reservation.customer.lastName}`}
      subtitle={`Room ${reservation.room.number} · ${reservation.room.roomType.name} · ${reservation.reservationNo}`}
      onClose={onClose}
    >
        <div className="flex border-b bg-muted/40">
          {([["folio", "Folio"], ["extend", "Extend"], ["guests", "Guests"], ["checkout", "Checkout"], ["activity", "Activity"]] as const).map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} className={cn("flex-1 border-b-4 px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition", tab === value ? "border-secondary bg-card text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "folio" && (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-sm border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                    <tr><th className="px-3 py-2">Charge</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2 text-right">Amount</th><th /></tr>
                  </thead>
                  <tbody>
                    {(reservation.folio?.lineItems ?? []).map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">{item.label}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatKes(Number(item.amount) * item.quantity)}</td>
                        <td className="px-2 py-2 text-right">
                          {item.source !== "ROOM" && item.source !== "DISCOUNT" && <button onClick={() => void removeCharge(item.id)} className="text-xs text-destructive hover:underline">Remove</button>}
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

              <div className="rounded-sm border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm"><span className="font-semibold">Room sale:</span> {reservation.roomSaleType === "COMPLIMENTARY" ? "Complimentary" : reservation.discountType && Number(reservation.discountValue) > 0 ? `Paid — ${reservation.discountType === "PERCENT" ? `${Number(reservation.discountValue)}%` : formatKes(Number(reservation.discountValue))} discount` : "Paid"}</p>
                  <button type="button" onClick={() => { setTerms(termsFromReservation(reservation)); setTermsOpen((v) => !v); }} className="text-xs font-semibold text-secondary hover:underline">{termsOpen ? "Close" : "Change room terms"}</button>
                </div>
                {termsOpen && (
                  <div className="mt-3 space-y-3">
                    <RoomTermsFields value={terms} onChange={setTerms} roomTotal={totals.charges > 0 ? reservation.folio?.lineItems.filter((l) => l.source === "ROOM").reduce((sum, l) => sum + Number(l.amount) * l.quantity, 0) : undefined} />
                    <button type="button" disabled={busy} onClick={() => void saveTerms()} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">{busy && <LuLoaderCircle className="animate-spin" />} Save room terms</button>
                  </div>
                )}
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
              {totals.balance > 0.01 && (
                <button type="button" onClick={() => setPayAmount(String(Math.round(totals.balance * 100) / 100))} className="text-xs font-semibold text-secondary hover:underline">Pay the full balance ({formatKes(totals.balance)})</button>
              )}
              {onCredit > 0.01 && <CreditFields reason={creditReason} expectedAt={creditExpectedAt} onReason={setCreditReason} onExpectedAt={setCreditExpectedAt} />}
              {onCredit > 0.01 && <p className="text-xs font-semibold text-warning">{formatKes(onCredit)} will be left owing on this guest's account.</p>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void addDeposit()} disabled={busy || !payAmount || !payMethodId} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60">Record deposit</button>
                <button type="button" onClick={() => void completeCheckout()} disabled={busy} className={cn("inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60", onCredit > 0.01 ? "bg-warning" : "bg-success")}>
                  {busy && <LuLoaderCircle className="animate-spin" />} {onCredit > 0.01 ? "Complete on credit" : "Complete checkout"}
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
    </ModalShell>
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
