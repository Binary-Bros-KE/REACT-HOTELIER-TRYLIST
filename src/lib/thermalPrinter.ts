import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import type { ReceiptOrder, ReceiptProfile } from '@/components/pos/OrderReceipt'
import { receiptFooterText, receiptHeaderText, receiptItemName, receiptVariantSuffix, receiptPhone, servedByName, showsTaxAsAddedOn } from '@/lib/receiptFields'
import { createPrintJob } from '@/lib/printRelay'

/**
 * Direct ESC/POS thermal printing from the browser. Five transports:
 *
 *  - 'usb'       WebUSB, direct to a driverless / WinUSB printer (no dialog)
 *  - 'bluetooth' Web Bluetooth, direct to a BLE printer (no dialog)
 *  - 'bridge'    the local HOTELIER print bridge on 127.0.0.1 — spools RAW to
 *                any OS-installed printer BY NAME, incl. old USB thermals
 *                behind a vendor driver (the case WebUSB can't reach)
 *  - 'relay'     no printer on this device at all — queues the job for
 *                whichever OTHER device at this location has one connected
 *                (see src/lib/printRelay.ts and src/lib/printRelayHost.ts)
 *  - 'dialog'    the browser print sheet, 80mm page — works with anything
 */

const KEY = 'hotelier.thermal'
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:47011'

export type ThermalConnection = 'usb' | 'bluetooth' | 'bridge' | 'relay' | 'dialog'

export type ThermalSettings = {
  enabled: boolean
  connection: ThermalConnection
  /** encoder printerModel preset, or 'generic' */
  model: string
  /** the paired USB/BT device label, or — for 'bridge' — the OS printer name */
  address: string
  /** where the local print bridge listens */
  bridgeUrl: string
  /** characters per line */
  columns: number
  autoPrint: boolean
}

export const PRINTER_MODELS: { value: string; label: string }[] = [
  { value: 'generic', label: 'Custom / Generic ESC-POS' },
  { value: 'epson-tm-t88iv', label: 'Epson TM-T88 series' },
  { value: 'epson-tm-t20iii', label: 'Epson TM-T20 series' },
  { value: 'epson-tm-m30', label: 'Epson TM-m30' },
  { value: 'star-tsp650', label: 'Star TSP650' },
  { value: 'star-mc-print3', label: 'Star mC-Print3' },
  { value: 'bixolon-srp-350iii', label: 'Bixolon SRP-350' },
]

const DEFAULTS: ThermalSettings = {
  enabled: true,
  connection: 'bridge',
  model: 'generic',
  address: '',
  bridgeUrl: DEFAULT_BRIDGE_URL,
  columns: 48,
  autoPrint: true,
}

export function getThermalSettings(): ThermalSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ThermalSettings>) }
  } catch { /* private mode */ }
  return { ...DEFAULTS }
}

