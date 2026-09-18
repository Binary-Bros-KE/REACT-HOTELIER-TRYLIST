import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LuPrinter } from 'react-icons/lu'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  getThermalSettings, saveThermalSettings, pairUsbPrinter, pairBluetoothPrinter,
  webUsbAvailable, webBluetoothAvailable, PRINTER_MODELS,
  pingBridge, listBridgePrinters,
  type ThermalSettings, type ThermalConnection, type BridgePrinter,
} from '@/lib/thermalPrinter'

// Split out of System Settings (Team ▸ ... ▸ Settings) deliberately: that
// page also shows the license key, so it's admin-only. This one isn't —
// anyone running the POS needs to be able to switch their own device to
// "send to another device" if a printer setting ever reverts (e.g. after
// an update), without having to reach whoever normally handles Settings.

const CONNECTIONS: { value: ThermalConnection; label: string }[] = [
  { value: 'bridge', label: 'Local print bridge (any OS printer)' },
  { value: 'usb', label: 'USB (WebUSB, direct)' },
  { value: 'bluetooth', label: 'Bluetooth (direct)' },
  { value: 'relay', label: 'No printer here — send to another device' },
  { value: 'dialog', label: 'Browser print dialog' },
]

function Label({ children }: { children: ReactNode }) {
  return <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
}

