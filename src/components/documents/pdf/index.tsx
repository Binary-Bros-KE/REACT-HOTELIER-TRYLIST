import type { ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import type { DocProfile } from './theme'
import RequisitionDocument from './RequisitionDocument'
import PurchaseOrderDocument from './PurchaseOrderDocument'
import StockReceiptDocument from './StockReceiptDocument'
import StockTransferDocument from './StockTransferDocument'
import type { RequisitionDocData } from './RequisitionDocument'
import type { PurchaseOrderDocData } from './PurchaseOrderDocument'
import type { StockReceiptDocData } from './StockReceiptDocument'
import type { StockTransferDocData } from './StockTransferDocument'

export type { DocProfile }
export type DocKind = 'requisition' | 'purchase' | 'stock-transfer' | 'stock-receipt'
export type DocData = RequisitionDocData | PurchaseOrderDocData | StockTransferDocData | StockReceiptDocData

export function buildDocument(kind: DocKind, data: DocData, profile: DocProfile): ReactElement<DocumentProps> {
  if (kind === 'requisition') return <RequisitionDocument data={data as RequisitionDocData} profile={profile} />
  if (kind === 'stock-receipt') return <StockReceiptDocument data={data as StockReceiptDocData} profile={profile} />
  if (kind === 'stock-transfer') return <StockTransferDocument data={data as StockTransferDocData} profile={profile} />
  return <PurchaseOrderDocument data={data as PurchaseOrderDocData} profile={profile} />
}

export function documentMeta(kind: DocKind, data: DocData): { title: string; fileName: string } {
  if (kind === 'requisition') {
    const d = data as RequisitionDocData
    return { title: `Requisition ${d.requisitionNo}`, fileName: `${d.requisitionNo}.pdf` }
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