export function saveThermalSettings(patch: Partial<ThermalSettings>): ThermalSettings {
  const next = { ...getThermalSettings(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  return next
}

export const webUsbAvailable = () => typeof navigator !== 'undefined' && 'usb' in navigator
export const webBluetoothAvailable = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator

// ---------------------------------------------------------------- USB

export async function pairUsbPrinter(): Promise<string> {
  if (!webUsbAvailable()) throw new Error('This browser has no USB access — use Chrome or Edge.')
  const device = await navigator.usb.requestDevice({ filters: [{ classCode: 7 }, {}] })
  return device.productName || `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`
}

// The message for both failure points below: a printer that already has a
// working Windows/macOS driver — i.e. one that shows up in the OS print
// list and prints fine from other apps — has its USB interface held by that
// driver, and the OS will not also hand it to the browser. This is not a
// bug to work around; it's WebUSB's whole security model. The fix is either
// the Local print bridge (goes through the driver, not around it) or
// rebinding the device to WinUSB with Zadig (Windows-only, and it then
// stops appearing as a normal Windows printer).
const DRIVER_HELD_MESSAGE =
  'This printer already has a driver installed (it shows up in Windows’ own printer list), so the browser isn’t allowed to open it directly — that’s not fixable from here. Switch Connection type to “Local print bridge” in Settings → Receipt Printer, which prints through the driver instead of around it.'

async function openUsbEndpoint() {
  const device = (await navigator.usb.getDevices())[0]
  if (!device) throw new Error('No USB printer connected. Open Settings → Receipt printer to connect one.')
  try {
    await device.open()
  } catch {
    throw new Error(DRIVER_HELD_MESSAGE)
  }
  if (device.configuration === null) await device.selectConfiguration(1)
  for (const cfg of device.configurations) {
    for (const iface of cfg.interfaces) {
      for (const alt of iface.alternates) {
        const out = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
        if (!out) continue
        try {
          await device.claimInterface(iface.interfaceNumber)
        } catch {
          throw new Error(DRIVER_HELD_MESSAGE)
        }
        return { device, endpoint: out.endpointNumber, iface: iface.interfaceNumber }
      }
    }
  }
  throw new Error('That USB device has no printable interface.')
}

async function sendUsb(bytes: Uint8Array): Promise<void> {
  const { device, endpoint, iface } = await openUsbEndpoint()
  try {
    // some stacks choke on a single large transfer — chunk it
    for (let i = 0; i < bytes.length; i += 4096) {
      await device.transferOut(endpoint, bytes.slice(i, i + 4096))
    }
  } finally {
    try { await device.releaseInterface(iface) } catch { /* ignore */ }
    try { await device.close() } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------- Bluetooth

// The de-facto "serial over BLE" service cheap thermal printers expose.
const BT_SERVICE = 0x18f0
const BT_CHARACTERISTIC = 0x2af1
let btChar: BluetoothRemoteGATTCharacteristic | null = null

async function connectBluetoothDevice(device: BluetoothDevice): Promise<BluetoothRemoteGATTCharacteristic> {
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(BT_SERVICE)
  return service.getCharacteristic(BT_CHARACTERISTIC)
}

export async function pairBluetoothPrinter(): Promise<string> {
  if (!webBluetoothAvailable()) throw new Error('This browser has no Bluetooth access.')
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [BT_SERVICE] }],
    optionalServices: [BT_SERVICE],
  })
  btChar = await connectBluetoothDevice(device)
  return device.name || 'Bluetooth printer'
}

async function reconnectBluetoothPrinter(): Promise<void> {
  if (!webBluetoothAvailable()) throw new Error('This browser has no Bluetooth access.')
  const bluetooth = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> }
  const devices = await bluetooth.getDevices?.()
  const preferred = devices?.find((device) => device.name === getThermalSettings().address) ?? devices?.[0]
  if (preferred) {
    btChar = await connectBluetoothDevice(preferred)
    return
  }
  await pairBluetoothPrinter()
}

async function sendBluetooth(bytes: Uint8Array): Promise<void> {
  if (!btChar || !btChar.service.device.gatt?.connected) await reconnectBluetoothPrinter()
  if (!btChar) throw new Error('No Bluetooth printer connected.')
  const writeChunks = async (char: BluetoothRemoteGATTCharacteristic) => {
    for (let i = 0; i < bytes.length; i += 180) {
      await char.writeValueWithoutResponse(bytes.slice(i, i + 180) as unknown as BufferSource)
      await new Promise((r) => setTimeout(r, 20))
    }
  }
  try {
    await writeChunks(btChar)
  } catch (error) {
    btChar = null
    await reconnectBluetoothPrinter()
    if (!btChar) throw error
    await writeChunks(btChar)
  }
}

// ---------------------------------------------------------------- local bridge

export type BridgePrinter = { name: string; default: boolean; status?: string }

function bridgeBase(url?: string): string {
  return (url || getThermalSettings().bridgeUrl || DEFAULT_BRIDGE_URL).replace(/\/$/, '')
}

/** Is the local print bridge reachable? Returns its version/host, or null. */
export async function pingBridge(url?: string): Promise<{ version: string; host: string } | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 2500)
    const r = await fetch(`${bridgeBase(url)}/status`, { signal: controller.signal })
    clearTimeout(t)
    if (!r.ok) return null
    const body = (await r.json()) as { app?: string; version?: string; host?: string }
    if (body.app !== 'hotelier-print-bridge') return null
    return { version: body.version ?? '?', host: body.host ?? '?' }
  } catch {
    return null
  }
}

