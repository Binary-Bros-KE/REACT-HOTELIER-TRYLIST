// What each logged action is, at a glance: a specific pill label and a colour per kind
// of action (money in, credit, voids, returns, stock, menu, stays, people, settings...).

export type KindColor = 'green' | 'amber' | 'red' | 'orange' | 'sky' | 'slate' | 'fuchsia' | 'indigo' | 'teal' | 'violet' | 'blue' | 'cyan' | 'pink'

export const KIND_COLORS: Record<KindColor, string> = {
  green: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300',
  amber: 'bg-amber-400/20 text-amber-800 ring-amber-500/40 dark:text-amber-300',
  red: 'bg-rose-500/15 text-rose-700 ring-rose-500/40 dark:text-rose-300',
  orange: 'bg-orange-500/15 text-orange-700 ring-orange-500/40 dark:text-orange-300',
  sky: 'bg-sky-500/15 text-sky-700 ring-sky-500/40 dark:text-sky-300',
  slate: 'bg-slate-500/15 text-slate-700 ring-slate-500/40 dark:text-slate-300',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-700 ring-fuchsia-500/40 dark:text-fuchsia-300',
  indigo: 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/40 dark:text-indigo-300',
  teal: 'bg-teal-500/15 text-teal-700 ring-teal-500/40 dark:text-teal-300',
  violet: 'bg-violet-500/15 text-violet-700 ring-violet-500/40 dark:text-violet-300',
  blue: 'bg-blue-500/15 text-blue-700 ring-blue-500/40 dark:text-blue-300',
  cyan: 'bg-cyan-500/15 text-cyan-700 ring-cyan-500/40 dark:text-cyan-300',
  pink: 'bg-pink-500/15 text-pink-700 ring-pink-500/40 dark:text-pink-300',
}

type Kind = { label: string; color: KindColor }

