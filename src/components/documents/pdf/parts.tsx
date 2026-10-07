import { Image, Text, View } from '@react-pdf/renderer'
import { resolveLogoUrl } from '@/lib/api'
import { palette, s, statusColor, dateTime } from './theme'
import type { DocProfile } from './theme'

export function Letterhead({ profile, docType, docNo, status }: { profile: DocProfile; docType: string; docNo: string; status: string }) {
  const contact = [profile?.address, [profile?.city, profile?.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
  const color = statusColor[status] ?? palette.muted
  const mode = profile?.documentBrandingMode ?? 'NAME'
  const logoUrl = profile?.documentLogoUrl ? resolveLogoUrl(profile.documentLogoUrl) : null
  const showLogo = Boolean(logoUrl && mode !== 'NAME')
  const showName = mode !== 'LOGO'
  return (
    <View>
      <View style={s.headRow}>
        <View style={s.headLeft}>
          <View style={s.brandRow}>
            {showLogo ? <Image src={logoUrl!} style={s.documentLogo} /> : null}
            {showName ? <Text style={s.bizName}>{profile?.businessName ?? 'Business Name'}</Text> : null}
          </View>
          {contact ? <Text style={s.bizLine}>{contact}</Text> : null}
          <Text style={s.bizLine}>
            {[profile?.primaryPhone, profile?.email].filter(Boolean).join('  ·  ') || ' '}
          </Text>
          {profile?.kraPin ? <Text style={s.bizLine}>PIN: {profile.kraPin}</Text> : null}
        </View>
        <View style={s.headRight}>
          <Text style={s.docType}>{docType}</Text>
          <Text style={s.docNo}>{docNo}</Text>
          <Text style={[s.statusTag, { color, borderColor: color }]}>{status}</Text>
        </View>
      </View>
      <View style={s.rule} />
    </View>
  )
}

export function Party({ label, name, lines = [] }: { label: string; name: string; lines?: string[] }) {
  return (
    <View>
      <Text style={s.sectionLabel}>{label}</Text>
      <Text style={s.partyName}>{name}</Text>
      {lines.filter(Boolean).map((l, i) => (
        <Text key={i} style={s.bizLine}>{l}</Text>
      ))}
    </View>
  )
}

export function MetaGrid({ cells }: { cells: { key: string; value: string }[] }) {
  return (
    <View style={s.metaGrid}>
      {cells.map((c, i) => (
        <View key={c.key} style={i === cells.length - 1 ? s.metaCellLast : s.metaCell}>
          <Text style={s.metaKey}>{c.key.toUpperCase()}</Text>
          <Text style={s.metaVal}>{c.value || '—'}</Text>
        </View>
      ))}
    </View>
  )
}

export type DocLine = { name: string; sub?: string; qty: string; unit: string; total: string }

export function ItemsTable({ unitHeader, lines }: { unitHeader: string; lines: DocLine[] }) {
  return (
    <View style={s.table}>
      <View style={s.th} fixed>
        <Text style={[s.thText, s.colIdx, s.divide]}>#</Text>
        <Text style={[s.thText, s.colName, s.divide]}>DESCRIPTION</Text>
        <Text style={[s.thText, s.colNum, s.divide]}>QTY</Text>
        <Text style={[s.thText, s.colMoney, s.divide]}>{unitHeader.toUpperCase()}</Text>
        <Text style={[s.thText, s.colMoney]}>LINE TOTAL</Text>
      </View>
      {lines.map((l, i) => (
        <View key={i} style={s.tr} wrap={false}>
          <Text style={[s.td, s.colIdx, s.divide]}>{i + 1}</Text>
          <View style={[s.td, s.colName, s.divide]}>
            <Text>{l.name}</Text>
            {l.sub ? <Text style={s.tdSub}>{l.sub}</Text> : null}
          </View>
          <Text style={[s.td, s.colNum, s.divide]}>{l.qty}</Text>
          <Text style={[s.td, s.colMoney, s.divide]}>{l.unit}</Text>
          <Text style={[s.td, s.colMoney]}>{l.total}</Text>
        </View>
      ))}
    </View>
  )
}

export function Totals({ rows, grand }: { rows: { key: string; value: string }[]; grand: { key: string; value: string } }) {
  return (
    <View style={s.totalsWrap}>
      <View style={s.totalsBox}>
        {rows.map((r) => (
          <View key={r.key} style={s.totalRow}>
            <Text style={s.totalKey}>{r.key}</Text>
            <Text style={s.totalVal}>{r.value}</Text>
          </View>
        ))}
        <View style={[s.totalRow, s.totalRule]}>
          <Text style={s.grandKey}>{grand.key}</Text>
          <Text style={s.grandVal}>{grand.value}</Text>
        </View>
      </View>
    </View>
  )
}

export function SignatureBlock({ columns }: { columns: { role: string; name?: string; date?: string }[] }) {
  return (
    <View style={s.signWrap} wrap={false}>
      {columns.map((c) => (
        <View key={c.role} style={s.signCol}>
          <View style={s.signLine} />
          <Text style={s.signName}>{c.name || ' '}</Text>
          <Text style={s.signRole}>{c.role.toUpperCase()}{c.date ? `  ·  ${c.date}` : ''}</Text>
        </View>
      ))}
    </View>
  )
}

export function Footer({ profile }: { profile: DocProfile }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Generated {dateTime(new Date())}{profile?.businessName ? `  ·  ${profile.businessName}` : ''}</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}
