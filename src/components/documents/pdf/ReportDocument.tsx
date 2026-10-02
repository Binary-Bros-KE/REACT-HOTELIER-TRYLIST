import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { palette, s, dateTime } from './theme'
import type { DocProfile } from './theme'
import { Footer } from './parts'

// A generic printable for every /reports/* page — the summary cards plus
// whichever named breakdown tables that page already shows on screen (same
// sections, same numbers). Deliberately not the raw per-row detail tables
// (Expenses/Purchases "Detail" tabs, etc.) — those can run to hundreds of
// rows and already have their own CSV export; a printed report is meant to
// be a shareable summary, not a database dump. Landscape, since most report
// tables (by product, by employee, tax breakdown) run 5+ columns wide.

export type ReportCard = { label: string; value: string; hint?: string }
export type ReportColumn = { label: string; align?: 'left' | 'right' }
export type ReportSection = { title: string; note?: string; columns: ReportColumn[]; rows: (string | number)[][] }
export type ReportDocData = {
  reportTitle: string
  kicker?: string
  rangeLabel: string
  generatedAt: string
  cards: ReportCard[]
  sections: ReportSection[]
}

const rs = StyleSheet.create({
  headRight: { alignItems: 'flex-end' },
  kicker: { fontSize: 7.5, color: palette.faint, letterSpacing: 1.2, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  reportTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: palette.ink, textAlign: 'right', marginTop: 2 },
  rangeLabel: { fontSize: 9, color: palette.muted, textAlign: 'right', marginTop: 3 },

  cardsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 8 },
  card: { flexGrow: 1, minWidth: 110, borderWidth: 1, borderColor: palette.line, borderRadius: 2, padding: 8 },
  cardLabel: { fontSize: 6.5, color: palette.faint, letterSpacing: 0.8, fontFamily: 'Helvetica-Bold' },
  cardValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: palette.navy, marginTop: 3 },
  cardHint: { fontSize: 6.5, color: palette.muted, marginTop: 2 },

  sectionWrap: { marginTop: 18 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: palette.ink },
  sectionNote: { fontSize: 7.5, color: palette.muted, marginTop: 1, marginBottom: 6 },

  table: { borderWidth: 1, borderColor: palette.line, marginTop: 6 },
  th: { flexDirection: 'row', backgroundColor: palette.shade, borderBottomWidth: 1, borderBottomColor: palette.line },
  thText: { flex: 1, fontSize: 7, fontFamily: 'Helvetica-Bold', color: palette.muted, letterSpacing: 0.5, paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: palette.hairline },
  thTextLast: { flex: 1, fontSize: 7, fontFamily: 'Helvetica-Bold', color: palette.muted, letterSpacing: 0.5, paddingVertical: 5, paddingHorizontal: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: palette.hairline },
  trAlt: { backgroundColor: '#fafafa' },
  td: { flex: 1, fontSize: 8, paddingVertical: 4.5, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: palette.hairline },
  tdLast: { flex: 1, fontSize: 8, paddingVertical: 4.5, paddingHorizontal: 6 },
})

function ReportHeader({ profile, data }: { profile: DocProfile; data: ReportDocData }) {
  const contact = [profile?.address, [profile?.city, profile?.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
  return (
    <View>
      <View style={s.headRow}>
        <View style={s.headLeft}>
          <Text style={s.bizName}>{profile?.businessName ?? 'Business Name'}</Text>
          {contact ? <Text style={s.bizLine}>{contact}</Text> : null}
          <Text style={s.bizLine}>{[profile?.primaryPhone, profile?.email].filter(Boolean).join('  ·  ') || ' '}</Text>
          {profile?.kraPin ? <Text style={s.bizLine}>PIN: {profile.kraPin}</Text> : null}
        </View>
        <View style={[s.headRight, rs.headRight]}>
          {data.kicker ? <Text style={rs.kicker}>{data.kicker.toUpperCase()}</Text> : null}
          <Text style={rs.reportTitle}>{data.reportTitle}</Text>
          <Text style={rs.rangeLabel}>{data.rangeLabel}</Text>
        </View>
      </View>
      <View style={s.rule} />
    </View>
  )
}

function Cards({ cards }: { cards: ReportCard[] }) {
  if (cards.length === 0) return null
  return (
    <View style={rs.cardsRow}>
      {cards.map((c, i) => (
        <View key={i} style={rs.card}>
          <Text style={rs.cardLabel}>{c.label.toUpperCase()}</Text>
          <Text style={rs.cardValue}>{c.value}</Text>
          {c.hint ? <Text style={rs.cardHint}>{c.hint}</Text> : null}
        </View>
      ))}
    </View>
  )
}

function SectionTable({ section }: { section: ReportSection }) {
  if (section.rows.length === 0) return null
  return (
    <View style={rs.sectionWrap} wrap={false}>
      <Text style={rs.sectionTitle}>{section.title}</Text>
      {section.note ? <Text style={rs.sectionNote}>{section.note}</Text> : <View style={{ marginBottom: 6 }} />}
      <View style={rs.table}>
        <View style={rs.th} fixed>
          {section.columns.map((col, i) => (
            <Text key={i} style={[i === section.columns.length - 1 ? rs.thTextLast : rs.thText, col.align === 'right' ? { textAlign: 'right' } : undefined]}>
              {col.label.toUpperCase()}
            </Text>
          ))}
        </View>
        {section.rows.map((row, ri) => (
          <View key={ri} style={[rs.tr, ri % 2 === 1 ? rs.trAlt : undefined]} wrap={false}>
            {row.map((cell, ci) => (
              <Text key={ci} style={[ci === row.length - 1 ? rs.tdLast : rs.td, section.columns[ci]?.align === 'right' ? { textAlign: 'right' } : undefined]}>
                {String(cell)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

export default function ReportDocument({ data, profile }: { data: ReportDocData; profile: DocProfile }) {
  return (
    <Document title={data.reportTitle} author={profile?.businessName ?? 'HOTELIER'}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <ReportHeader profile={profile} data={data} />
        <Cards cards={data.cards} />
        {data.sections.map((section, i) => <SectionTable key={i} section={section} />)}
        <Text style={{ fontSize: 7, color: palette.faint, marginTop: 14 }}>Generated {dateTime(data.generatedAt)}</Text>
        <Footer profile={profile} />
      </Page>
    </Document>
  )
}