const KINDS: Record<string, Kind> = {
  // Money in
  'pos.payment.others_bill': { label: 'Payment recorded', color: 'green' },
  'pos.debt.collect': { label: 'Debt clearance', color: 'green' },
  'stay.credit_payment': { label: 'Stay debt payment', color: 'green' },
  // Credit
  'pos.order.credit': { label: 'Credit sale', color: 'amber' },
  // Voids and cancellations
  'pos.order.void': { label: 'Void sale', color: 'red' },
  'pos.order.cancel': { label: 'Order cancelled', color: 'red' },
  'pos.order.cancel_approve': { label: 'Cancellation approved', color: 'red' },
  'pos.order.revert': { label: 'Order reverted', color: 'red' },
  'pos.order.cancel_request': { label: 'Cancel request', color: 'sky' },
  'pos.order.cancel_reject': { label: 'Cancel refused', color: 'slate' },
  // Returns
  'pos.return.request': { label: 'Return request', color: 'sky' },
  'pos.return.approve': { label: 'Return approved', color: 'orange' },
  'pos.return.reject': { label: 'Return refused', color: 'slate' },
  // Bills
  'pos.order.make_complimentary': { label: 'Made complimentary', color: 'fuchsia' },
  'pos.order.make_sale': { label: 'Complimentary to sale', color: 'fuchsia' },
  'pos.order.split': { label: 'Bill split', color: 'indigo' },
  // Stock
  'stock.stock_take': { label: 'Stock take', color: 'teal' },
  'stock.stock_count': { label: 'Stock count', color: 'teal' },
  'stock.damage_loss': { label: 'Stock loss', color: 'red' },
  'stock.adjustment': { label: 'Stock adjustment', color: 'teal' },
  'stock.transfer': { label: 'Stock transfer', color: 'teal' },
  'stock.goods_received': { label: 'Goods received', color: 'green' },
  'stock.distribute': { label: 'Distributed', color: 'blue' },
  'stock.request': { label: 'Stock request', color: 'violet' },
  'stock.request_dispatch': { label: 'Request dispatched', color: 'green' },
  'stock.request_partial': { label: 'Request partial', color: 'orange' },
  'stock.request_reject': { label: 'Request rejected', color: 'red' },
  'stock.request_cancel': { label: 'Request cancelled', color: 'slate' },
  'purchase.create': { label: 'Purchase created', color: 'orange' },
  'store_usage.void': { label: 'Store usage voided', color: 'red' },
  'product.edit': { label: 'Product edited', color: 'teal' },
  'product.delete': { label: 'Product deleted', color: 'red' },
  // Menu, services, recipes
  'menu_item.create': { label: 'Menu item added', color: 'violet' },
  'menu_item.edit': { label: 'Menu item edited', color: 'violet' },
  'menu_item.delete': { label: 'Menu item deleted', color: 'red' },
  'menu_variant.edit': { label: 'Menu variant edited', color: 'violet' },
  'menu_variant.delete': { label: 'Menu variant deleted', color: 'red' },
  'recipe.edit': { label: 'Recipe edited', color: 'violet' },
  'recipe.rename': { label: 'Recipe renamed', color: 'violet' },
  'recipe.delete': { label: 'Recipe deleted', color: 'red' },
  'service.edit': { label: 'Service edited', color: 'violet' },
  'service.delete': { label: 'Service deleted', color: 'red' },
  'service_variant.edit': { label: 'Service option edited', color: 'violet' },
  'service_variant.delete': { label: 'Service option deleted', color: 'red' },
  'addon.edit': { label: 'Add-on edited', color: 'violet' },
  'addon.delete': { label: 'Add-on deleted', color: 'red' },
  // Stays
  'stay.updated': { label: 'Stay edited', color: 'blue' },
  'stay.cancelled': { label: 'Stay cancelled', color: 'red' },
  'stay.no_show': { label: 'No-show', color: 'red' },
  'stay.extended': { label: 'Stay extended', color: 'blue' },
  'stay.charge_removed': { label: 'Charge removed', color: 'red' },
  'stay.guest_removed': { label: 'Guest removed', color: 'blue' },
  'stay.room_terms_changed': { label: 'Room terms changed', color: 'blue' },
  'stay.room_charge_changed': { label: 'Room charge changed', color: 'amber' },
  'stay.room_changed': { label: 'Room moved', color: 'blue' },
  // Invoices and quotations
  'invoice.cancel': { label: 'Invoice cancelled', color: 'red' },
  'quotation.cancel': { label: 'Quotation cancelled', color: 'red' },
  // Spending
  'expense.create': { label: 'Expense recorded', color: 'orange' },
  'expense.edit': { label: 'Expense edited', color: 'orange' },
  'supplier.payment': { label: 'Supplier payment', color: 'orange' },
  'supplier.delete': { label: 'Supplier deleted', color: 'red' },
  // Salaries
  'salary.pay': { label: 'Salary paid', color: 'orange' },
  'salary.draft': { label: 'Salary draft saved', color: 'pink' },
  'salary.advance': { label: 'Salary advance', color: 'orange' },
  'salary.void': { label: 'Salary voided', color: 'red' },
  'salary.unvoid': { label: 'Salary restored', color: 'pink' },
  'salary.item_add': { label: 'Salary item added', color: 'pink' },
  'salary.item_remove': { label: 'Salary item removed', color: 'pink' },
  'salary.move_month': { label: 'Salary month moved', color: 'pink' },
  'salary.from_shift': { label: 'Salary from shift', color: 'pink' },
  'salary.delete_draft': { label: 'Salary draft deleted', color: 'red' },
  // Shifts and attendance
  'shift.force_end': { label: 'Shift force-ended', color: 'amber' },
  'shift.review': { label: 'Shift re-reviewed', color: 'amber' },
  'attendance.change': { label: 'Attendance changed', color: 'amber' },
  'attendance.remove': { label: 'Attendance removed', color: 'red' },
  // Staff and roles
  'employee.create': { label: 'Employee added', color: 'cyan' },
  'employee.edit': { label: 'Employee edited', color: 'cyan' },
  'employee.delete': { label: 'Employee deleted', color: 'red' },
  'role.create': { label: 'Role added', color: 'cyan' },
  'role.edit': { label: 'Role permissions changed', color: 'cyan' },
  'role.delete': { label: 'Role deleted', color: 'red' },
  // Settings
  'business.edit': { label: 'Business info changed', color: 'indigo' },
  'location.create': { label: 'Location added', color: 'indigo' },
  'location.edit': { label: 'Location edited', color: 'indigo' },
  'location.delete': { label: 'Location deleted', color: 'red' },
  'payment_method.create': { label: 'Payment method added', color: 'indigo' },
  'payment_method.edit': { label: 'Payment method edited', color: 'indigo' },
  'payment_method.delete': { label: 'Payment method deleted', color: 'red' },
  'mpesa.setup': { label: 'M-Pesa set up', color: 'indigo' },
  'mpesa.edit': { label: 'M-Pesa changed', color: 'indigo' },
  'room_type.edit': { label: 'Room type edited', color: 'indigo' },
  'room_type.delete': { label: 'Room type deleted', color: 'red' },
  'room.delete': { label: 'Room deleted', color: 'red' },
  'customer.delete': { label: 'Customer deleted', color: 'red' },
  // Sign-in
  'auth.login': { label: 'Signed in', color: 'slate' },
  'auth.logout': { label: 'Signed out', color: 'slate' },
  'auth.login_failed': { label: 'Failed sign-in', color: 'red' },
}

const human = (value: string) => value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
const VERBS: Record<string, string> = { create: 'added', edit: 'edited', delete: 'deleted', void: 'voided', cancel: 'cancelled' }

/** The pill for an action; anything not listed still reads specifically ("Purchase received"). */
export function activityKind(action: string): Kind {
  const known = KINDS[action]
  if (known) return known
  const [noun, verb] = action.split('.')
  if (noun === 'purchase') return { label: `Purchase ${verb.replace(/_/g, ' ')}`, color: 'orange' }
  if (noun === 'stay') return { label: `Stay ${verb.replace(/_/g, ' ')}`, color: 'blue' }
  if (noun === 'stock') return { label: human(`stock ${verb}`), color: 'teal' }
  const tail = action.split('.').slice(1)
  const last = tail[tail.length - 1] ?? ''
  const label = VERBS[last] ? `${human(noun)} ${VERBS[last]}` : human(action.replace(/\./g, ' '))
  return { label, color: ['delete', 'void', 'cancel'].includes(last) ? 'red' : 'slate' }
}
