import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  LuBedDouble,
  LuCircleAlert,
  LuCircleCheck,
  LuDoorOpen,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuReceiptText,
  LuSearch,
  LuSettings2,
  LuSparkles,
  LuTrash2,
  LuUsers,
} from "react-icons/lu";

import { api } from "@/lib/api";
import SharedStatCard from "@/components/ui/StatCard";
import ActionButton from "@/components/ui/ActionButton";
import PageBanner from "@/components/ui/PageBanner";
import ModalShell from "@/components/ui/ModalShell";
import StatusPill from "@/components/ui/StatusPill";
import { cn } from "@/lib/utils";

type RoomStatus = "VACANT" | "OCCUPIED" | "OUT_OF_SERVICE";
type Cleanliness = "CLEAN" | "DIRTY" | "INSPECTING";
type FolioLineItem = { id: string; amount: string | number; quantity: number };
type FolioPayment = { id: string; amount: string | number };
type Folio = { lineItems: FolioLineItem[]; payments: FolioPayment[] };
type Stay = {
  id: string;
  checkIn: string;
  checkOut: string;
  customer: { firstName: string; lastName: string | null };
  folio: Folio | null;
};
const MEAL_PLANS = ["ROOM_ONLY", "BED_AND_BREAKFAST", "HALF_BOARD", "FULL_BOARD"] as const;
type MealPlan = (typeof MEAL_PLANS)[number];
const mealPlanLabels: Record<MealPlan, string> = {
  ROOM_ONLY: "Room Only",
  BED_AND_BREAKFAST: "Bed & Breakfast",
  HALF_BOARD: "Half Board",
  FULL_BOARD: "Full Board",
};
type AuditEmployee = { id: string; firstName: string; lastName: string } | null;
type Room = {
  id: string;
  number: string;
  name: string | null;
  roomType: { id: string; name: string; baseRate: string | number };
  floor: string | null;
  wing: string | null;
  notes: string | null;
  capacity: number;
  nightlyRate: string | number;
  status: RoomStatus;
  cleanliness: Cleanliness;
  reservations: Stay[];
  _count: { reservations: number };
  createdAt: string;
  updatedAt: string;
  createdByEmployee: AuditEmployee;
  updatedByEmployee: AuditEmployee;
};
type Summary = {
  total: number;
  vacant: number;
  occupied: number;
  outOfService: number;
  dirty: number;
};
type RoomType = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  baseRate: string | number;
  amenities: string[];
  isActive: boolean;
  rates: { mealPlan: MealPlan; price: string | number }[];
  createdAt: string;
  updatedAt: string;
  createdByEmployee: AuditEmployee;
  updatedByEmployee: AuditEmployee;
};
type TypeForm = {
  name: string;
  description: string;
  capacity: string;
  baseRate: string;
  amenities: string;
  isActive: boolean;
  rateRoomOnly: string;
  rateBedAndBreakfast: string;
  rateHalfBoard: string;
  rateFullBoard: string;
};
const emptyTypeForm: TypeForm = {
  name: "",
  description: "",
  capacity: "2",
  baseRate: "8500",
  amenities: "",
  isActive: true,
  rateRoomOnly: "",
  rateBedAndBreakfast: "",
  rateHalfBoard: "",
  rateFullBoard: "",
};
type RateFormKey = "rateRoomOnly" | "rateBedAndBreakfast" | "rateHalfBoard" | "rateFullBoard";
const mealPlanFormKey: Record<MealPlan, RateFormKey> = {
  ROOM_ONLY: "rateRoomOnly",
  BED_AND_BREAKFAST: "rateBedAndBreakfast",
  HALF_BOARD: "rateHalfBoard",
  FULL_BOARD: "rateFullBoard",
};
type RoomForm = {
  number: string;
  name: string;
  roomTypeId: string;
  floor: string;
  wing: string;
  notes: string;
  capacity: string;
  nightlyRate: string;
  status: RoomStatus;
  cleanliness: Cleanliness;
};
const emptyForm: RoomForm = {
  number: "",
  name: "",
  roomTypeId: "",
  floor: "",
  wing: "",
  notes: "",
  capacity: "2",
  nightlyRate: "8500",
  status: "VACANT",
  cleanliness: "CLEAN",
};
const formatKes = (value: number) =>
  `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
// The real folio (room charges + services + ad-hoc + any POS orders billed
// to this stay), not a hand-rolled approximation — replaces the old
// POS-orders-only sum, which never included room charges and ignored
// discount/tax entirely.
const folioTotal = (stay?: Stay) => {
  const folio = stay?.folio;
  if (!folio) return 0;
  const charges = folio.lineItems.reduce((sum, item) => sum + Number(item.amount) * item.quantity, 0);
  const paid = folio.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  return charges - paid;
};

export default function Rooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    vacant: 0,
    occupied: 0,
    outOfService: 0,
    dirty: 0,
  });
  const [filter, setFilter] = useState<"ALL" | RoomStatus>("ALL");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<RoomForm>(emptyForm);
  const [editing, setEditing] = useState<Room | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [typeForm, setTypeForm] = useState<TypeForm>(emptyTypeForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [response, typeResponse] = await Promise.all([
        api<{ rooms: Room[]; summary: Summary }>("/rooms/rooms"),
        api<{ types: RoomType[] }>("/rooms/types"),
      ]);
      setRooms(response.rooms);
      setSummary(response.summary);
      setRoomTypes(typeResponse.types);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load rooms");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const visibleRooms = useMemo(
    () =>
      rooms.filter(
        (room) =>
          (filter === "ALL" || room.status === filter) &&
          (!search.trim() ||
            `${room.number} ${room.name ?? ""} ${room.roomType.name}`
              .toLowerCase()
              .includes(search.toLowerCase().trim())),
      ),
    [filter, rooms, search],
  );
  function rateFor(type: RoomType, mealPlan: MealPlan) {
    return type.rates.find((r) => r.mealPlan === mealPlan)?.price;
  }
  function openCreate() {
    const selected = roomTypes.find((type) => type.isActive);
    setEditing(null);
    setForm({
      ...emptyForm,
      roomTypeId: selected?.id ?? "",
      capacity: String(selected?.capacity ?? 2),
      nightlyRate: String(selected ? (rateFor(selected, "ROOM_ONLY") ?? selected.baseRate) : 0),
    });
    setShowForm(true);
    setError("");
  }
  function openEdit(room: Room) {
    setEditing(room);
    setForm({
      number: room.number,
      name: room.name ?? "",
      roomTypeId: room.roomType.id,
      floor: room.floor ?? "",
      wing: room.wing ?? "",
      notes: room.notes ?? "",
      capacity: String(room.capacity),
      nightlyRate: String(room.nightlyRate),
      status: room.status,
      cleanliness: room.cleanliness,
    });
    setShowForm(true);
    setError("");
  }

  async function saveRoom(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(editing ? `/rooms/rooms/${editing.id}` : "/rooms/rooms", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          name: form.name.trim() || undefined,
          capacity: Number(form.capacity),
          nightlyRate: Number(form.nightlyRate),
        }),
      });
      setNotice(
        editing
          ? `Room ${form.number} updated.`
          : `Room ${form.number} created.`,
      );
      setShowForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save room");
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdate(
    room: Room,
    changes: Partial<Pick<Room, "status" | "cleanliness">>,
  ) {
    setError("");
    setNotice("");
    try {
      await api(`/rooms/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setNotice(`Room ${room.number} updated.`);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update room",
      );
    }
  }

  async function removeRoom(room: Room) {
    if (!window.confirm(`Delete room ${room.number}?`)) return;
    try {
      await api(`/rooms/rooms/${room.id}`, { method: "DELETE" });
      setNotice(`Room ${room.number} deleted.`);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete room",
      );
    }
  }

  function selectRoomType(id: string) {
    const selected = roomTypes.find((type) => type.id === id);
    setForm({
      ...form,
      roomTypeId: id,
      capacity: String(selected?.capacity ?? form.capacity),
      nightlyRate: String(selected ? (rateFor(selected, "ROOM_ONLY") ?? selected.baseRate) : form.nightlyRate),
    });
  }
  function editRoomType(type: RoomType) {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      description: type.description ?? "",
      capacity: String(type.capacity),
      baseRate: String(type.baseRate),
      amenities: type.amenities.join(", "),
      isActive: type.isActive,
      rateRoomOnly: String(rateFor(type, "ROOM_ONLY") ?? ""),
      rateBedAndBreakfast: String(rateFor(type, "BED_AND_BREAKFAST") ?? ""),
      rateHalfBoard: String(rateFor(type, "HALF_BOARD") ?? ""),
      rateFullBoard: String(rateFor(type, "FULL_BOARD") ?? ""),
    });
  }
  function resetTypeForm() {
    setEditingType(null);
    setTypeForm(emptyTypeForm);
  }
  async function saveRoomType(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const rates = MEAL_PLANS.filter((plan) => typeForm[mealPlanFormKey[plan]].trim() !== "").map((plan) => ({
        mealPlan: plan,
        price: Number(typeForm[mealPlanFormKey[plan]]),
      }));
      await api(
        editingType ? `/rooms/types/${editingType.id}` : "/rooms/types",
        {
          method: editingType ? "PATCH" : "POST",
          body: JSON.stringify({
            name: typeForm.name,
            description: typeForm.description,
            capacity: Number(typeForm.capacity),
            baseRate: Number(typeForm.baseRate),
            isActive: typeForm.isActive,
            amenities: typeForm.amenities
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            rates,
          }),
        },
      );
      setNotice(editingType ? "Room type updated." : "Room type created.");
      resetTypeForm();
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save room type",
      );
    } finally {
      setSaving(false);
    }
  }
  async function removeRoomType(type: RoomType) {
    if (!window.confirm(`Delete room type ${type.name}?`)) return;
    try {
      await api(`/rooms/types/${type.id}`, { method: "DELETE" });
      setNotice("Room type deleted.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete room type",
      );
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Room operations" title="Room Management" />
      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-5 flex items-center gap-2 border border-success/25 bg-success/10 p-3 text-sm text-success">
          <LuCircleCheck />
          {notice}
        </div>
      )}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard index={0} label="All rooms" value={summary.total} icon={<LuBedDouble />} tone="secondary" />
        <SummaryCard index={1} label="Vacant" value={summary.vacant} icon={<LuDoorOpen />} tone="success" />
        <SummaryCard index={2} label="Occupied" value={summary.occupied} icon={<LuUsers />} tone="secondary" />
        <SummaryCard index={3} label="Out of service" value={summary.outOfService} icon={<LuCircleAlert />} tone="warning" />
        <SummaryCard index={4} label="Need cleaning" value={summary.dirty} icon={<LuSparkles />} tone="warning" />
      </section>

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">Room board</h2>
            <p className="text-xs text-muted-foreground">Live occupancy, housekeeping status and folio balances.</p>
          </div>
          <div className="flex flex-wrap border">
            {(
              [
                ["ALL", "All"],
                ["VACANT", "Vacant"],
                ["OCCUPIED", "Occupied"],
                ["OUT_OF_SERVICE", "Out of service"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition",
                  filter === value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search rooms…"
              className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:w-56"
            />
          </label>
          <div className="flex gap-2">
            <ActionButton tone="neutral" icon={<LuSettings2 />} onClick={() => setShowTypes(true)}>Room types</ActionButton>
            <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>Add room</ActionButton>
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LuLoaderCircle className="animate-spin" /> Loading rooms…
          </div>
        ) : visibleRooms.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">No rooms match this view.</div>
        ) : (
          <div className="grid gap-4 bg-muted/30 p-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onEdit={() => openEdit(room)}
                onDelete={() => void removeRoom(room)}
                onStatus={(status) => void quickUpdate(room, { status })}
                onCleanliness={(cleanliness) => void quickUpdate(room, { cleanliness })}
              />
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <ModalShell
          kicker={editing ? "Edit room" : "New room"}
          title={editing ? `Room ${editing.number}` : "Add room inventory"}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="room-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? "Save changes" : "Create room"}
              </button>
            </>
          }
        >
          <form id="room-form" onSubmit={saveRoom} className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Room number">
                <input required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="input" />
              </Field>
              <Field label="Room name">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Optional" className="input" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Room type">
                  <select required value={form.roomTypeId} onChange={(event) => selectRoomType(event.target.value)} className="input">
                    <option value="">Select a room type</option>
                    {roomTypes
                      .filter((type) => type.isActive || type.id === form.roomTypeId)
                      .map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name} · {type.capacity} guests · {formatKes(Number(type.baseRate))}
                        </option>
                      ))}
                  </select>
                </Field>
                {roomTypes.find((type) => type.id === form.roomTypeId) && (
                  <div className="mt-2 border border-l-4 border-l-secondary bg-secondary/5 p-3 text-xs text-muted-foreground">
                    <p>{roomTypes.find((type) => type.id === form.roomTypeId)?.description || "No description"}</p>
                    <p className="mt-1 font-medium text-secondary">
                      {roomTypes.find((type) => type.id === form.roomTypeId)?.amenities.join(" · ") || "No amenities configured"}
                    </p>
                  </div>
                )}
              </div>
              <Field label="Floor">
                <input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="e.g. 2" className="input" />
              </Field>
              <Field label="Wing">
                <input value={form.wing} onChange={(e) => setForm({ ...form, wing: e.target.value })} placeholder="e.g. East Wing" className="input" />
              </Field>
              <Field label="Guest capacity">
                <input required min="1" max="20" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="input" />
              </Field>
              <Field label="Nightly rate">
                <input required min="0" type="number" value={form.nightlyRate} onChange={(e) => setForm({ ...form, nightlyRate: e.target.value })} className="input" />
              </Field>
              <Field label="Room status">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RoomStatus })} className="input">
                  <option value="VACANT">Vacant</option>
                  <option value="OCCUPIED">Occupied</option>
                  <option value="OUT_OF_SERVICE">Out of service</option>
                </select>
              </Field>
              <Field label="Housekeeping">
                <select value={form.cleanliness} onChange={(e) => setForm({ ...form, cleanliness: e.target.value as Cleanliness })} className="input">
                  <option value="CLEAN">Clean</option>
                  <option value="DIRTY">Dirty</option>
                  <option value="INSPECTING">Inspecting</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything worth remembering about this room" className="input" rows={2} />
                </Field>
              </div>
            </div>
            {editing && (editing.createdByEmployee || editing.updatedByEmployee) && (
              <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
                {editing.createdByEmployee && <>Created by {editing.createdByEmployee.firstName} {editing.createdByEmployee.lastName} on {new Date(editing.createdAt).toLocaleDateString()}</>}
                {editing.createdByEmployee && editing.updatedByEmployee && " · "}
                {editing.updatedByEmployee && <>Last updated by {editing.updatedByEmployee.firstName} {editing.updatedByEmployee.lastName} on {new Date(editing.updatedAt).toLocaleDateString()}</>}
              </p>
            )}
          </form>
        </ModalShell>
      )}

      {showTypes && (
        <ModalShell
          size="xl"
          kicker="Admin customization"
          title="Room types"
          subtitle="Capacity, rates and amenities used when adding rooms."
          onClose={() => { setShowTypes(false); resetTypeForm(); }}
        >
          <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
            <form onSubmit={saveRoomType} className="border-b bg-muted/30 p-5 lg:border-b-0 lg:border-r">
              <p className="mb-3 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {editingType ? "Edit room type" : "New room type"}
              </p>
              <div className="space-y-3">
                <input required value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Type name" className="input" />
                <textarea value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} placeholder="Description" className="input" />
                <div className="grid grid-cols-2 gap-2">
                  <input required min="1" max="20" type="number" value={typeForm.capacity} onChange={(e) => setTypeForm({ ...typeForm, capacity: e.target.value })} placeholder="Capacity" className="input" />
                  <input required min="0" type="number" value={typeForm.baseRate} onChange={(e) => setTypeForm({ ...typeForm, baseRate: e.target.value })} placeholder="Base rate" className="input" />
                </div>
                <input value={typeForm.amenities} onChange={(e) => setTypeForm({ ...typeForm, amenities: e.target.value })} placeholder="Amenities, comma separated" className="input" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rate tiers (leave blank to skip)</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {MEAL_PLANS.map((plan) => (
                      <input
                        key={plan}
                        type="number"
                        min="0"
                        value={typeForm[mealPlanFormKey[plan]]}
                        onChange={(e) => setTypeForm({ ...typeForm, [mealPlanFormKey[plan]]: e.target.value })}
                        placeholder={mealPlanLabels[plan]}
                        className="input"
                      />
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={typeForm.isActive} onChange={(e) => setTypeForm({ ...typeForm, isActive: e.target.checked })} /> Active for new rooms
                </label>
              </div>
              {editingType && (editingType.createdByEmployee || editingType.updatedByEmployee) && (
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  {editingType.createdByEmployee && <>Created by {editingType.createdByEmployee.firstName} {editingType.createdByEmployee.lastName} on {new Date(editingType.createdAt).toLocaleDateString()}</>}
                  {editingType.createdByEmployee && editingType.updatedByEmployee && " · "}
                  {editingType.updatedByEmployee && <>Last updated by {editingType.updatedByEmployee.firstName} {editingType.updatedByEmployee.lastName} on {new Date(editingType.updatedAt).toLocaleDateString()}</>}
                </p>
              )}
              <div className="mt-5 flex gap-2">
                <button disabled={saving} className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                  {saving && <LuLoaderCircle className="animate-spin" />}
                  {editingType ? "Save type" : "Create type"}
                </button>
                {editingType && (
                  <button type="button" onClick={resetTypeForm} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel edit</button>
                )}
              </div>
            </form>
            <section className="p-5">
              <p className="mb-3 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Property room types</p>
              <div className="space-y-3">
                {roomTypes.map((type) => (
                  <article key={type.id} className="border border-l-4 border-l-secondary bg-card p-4">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{type.name}</h4>
                          {!type.isActive && <StatusPill tone="muted">Inactive</StatusPill>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {type.description || "No description"} · {type.capacity} guests · {formatKes(Number(type.baseRate))}
                        </p>
                        {type.amenities.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {type.amenities.map((amenity) => (
                              <span key={amenity} className="bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{amenity}</span>
                            ))}
                          </div>
                        )}
                        {type.rates.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {type.rates.map((rate) => (
                              <StatusPill key={rate.mealPlan} tone="secondary">{mealPlanLabels[rate.mealPlan]}: {formatKes(Number(rate.price))}</StatusPill>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit type" onClick={() => editRoomType(type)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete type" onClick={() => void removeRoomType(type)} />
                      </div>
                    </div>
                  </article>
                ))}
                {roomTypes.length === 0 && <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">No room types yet.</p>}
              </div>
            </section>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function RoomCard({
  room,
  onEdit,
  onDelete,
  onStatus,
  onCleanliness,
}: {
  room: Room;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: RoomStatus) => void;
  onCleanliness: (cleanliness: Cleanliness) => void;
}) {
  const stay = room.reservations[0];
  const charge = folioTotal(stay);
  // Occupied or dirty means the room can't be sold right now — make that
  // conspicuous instead of blending in with the other status colors.
  const unavailable = room.status === "OCCUPIED" || room.cleanliness === "DIRTY";
  const statusTone =
    room.status === "OUT_OF_SERVICE"
      ? "bg-warning"
      : unavailable
        ? "bg-destructive"
        : "bg-success";
  return (
    <article className="flex flex-col overflow-hidden border bg-card shadow-sm transition hover:shadow-md">
      <div className={`h-1.5 ${statusTone}`} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{room.roomType.name}</p>
            <h2 className="mt-0.5 font-display text-3xl font-bold leading-none">{room.number}</h2>
            {room.name && <p className="mt-1 truncate text-sm text-muted-foreground">{room.name}</p>}
            {(room.floor || room.wing) && (
              <p className="text-xs text-muted-foreground">{[room.floor && `Floor ${room.floor}`, room.wing].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <ActionButton tone="neutral" icon={<LuPencil />} title="Edit room" onClick={onEdit} />
            <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete room" onClick={onDelete} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="flex border bg-background">
            <span className="w-1.5 shrink-0 bg-secondary" />
            <div className="p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Nightly rate</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">{formatKes(Number(room.nightlyRate))}</p>
            </div>
          </div>
          <div className="flex border bg-background">
            <span className="w-1.5 shrink-0 bg-muted-foreground" />
            <div className="p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Capacity</p>
              <p className="mt-0.5 text-sm font-bold">{room.capacity} guests</p>
            </div>
          </div>
        </div>
        {stay ? (
          <div className="mt-3 border border-l-4 border-l-secondary bg-secondary/5 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Checked-in guest</p>
                <p className="text-sm font-semibold">{stay.customer.firstName} {stay.customer.lastName ?? ""}</p>
              </div>
              <LuUsers className="text-secondary" />
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t pt-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LuReceiptText /> Folio balance</span>
              <strong className="text-sm tabular-nums text-secondary">{formatKes(charge)}</strong>
            </div>
          </div>
        ) : (
          <div className="mt-3 border border-dashed p-3 text-center text-xs text-muted-foreground">No checked-in guest</div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
          <select
            value={room.status}
            onChange={(e) => onStatus(e.target.value as RoomStatus)}
            className={cn("border-2 px-2 py-2 text-xs font-bold uppercase tracking-wide", room.status === "OCCUPIED" ? "border-destructive/50 bg-destructive/10 text-destructive" : room.status === "OUT_OF_SERVICE" ? "border-warning/50 bg-warning/15 text-warning" : "border-success/50 bg-success/10 text-success")}
          >
            <option value="VACANT">Vacant</option>
            <option value="OCCUPIED">Occupied</option>
            <option value="OUT_OF_SERVICE">Out of service</option>
          </select>
          <select
            value={room.cleanliness}
            onChange={(e) => onCleanliness(e.target.value as Cleanliness)}
            className={cn("border-2 px-2 py-2 text-xs font-bold uppercase tracking-wide", room.cleanliness === "CLEAN" ? "border-success/50 bg-success/10 text-success" : room.cleanliness === "DIRTY" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-secondary/50 bg-secondary/10 text-secondary")}
          >
            <option value="CLEAN">Clean</option>
            <option value="DIRTY">Dirty</option>
            <option value="INSPECTING">Inspecting</option>
          </select>
        </div>
      </div>
    </article>
  );
}

const ROOM_TONE_INDEX: Record<"success" | "secondary" | "warning", number> = { success: 1, secondary: 4, warning: 0 };

function SummaryCard({
  icon,
  label,
  value,
  tone,
  index,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "success" | "secondary" | "warning";
  index?: number;
}) {
  return <SharedStatCard index={index ?? ROOM_TONE_INDEX[tone]} icon={icon} label={label} value={value} />;
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
