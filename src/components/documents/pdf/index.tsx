import type { ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import type { DocProfile } from './theme'
import RequisitionDocument from './RequisitionDocument'
import PurchaseOrderDocument from './PurchaseOrderDocument'
import StockReceiptDocument from './StockReceiptDocument'
import StockTransferDocument from './StockTransferDocument'
import GroupInvoiceDocument from './GroupInvoiceDocument'
import CommercialDocument from './CommercialDocument'
import ReportDocument from './ReportDocument'
import PayslipDocument from './PayslipDocument'
import type { PayslipDocData } from './PayslipDocument'
import type { RequisitionDocData } from './RequisitionDocument'
import type { PurchaseOrderDocData } from './PurchaseOrderDocument'
import type { StockReceiptDocData } from './StockReceiptDocument'
import type { StockTransferDocData } from './StockTransferDocument'
import type { GroupInvoiceDocData } from './GroupInvoiceDocument'
import type { CommercialDocData } from './CommercialDocument'
import type { ReportDocData } from './ReportDocument'

export type { DocProfile }
export type { ReportDocData, ReportCard, ReportColumn, ReportRow, ReportSection } from './ReportDocument'
export type { PayslipDocData } from './PayslipDocument'
export type DocKind = 'requisition' | 'purchase' | 'stock-transfer' | 'stock-receipt' | 'group-invoice' | 'commercial-document' | 'report' | 'payslip'
export type DocData = RequisitionDocData | PurchaseOrderDocData | StockTransferDocData | StockReceiptDocData | GroupInvoiceDocData | CommercialDocData | ReportDocData | PayslipDocData

export function buildDocument(kind: DocKind, data: DocData, profile: DocProfile): ReactElement<DocumentProps> {
  if (kind === 'requisition') return <RequisitionDocument data={data as RequisitionDocData} profile={profile} />
  if (kind === 'stock-receipt') return <StockReceiptDocument data={data as StockReceiptDocData} profile={profile} />
  if (kind === 'group-invoice') return <GroupInvoiceDocument data={data as GroupInvoiceDocData} profile={profile} />
  if (kind === 'commercial-document') return <CommercialDocument data={data as CommercialDocData} profile={profile} />
  if (kind === 'stock-transfer') return <StockTransferDocument data={data as StockTransferDocData} profile={profile} />
  if (kind === 'report') return <ReportDocument data={data as ReportDocData} profile={profile} />
  if (kind === 'payslip') return <PayslipDocument data={data as PayslipDocData} profile={profile} />
  return <PurchaseOrderDocument data={data as PurchaseOrderDocData} profile={profile} />
}

export function documentMeta(kind: DocKind, data: DocData): { title: string; fileName: string } {
  if (kind === 'payslip') {
    const d = data as PayslipDocData
    return { title: `Payslip ${d.payslipNo}`, fileName: `${d.payslipNo}.pdf` }
  }
  if (kind === 'report') {
    const d = data as ReportDocData
    const slug = d.reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return { title: d.reportTitle, fileName: `${slug}-${new Date().toISOString().slice(0, 10)}.pdf` }
  }
  if (kind === 'requisition') {
    const d = data as RequisitionDocData
    return { title: `Requisition ${d.requisitionNo}`, fileName: `${d.requisitionNo}.pdf` }
  }
  if (kind === 'group-invoice') {
    const d = data as GroupInvoiceDocData
    return { title: `Invoice ${d.groupNo}`, fileName: `Invoice-${d.groupNo}.pdf` }
  }
  if (kind === 'commercial-document') {
    const d = data as CommercialDocData
    return { title: `${d.type === 'INVOICE' ? 'Invoice' : 'Quotation'} ${d.documentNo}`, fileName: `${d.documentNo}.pdf` }
  }
  if (kind === 'stock-transfer') {
    const d = data as StockTransferDocData
    return { title: `Stock Transfer ${d.transferNo}`, fileName: `${d.transferNo}.pdf` }
  }
  if (kind === 'stock-receipt') {
    const d = data as StockReceiptDocData
    return { title: `Goods Received ${d.receiptNo}`, fileName: `${d.receiptNo}.pdf` }
  }
  const d = data as PurchaseOrderDocData
  return { title: `Purchase Order ${d.purchaseNo}`, fileName: `${d.purchaseNo}.pdf` }
}
