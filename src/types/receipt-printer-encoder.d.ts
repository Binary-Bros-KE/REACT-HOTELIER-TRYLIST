declare module '@point-of-sale/receipt-printer-encoder' {
  interface EncoderOptions {
    language?: 'esc-pos' | 'star-prnt' | 'star-line'
    columns?: number
    feedBeforeCut?: number
    printerModel?: string
    imageMode?: 'column' | 'raster'
    newline?: string
  }
  type Align = 'left' | 'center' | 'right'
  interface Column { width: number; align?: Align; marginLeft?: number; marginRight?: number; verticalAlign?: string }

  export default class ReceiptPrinterEncoder {
    constructor(options?: EncoderOptions)
    initialize(): this
    codepage(name: string): this
    text(value: string): this
    line(value: string): this
    newline(count?: number): this
    align(value: Align): this
    bold(value?: boolean): this
    underline(value?: boolean): this
    invert(value?: boolean): this
    width(value: number): this
    height(value: number): this
    size(width: number, height?: number): this
    rule(options?: { style?: 'single' | 'double'; width?: number }): this
    table(columns: Column[], rows: (string | ((enc: ReceiptPrinterEncoder) => void))[][]): this
    box(options: Record<string, unknown>, contents: string): this
    barcode(value: string, symbology: string, options?: Record<string, unknown>): this
    qrcode(value: string, options?: Record<string, unknown>): this
    image(element: unknown, width: number, height: number, algorithm?: string, threshold?: number): this
    cut(value?: 'full' | 'partial'): this
    raw(data: number[] | Uint8Array): this
    encode(): Uint8Array
  }
}