export default function PrinterSettings() {
  const toast = useToast()
  const [s, setS] = useState<ThermalSettings>(getThermalSettings)
  const [pairing, setPairing] = useState(false)
  const [bridge, setBridge] = useState<{ checking: boolean; up: null | { version: string; host: string }; printers: BridgePrinter[]; error: string }>(
    { checking: false, up: null, printers: [], error: '' },
  )

  function patch(next: Partial<ThermalSettings>) {
    setS(saveThermalSettings(next))
  }

  const checkBridge = useCallback(async (url?: string) => {
    setBridge((b) => ({ ...b, checking: true, error: '' }))
    const up = await pingBridge(url)
    if (!up) {
      setBridge({ checking: false, up: null, printers: [], error: '' })
      return
    }
    try {
      const list = await listBridgePrinters(url)
      setBridge({ checking: false, up, printers: list.printers, error: '' })
      setS((cur) => (cur.address ? cur : saveThermalSettings({ address: list.default ?? cur.address })))
    } catch (cause) {
      setBridge({ checking: false, up, printers: [], error: cause instanceof Error ? cause.message : 'Could not list printers' })
    }
  }, [])

  useEffect(() => {
    if (s.enabled && s.connection === 'bridge') void checkBridge(s.bridgeUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.enabled, s.connection, s.bridgeUrl])

  async function connect() {
    setPairing(true)
    try {
      const name = s.connection === 'bluetooth' ? await pairBluetoothPrinter() : await pairUsbPrinter()
      patch({ address: name })
      toast.success(`Connected to ${name}`)
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'NotFoundError')) {
        toast.error(cause instanceof Error ? cause.message : 'Could not connect to a printer')
      }
    } finally {
      setPairing(false)
    }
  }

  const direct = s.connection === 'usb' || s.connection === 'bluetooth'
  const transportMissing =
    (s.connection === 'usb' && !webUsbAvailable()) ||
    (s.connection === 'bluetooth' && !webBluetoothAvailable())

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-secondary">Sales</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-foreground">Printer Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">How receipts print from this device. Every device sets its own — if a printer stops working here, this is always the place to check, whoever's on shift.</p>
      </header>

      <section className="rounded-sm border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-sm bg-secondary/10 text-secondary"><LuPrinter className="size-4" /></span>
          <div>
            <h2 className="font-semibold text-foreground">Receipt Printer</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Configure the ESC/POS thermal printer used to print receipts at checkout.</p>
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-sm border bg-muted/40 p-3">
          <input type="checkbox" checked={s.enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="mt-0.5 size-4 accent-secondary" />
          <span>
            <span className="block text-sm font-semibold">Enable receipt printing</span>
            <span className="block text-xs text-muted-foreground">Turn this off if you don’t have a thermal printer set up yet</span>
          </span>
        </label>

        {s.enabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Connection type</Label>
                <select value={s.connection} onChange={(e) => patch({ connection: e.target.value as ThermalConnection })} className="input mt-2">
                  {CONNECTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Printer type</Label>
                <select value={s.model} onChange={(e) => patch({ model: e.target.value })} className="input mt-2">
                  {PRINTER_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            {s.connection === 'relay' && (
              <p className="mt-5 max-w-xl rounded-sm border border-secondary/30 bg-secondary/5 p-3 text-xs text-muted-foreground">
                This device has no printer of its own. Clicking Print here just queues the receipt — any other device at the same location that <span className="font-semibold text-foreground">does</span> have a printer connected (bridge, USB, or Bluetooth) picks it up in the background and prints it automatically, as long as that device's tab is open. Nothing else to set up on that end.
              </p>
            )}

            {s.connection === 'bridge' && (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                    bridge.up ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                  )}>
                    <span className={cn('size-1.5 rounded-full', bridge.up ? 'bg-success' : 'bg-destructive')} />
                    {bridge.checking ? 'Checking…' : bridge.up ? `Bridge running · v${bridge.up.version} · ${bridge.up.host}` : 'Bridge not detected'}
                  </span>
                  <button type="button" onClick={() => void checkBridge(s.bridgeUrl)} className="rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Recheck</button>
                </div>

                {bridge.up ? (
                  <>
                    <Label>Printer</Label>
                    <select value={s.address} onChange={(e) => patch({ address: e.target.value })} className="input mt-2">
                      {bridge.printers.length === 0 && <option value="">No printers found</option>}
                      {bridge.printers.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}{p.default ? ' (default)' : ''}</option>
                      ))}
                    </select>
                    {bridge.error && <p className="mt-2 text-xs font-medium text-warning">{bridge.error}</p>}
                  </>
                ) : (
                  <p className="mt-2 max-w-xl text-xs text-muted-foreground">
                    Install the <span className="font-semibold text-foreground">HOTELIER print bridge</span> on this machine once, then click Recheck. It’s a tiny background app that lets the browser print to any printer Windows knows — including an old USB thermal printer behind its own driver.
                  </p>
                )}

                <Label>Bridge address</Label>
                <input
                  value={s.bridgeUrl}
                  onChange={(e) => patch({ bridgeUrl: e.target.value })}
                  placeholder="http://127.0.0.1:47011"
                  className="input mt-2 max-w-xs"
                />
              </>
            )}

            {direct && (
              <>
                <Label>Connected printer</Label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{s.address || 'None — connect one'}</span>
                  <button
                    type="button"
                    onClick={() => void connect()}
                    disabled={pairing || transportMissing}
                    className="rounded-sm bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {pairing ? 'Connecting…' : s.address ? 'Reconnect' : `Connect ${s.connection === 'bluetooth' ? 'Bluetooth' : 'USB'} printer`}
                  </button>
                </div>
                {transportMissing && (
                  <p className="mt-2 text-xs font-medium text-warning">
                    This browser can’t use {s.connection === 'bluetooth' ? 'Web Bluetooth' : 'WebUSB'}. Use Chrome or Edge, or switch Connection type to “Browser print dialog”.
                  </p>
                )}
              </>
            )}

            <Label>Paper width (characters per line)</Label>
            <input
              type="number" min={24} max={64}
              value={s.columns}
              onChange={(e) => patch({ columns: Number(e.target.value) || 48 })}
              className="input mt-2 max-w-40"
            />
            <p className="mt-2 max-w-xl text-xs text-muted-foreground">
              Content prints at its true size (not shrunk to fit), so setting this too high cuts off the right edge. 32 suits 58&nbsp;mm paper, 48 suits 80&nbsp;mm. The moment a column or a total gets clipped, drop back to the last value that printed cleanly.
            </p>

            <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-sm border bg-muted/40 p-3">
              <input type="checkbox" checked={s.autoPrint} onChange={(e) => patch({ autoPrint: e.target.checked })} className="mt-0.5 size-4 accent-secondary" />
              <span>
                <span className="block text-sm font-semibold">Print automatically after each sale</span>
                <span className="block text-xs text-muted-foreground">If off, use the Print button on the receipt instead</span>
              </span>
            </label>

            <p className="mt-4 max-w-xl text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Local print bridge</span> is the reliable choice for old USB thermal printers behind a Windows driver. <span className="font-semibold text-foreground">USB / Bluetooth</span> talk to the printer directly (no helper) but need a driverless / WinUSB or a BLE printer. <span className="font-semibold text-foreground">Browser print dialog</span> works with anything but shows a dialog.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