export async function listBridgePrinters(url?: string): Promise<{ default: string | null; printers: BridgePrinter[] }> {
  const r = await fetch(`${bridgeBase(url)}/printers`)
  const body = (await r.json()) as { ok?: boolean; error?: string; default?: string | null; printers?: BridgePrinter[] }
  if (!r.ok || !body.ok) throw new Error(body.error ?? 'The print bridge could not list printers.')
  return { default: body.default ?? null, printers: body.printers ?? [] }
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function sendBridge(bytes: Uint8Array, s: ThermalSettings): Promise<void> {
  let r: Response
  try {
    r = await fetch(`${bridgeBase(s.bridgeUrl)}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer: s.address || undefined, data: toBase64(bytes) }),
    })
  } catch {
    throw new Error('The local print bridge isn’t running. Start it, or switch Connection type in Settings.')
  }
  const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!r.ok || !body.ok) throw new Error(body.error ?? 'The print bridge could not print.')
}

// ---------------------------------------------------------------- receipt bytes

const money = (v: number | string) => `KSh ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Centers by literal space-padding instead of the encoder's own
 * `align('center')` — that call has an ordering bug in
 * @point-of-sale/receipt-printer-encoder@3: the moment it's used, the
 * padding it computes gets hoisted to byte 0 of the WHOLE buffer, ahead of
 * the ESC @ initialize command, so the printer receives raw spaces before
 * it's even reset and the rest renders as nothing. Reproduced and confirmed
 * with a hex dump — `align('left')` (the default) and `.table()`'s
 * column-level `align: 'right'` are unaffected, so those stay as they are.
 */
function center(text: string, width: number): string {
  const t = text.slice(0, width)
  return ' '.repeat(Math.max(0, Math.floor((width - t.length) / 2))) + t
}

/** Word-wraps text to `width`, breaking mid-word only if a single word is
 * itself longer than `width`. Used for the scaled-up business name so long
 * names wrap to a second centered line instead of getting sliced off. */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = cur ? `${cur} ${word}` : word
    if (candidate.length <= width) {
      cur = candidate
      continue
    }
    if (cur) lines.push(cur)
    if (word.length > width) {
      let rest = word
      while (rest.length > width) {
        lines.push(rest.slice(0, width))
        rest = rest.slice(width)
      }
      cur = rest
    } else {
      cur = word
    }
  }
  if (cur) lines.push(cur)
  return lines
}

export function buildReceiptBytes(order: ReceiptOrder, profile: ReceiptProfile, s: ThermalSettings): Uint8Array {
  const cols = Math.max(24, Math.min(64, Math.round(s.columns) || 48))
  const compact = cols <= 35
  const isComplementary = order.saleType === 'COMPLIMENTARY'
  const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const owed = Math.max(0, order.financials.total - paid)
  const creditOverdue = !isComplementary && owed > 0.01 && order.creditExpectedAt ? new Date(order.creditExpectedAt).getTime() < Date.now() : false
  const statusText = isComplementary ? 'Complementary' : creditOverdue ? 'Overdue credit' : owed > 0.01 ? 'On credit' : order.status
  const e = new ReceiptPrinterEncoder({
    language: 'esc-pos',
    columns: cols,
    feedBeforeCut: compact ? 2 : 4,
    ...(s.model && s.model !== 'generic' ? { printerModel: s.model } : {}),
  })
  e.initialize().codepage('cp437')

  const priceW = compact ? 10 : 12
  const nameW = cols - priceW - 1
  const row = (l: string, r: string) => e.table([{ width: nameW, align: 'left' }, { width: priceW, align: 'right' }], [[l, r]])

  // -------- header: business name (large, caps, centered) down through the
  // location's own receipt header text --------
  if (profile?.businessName) {
    // Symmetric double width+height — the height-only mode used before this
    // (size(1,2)) rendered as ugly, narrow, widely-spaced glyphs on several
    // ESC/POS clones (Aclas included); scaling both axes together keeps the
    // font's proportions intact and prints correctly everywhere. Wrapping
    // (rather than the old slice-to-width) means a long name gets a second
    // centered line instead of getting cut off.
    if (compact) {
      e.bold(true)
      for (const line of wrapWords(profile.businessName.toUpperCase(), cols)) e.line(center(line, cols))
      e.bold(false)
    } else {
      const nameWidth = Math.max(8, Math.floor(cols / 2))
      e.size(2, 2).bold(true)
      for (const line of wrapWords(profile.businessName.toUpperCase(), nameWidth)) e.line(center(line, nameWidth))
      e.bold(false).size(1, 1)
    }
  }
  const place = [profile?.address, profile?.city].filter(Boolean).join(', ')
  if (place && !compact) e.line(center(place, cols))
  if (order.location?.name) e.line(center(order.location.name, cols))
  const phone = receiptPhone(order, profile)
  if (phone) e.line(center(phone, cols))
  const header = receiptHeaderText(order)
  if (header) for (const l of header.split('\n')) e.line(center(l, cols))
  e.rule()

  // -------- receipt / date / served by (left-aligned) --------
  e.line(`Receipt: ${order.orderNumber}`)
  e.line(`Date: ${new Date(order.updatedAt).toLocaleString('en-KE', compact ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' } : undefined)}`)
  const served = servedByName(order)
  if (served) e.line(`Served by: ${served}`)
  e.line(`Status: ${statusText}`)
  e.line(order.table ? `Table: ${order.table.label}` : 'Takeaway')
  if (isComplementary) e.line(`Recipient: ${order.complimentaryRecipientName || (order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}`.trim() : 'Walk-in')}`)
  if (order.complimentarySession) e.line(`Host/Event: ${order.complimentarySession.title}`)
  if (order.creditReason) e.line(`Credit reason: ${order.creditReason}`)
  if (order.creditExpectedAt) e.line(`Expected pay date: ${new Date(order.creditExpectedAt).toLocaleDateString()}`)
  e.rule()

  // -------- items --------
  for (const item of order.items) {
    const label = `${item.quantity} x ${receiptItemName(item)}${receiptVariantSuffix(item)}`
    if (compact && label.length > nameW) {
      const price = money(Number(item.unitPrice) * item.quantity)
      e.line(label)
      e.line(`${' '.repeat(Math.max(0, cols - price.length))}${price}`)
    } else {
      row(label, money(Number(item.unitPrice) * item.quantity))
    }
    for (const a of item.addons) row(`  + ${a.addon.name}`, money(Number(a.unitPrice) * a.quantity))
  }
  e.rule()

  // -------- totals: exclusive tax shown as an explicit addition; inclusive
  // (already baked into the subtotal) isn't, to avoid reading as double
  // charging — it's still fully disclosed in the tax breakdown below --------
  const f = order.financials
  row('Subtotal', money(f.subtotal))
  if (f.discount > 0) row('Discount', `-${money(f.discount)}`)
  if (showsTaxAsAddedOn(order)) row(`Tax (${f.taxRate}%)`, `+${money(f.taxAmount)}`)
  e.bold(true)
  row('TOTAL', money(f.total))
  e.bold(false)
  e.rule()

  // -------- payments --------
  e.line('Payments')
  if (isComplementary) e.line('Complementary order, no payment collected.')
  else if (order.payments.length === 0) e.line('No payment recorded yet.')
  else for (const p of order.payments) row(p.paymentMethod.name, money(p.amount))
  e.rule()

  e.line('Tax breakdown')
  if (compact) {
    for (const t of f.taxLines ?? []) {
      e.line(t.label)
      row('  Net', money(t.net))
      row('  Tax', money(t.tax))
      row('  Gross', money(t.gross))
    }
    e.bold(true)
    row('Tax total', money(f.taxAmount))
    row('Gross total', money(f.total))
    e.bold(false)
  } else {
    const netW = Math.max(8, Math.floor(cols * 0.2))
    const taxW = Math.max(7, Math.floor(cols * 0.16))
    const grossW = Math.max(8, Math.floor(cols * 0.2))
    const labelW = cols - netW - taxW - grossW
    const taxRow = (label: string, net: string, tax: string, gross: string) =>
      e.table(
        [{ width: labelW, align: 'left' }, { width: netW, align: 'right' }, { width: taxW, align: 'right' }, { width: grossW, align: 'right' }],
        [[label, net, tax, gross]],
      )
    taxRow('Rate', 'Net', 'Tax', 'Gross')
    for (const t of f.taxLines ?? []) taxRow(t.label, money(t.net), money(t.tax), money(t.gross))
    e.bold(true)
    taxRow('Total', money(f.net), money(f.taxAmount), money(f.total))
    e.bold(false)
  }
  if ((f.zeroRatedAmount ?? 0) > 0) e.line(`Includes zero-rated: ${money(f.zeroRatedAmount!)}`)
  if ((f.exemptAmount ?? 0) > 0) e.line(`Includes exempt: ${money(f.exemptAmount!)}`)
  e.rule()

  // -------- footer (location's own, else a default) --------
  for (const l of receiptFooterText(order).split('\n')) e.line(center(l, cols))
  e.newline(4).cut()
  return e.encode()
}

// ---------------------------------------------------------------- store dispatch slip

/** What the store needs in hand to pick and hand over a kitchen's ingredients. */
export type DispatchSlip = {
  requestNo: string
  orderNumber: number
  table: string | null
  from: string
  to: string
  requestedByName: string | null
  requestedAt: string
  note: string | null
  items: { name: string; quantity: number; unit: string }[]
}

const qtyText = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 })

export function buildDispatchSlipBytes(slip: DispatchSlip, profile: ReceiptProfile | null, s: ThermalSettings): Uint8Array {
  const cols = Math.max(24, Math.min(64, Math.round(s.columns) || 48))
  const compact = cols <= 35
  const e = new ReceiptPrinterEncoder({
    language: 'esc-pos',
    columns: cols,
    feedBeforeCut: compact ? 2 : 4,
    ...(s.model && s.model !== 'generic' ? { printerModel: s.model } : {}),
  })
  e.initialize().codepage('cp437')
  const rule = '-'.repeat(cols)
  if (profile?.businessName) { e.bold(true); e.line(center(profile.businessName.toUpperCase(), cols)); e.bold(false) }
  e.bold(true)
  e.line(center('STORE DISPATCH REQUEST', cols))
  e.bold(false)
  e.line(rule)
  e.line(`Request:  ${slip.requestNo}`)
  e.line(`Order:    #${slip.orderNumber}${slip.table ? ` (${slip.table})` : ''}`)
  e.line(`For:      ${slip.to}`)
  e.line(`From:     ${slip.from}`)
  if (slip.requestedByName) e.line(`By:       ${slip.requestedByName}`)
  e.line(`Time:     ${new Date(slip.requestedAt).toLocaleString()}`)
  e.line(rule)
  const qtyW = compact ? 12 : 16
  const nameW = cols - qtyW - 1
  e.bold(true)
  e.table([{ width: nameW, align: 'left' }, { width: qtyW, align: 'right' }], [['ITEM', 'QTY']])
  e.bold(false)
  for (const item of slip.items) {
    e.table([{ width: nameW, align: 'left' }, { width: qtyW, align: 'right' }], [[item.name, `${qtyText(item.quantity)} ${item.unit}`]])
  }
  e.line(rule)
  if (slip.note) for (const l of wrapWords(slip.note, cols)) e.line(l)
  e.newline(1)
  e.line('Dispatched by: ______________')
  e.newline(1)
  e.line('Received by:   ______________')
  e.newline(4).cut()
  return e.encode()
}

/** Browser print sheet with the slip, for a store computer without a thermal printer. */
function printSlipViaWindow(slip: DispatchSlip): void {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  const rows = slip.items.map((i) => `<tr><td>${esc(i.name)}</td><td style="text-align:right;white-space:nowrap">${qtyText(i.quantity)} ${esc(i.unit)}</td></tr>`).join('')
  const win = window.open('', '_blank', 'width=420,height=640')
  if (!win) throw new Error('Allow pop-ups to print the slip')
  win.document.write(`<!doctype html><title>${esc(slip.requestNo)}</title><style>@page{size:80mm auto;margin:4mm}body{font:13px/1.4 monospace;margin:0}h1{font-size:15px;text-align:center;margin:0 0 6px}table{width:100%;border-collapse:collapse}td{padding:2px 0;border-bottom:1px dotted #999}hr{border:0;border-top:1px dashed #000}</style>
<h1>STORE DISPATCH REQUEST</h1><hr>
<div>Request: ${esc(slip.requestNo)}</div><div>Order: #${slip.orderNumber}${slip.table ? ' (' + esc(slip.table) + ')' : ''}</div>
<div>For: ${esc(slip.to)}</div><div>From: ${esc(slip.from)}</div>${slip.requestedByName ? '<div>By: ' + esc(slip.requestedByName) + '</div>' : ''}
<div>Time: ${esc(new Date(slip.requestedAt).toLocaleString())}</div><hr>
<table>${rows}</table><hr>${slip.note ? '<div>' + esc(slip.note) + '</div><hr>' : ''}
<p>Dispatched by: ____________</p><p>Received by: ____________</p>`)
  win.document.close()
  win.focus()
  win.print()
}

/**
 * Manual print of a dispatch slip from the store screen: straight to this
 * device's thermal printer when one is connected, else the browser print sheet.
 */
export async function printDispatchSlip(slip: DispatchSlip, profile: ReceiptProfile | null): Promise<'thermal' | 'dialog'> {
  const s = getThermalSettings()
  if (s.enabled && (s.connection === 'usb' || s.connection === 'bluetooth' || s.connection === 'bridge')) {
    await sendLocal(buildDispatchSlipBytes(slip, profile, s), s)
    return 'thermal'
  }
  printSlipViaWindow(slip)
  return 'dialog'
}

// ---------------------------------------------------------------- dialog fallback

export function printViaDialog(): void {
  const width = getThermalSettings().columns <= 35 ? '58mm' : '80mm'
  const style = document.createElement('style')
  style.textContent = `@media print{@page{size:${width} auto;margin:3mm}}`
  document.head.appendChild(style)
  const cleanup = () => { style.remove(); window.removeEventListener('afterprint', cleanup) }
  window.addEventListener('afterprint', cleanup)
  window.setTimeout(cleanup, 2000)
  window.print()
}

// ---------------------------------------------------------------- orchestrator

/** Dispatches already-built ESC/POS bytes to whichever *local* hardware
 * connection is configured — the piece shared between printing straight
 * from this device and the relay host printing someone else's queued job
 * over this same connection. Never call with connection 'relay' or
 * 'dialog', neither of which sends bytes anywhere from here. */
export async function sendLocal(bytes: Uint8Array, s: ThermalSettings): Promise<void> {
  if (s.connection === 'bridge') await sendBridge(bytes, s)
  else if (s.connection === 'bluetooth') await sendBluetooth(bytes)
  else await sendUsb(bytes)
}

export type PrintResult = { method: 'thermal' | 'dialog' | 'relay'; jobId?: string }

/**
 * Print a receipt. With a thermal printer configured on THIS device, sends
 * ESC/POS straight to it and resolves `{ method: 'thermal' }` (no dialog).
 * With connection 'relay' (no printer here), queues the job for whichever
 * other device at this order's location has one and resolves
 * `{ method: 'relay', jobId }` — see src/lib/printRelay.ts. Otherwise opens
 * the browser print sheet. A thermal-send failure rejects so the caller can
 * show it rather than silently falling back.
 *
 * `order` may be omitted (e.g. the existing DOM-only Print buttons): then it
 * always uses the dialog, which prints whatever `.receipt-print-area` holds.
 */
export async function printReceipt(order?: ReceiptOrder | null, profile?: ReceiptProfile): Promise<PrintResult> {
  const s = getThermalSettings()

  if (!s.enabled || s.connection === 'dialog' || !order) {
    printViaDialog()
    return { method: 'dialog' }
  }

  if (s.connection === 'relay') {
    const job = await createPrintJob(order.id)
    return { method: 'relay', jobId: job.id }
  }

  const bytes = buildReceiptBytes(order, profile ?? null, s)
  await sendLocal(bytes, s)
  return { method: 'thermal' }
}
