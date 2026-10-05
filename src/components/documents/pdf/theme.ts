import { StyleSheet } from '@react-pdf/renderer'

// A shared visual language for every printable document — bordered tables,
// a letterhead, a totals box and a signature block — so a Requisition and a
// Purchase Order (and whatever comes next) read as one family. Uses only the
// built-in Helvetica family so nothing has to be fetched at render time.

export const palette = {
  ink: '#1f2937',
  navy: '#0b1e3d',
  muted: '#6b7280',
  faint: '#9ca3af',
  line: '#8b93a1',
  hairline: '#c3c9d3',
  shade: '#f3f4f6',
  white: '#ffffff',
  danger: '#b91c1c',
  success: '#15803d',
  amber: '#b45309',
}

export const statusColor: Record<string, string> = {
  DRAFT: palette.muted,
  SUBMITTED: palette.amber,
  APPROVED: palette.navy,
  COMPLETE: palette.success,
  VOIDED: palette.danger,
  REJECTED: palette.danger,
  CONVERTED: palette.success,
  CANCELLED: palette.muted,
  ORDERED: palette.navy,
  RECEIVED: palette.success,
}

export const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 64,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: palette.ink,
    lineHeight: 1.4,
  },
  // Letterhead
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headLeft: { width: '56%' },
  headRight: { width: '42%' },
  bizName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: palette.navy, letterSpacing: 0.5, marginBottom: 4 },
  bizLine: { fontSize: 8, color: palette.muted, marginBottom: 1 },
  docType: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: palette.ink, letterSpacing: 0.8, textAlign: 'right' },
  docNo: { fontSize: 8.5, color: palette.muted, textAlign: 'right', marginTop: 3 },
  statusTag: {
    marginTop: 6,
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderRadius: 2,
    paddingVertical: 3,
    paddingHorizontal: 7,
    fontSize: 7.5,
    lineHeight: 1,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    textAlign: 'center',
  },
  rule: { borderBottomWidth: 1.4, borderBottomColor: palette.navy, marginTop: 12, marginBottom: 14 },

  sectionLabel: { fontSize: 7.5, color: palette.faint, letterSpacing: 1.2, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  partyName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: palette.ink, marginBottom: 3 },

  // Meta grid (bordered cells in a row)
  metaGrid: { flexDirection: 'row', borderWidth: 1, borderColor: palette.line, marginTop: 14 },
  metaCell: { flex: 1, paddingVertical: 5, paddingHorizontal: 7, borderRightWidth: 1, borderRightColor: palette.line },
  metaCellLast: { flex: 1, paddingVertical: 5, paddingHorizontal: 7 },
  metaKey: { fontSize: 6.5, color: palette.faint, letterSpacing: 0.8, fontFamily: 'Helvetica-Bold' },
  metaVal: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: palette.navy, marginTop: 2 },

  note: { marginTop: 10, fontSize: 8.5, color: palette.muted, fontStyle: 'italic' },

  // Items table
  table: { marginTop: 16, borderWidth: 1, borderColor: palette.line },
  th: { flexDirection: 'row', backgroundColor: palette.shade, borderBottomWidth: 1, borderBottomColor: palette.line },
  thText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: palette.muted, letterSpacing: 0.6, paddingVertical: 5, paddingHorizontal: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: palette.hairline },
  td: { fontSize: 8.5, paddingVertical: 5, paddingHorizontal: 6 },
  tdSub: { fontSize: 6.5, color: palette.faint },
  divide: { borderRightWidth: 1, borderRightColor: palette.hairline },

  colIdx: { width: 24, textAlign: 'center' },
  colName: { flex: 1 },
  colNum: { width: 52, textAlign: 'right' },
  colMoney: { width: 82, textAlign: 'right' },

  // Totals
  totalsWrap: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalRule: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 3, paddingTop: 5 },
  totalKey: { fontSize: 9, color: palette.muted },
  totalVal: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  grandKey: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: palette.navy },
  grandVal: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: palette.navy },

  // Breakdown table (smaller)
  breakLabel: { fontSize: 7, color: palette.faint, letterSpacing: 1, fontFamily: 'Helvetica-Bold', marginTop: 22, marginBottom: 4 },

  // Signatures
  signWrap: { marginTop: 34, flexDirection: 'row', justifyContent: 'space-between' },
  signCol: { width: '45%' },
  signLine: { borderBottomWidth: 1, borderBottomColor: palette.ink, height: 24 },
  signName: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  signRole: { fontSize: 7, color: palette.faint, letterSpacing: 0.8 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: palette.faint },
})

export type DocProfile = {
  businessName: string
  address: string | null
  city: string | null
  county?: string | null
  country?: string | null
  primaryPhone: string | null
  alternativePhone?: string | null
  email: string | null
  website?: string | null
  kraPin: string | null
  registrationNumber?: string | null
  currency?: string | null
} | null

export const money = (value: number | string, currency = 'KES') =>
  `${currency} ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-KE') : '—'

export const dateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
