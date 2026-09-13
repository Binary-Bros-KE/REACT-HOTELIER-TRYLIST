import type { IconType } from 'react-icons'
import {
  LuBadgeCheck,
  LuLayoutDashboard,
  LuLogIn,
  LuBedDouble,
  LuConciergeBell,
  LuUsers,
  LuCreditCard,
  LuFileText,
  LuSignature,
  LuReceipt,
  LuReceiptText,
  LuListChecks,
  LuSearch,
  LuShoppingCart,
  LuTable2,
  LuBike,
  LuTruck,
  LuClipboardList,
  LuUtensils,
  LuChefHat,
  LuCalendarCheck,
  LuIdCard,
  LuPackage,
  LuLayers,
  LuWallet,
  LuBriefcase,
  LuCalendarClock,
  LuTags,
  LuWarehouse,
  LuBox,
  LuBookOpen,
  LuShoppingBag,
  LuShieldCheck,
  LuBanknote,
  LuArrowLeftRight,
  LuCircleCheck,
  LuChartColumn,
  LuBuilding2,
  LuSettings,
  LuBriefcaseBusiness,
  LuMapPin,
  LuPalette,
  LuHistory,
  LuNetwork,
  LuLayoutGrid,
  LuClock4,
  LuUserCheck,
  LuBoxes,
  LuTrendingUp,
} from 'react-icons/lu'

export const PERMISSION_SECTIONS = ['OVERVIEW', 'RECEPTION', 'HOUSEKEEPING', 'SALES', 'KITCHEN', 'SERVICE_CENTER', 'INVENTORY', 'TEAM', 'FINANCE', 'REPORTS', 'SYSTEM'] as const
export type PermissionSection = (typeof PERMISSION_SECTIONS)[number]

export const sectionLabels: Record<PermissionSection, string> = {
  OVERVIEW: 'Overview',
  RECEPTION: 'Reception',
  HOUSEKEEPING: 'Housekeeping',
  SALES: 'Sales',
  KITCHEN: 'Kitchen',
  SERVICE_CENTER: 'Service Center',
  INVENTORY: 'Inventory',
  TEAM: 'Team',
  FINANCE: 'Finance',
  REPORTS: 'Reports',
  SYSTEM: 'System',
}

export interface NavItem {
  label: string
  href: string
  icon: IconType
  moduleKey?: string
  // A specific Role.permissions capability tied to this item. Two roles:
  // (1) narrowing — e.g. Approvals only being useful to someone who can
  // actually decide a cancellation, not every Sales-section role; (2)
  // standalone access — holding the permission makes the item reachable
  // even without its group's section at all (e.g. an Accountant granted
  // REQUISITION_APPROVE reaching Purchase Requisitions with no Inventory
  // section access). See navItemAllowed(). A list means "any of these".
  permission?: string | string[]
}

export interface NavGroup {
  label: string
  section: PermissionSection
  items: NavItem[]
}

export const navigation: NavGroup[] = [
  {
    label: 'Overview',
    section: 'OVERVIEW',
    items: [{ label: 'Dashboard', href: '/', icon: LuLayoutDashboard }],
  },
  {
    label: 'Reception',
    section: 'RECEPTION',
    items: [
      { label: 'Check In', href: '/reservations', icon: LuLogIn, moduleKey: 'RESERVATIONS' },
      { label: 'Guest Stays', href: '/reception/stays', icon: LuHistory },
      { label: 'Room Management', href: '/rooms', icon: LuBedDouble, moduleKey: 'ROOMS' },
      { label: 'Services', href: '/reception/services', icon: LuConciergeBell },
      { label: 'Customers', href: '/reception/customers', icon: LuUsers },
      { label: 'Payment Methods', href: '/reception/payment-methods', icon: LuCreditCard },
      { label: 'Invoices', href: '/reception/invoices', icon: LuFileText },
      { label: 'Quotations', href: '/reception/quotations', icon: LuSignature },
      { label: 'Daily Expenses', href: '/reception/daily-expenses', icon: LuReceipt },
    ],
  },
  {
    label: 'Housekeeping',
    section: 'HOUSEKEEPING',
    items: [
      { label: 'Tasks', href: '/housekeeping', icon: LuListChecks, moduleKey: 'HOUSEKEEPING' },
      { label: 'Room Management', href: '/housekeeping/room-management', icon: LuBedDouble },
      { label: 'Customers', href: '/housekeeping/customers', icon: LuUsers },
      { label: 'Lost and Found', href: '/housekeeping/lost-and-found', icon: LuSearch },
    ],
  },
  {
    label: 'Sales',
    section: 'SALES',
    items: [
      { label: 'Point of Sale', href: '/pos', icon: LuShoppingCart, moduleKey: 'POS' },
      { label: 'Products POS', href: '/sales/products-pos', icon: LuPackage },
      { label: 'Approvals', href: '/sales/approvals', icon: LuBadgeCheck, permission: 'POS_APPROVE_CANCELLATION' },
      { label: 'Receipts', href: '/sales/receipts', icon: LuReceiptText },
      { label: 'Tables', href: '/sales/tables', icon: LuTable2 },
      { label: 'Customers', href: '/sales/customers', icon: LuUsers },
      { label: 'Riders', href: '/sales/riders', icon: LuBike },
      { label: 'Deliveries', href: '/sales/deliveries', icon: LuTruck },
      { label: 'Payment Methods', href: '/sales/payment-methods', icon: LuCreditCard },
    ],
  },
  {
    label: 'Kitchen',
    section: 'KITCHEN',
    items: [
      { label: 'Active Orders', href: '/kitchen', icon: LuClipboardList, moduleKey: 'KITCHEN' },
      { label: 'Menu Categories', href: '/menu/categories', icon: LuLayoutGrid },
      { label: 'Menu Items', href: '/menu/items', icon: LuUtensils },
      { label: 'Add-ons', href: '/menu/addons', icon: LuPackage },
      { label: 'Recipes', href: '/kitchen/recipes', icon: LuChefHat },
      { label: 'Daily Expenses', href: '/kitchen/daily-expenses', icon: LuReceipt },
    ],
  },
  {
    label: 'Service Center',
    section: 'SERVICE_CENTER',
    items: [
      { label: 'Point of Sale', href: '/service-center/pos', icon: LuShoppingCart, moduleKey: 'SERVICE_CENTER' },
      { label: 'Services', href: '/service-center/services', icon: LuConciergeBell },
      { label: 'Appointments', href: '/service-center/appointments', icon: LuCalendarCheck },
      { label: 'Memberships', href: '/service-center/memberships', icon: LuIdCard },
      { label: 'Products', href: '/service-center/products', icon: LuPackage },
      { label: 'Payment Methods', href: '/service-center/payment-methods', icon: LuCreditCard },
      { label: 'Customers', href: '/service-center/customers', icon: LuUsers },
      { label: 'Membership Plans', href: '/service-center/membership-plans', icon: LuLayers },
      { label: 'Membership Payments', href: '/service-center/membership-payments', icon: LuWallet },
      { label: 'Providers', href: '/service-center/providers', icon: LuBriefcase },
      { label: 'Schedules', href: '/service-center/schedules', icon: LuCalendarClock },
    ],
  },
  {
    label: 'Inventory',
    section: 'INVENTORY',
    items: [
      { label: 'Categories', href: '/inventory/categories', icon: LuTags, moduleKey: 'STORE' },
      { label: 'Products', href: '/products', icon: LuPackage, moduleKey: 'PRODUCTS' },
      { label: 'Store', href: '/store', icon: LuWarehouse, moduleKey: 'STORE' },
      { label: 'Assets', href: '/inventory/assets', icon: LuBox },
      { label: 'Stock Ledger', href: '/inventory/stock-ledger', icon: LuBookOpen },
      { label: 'Suppliers', href: '/inventory/suppliers', icon: LuTruck },
      { label: 'Purchase Requisitions', href: '/inventory/purchase-requisitions', icon: LuClipboardList, permission: ['REQUISITION_CREATE', 'REQUISITION_APPROVE'] },
      { label: 'Purchases', href: '/inventory/purchases', icon: LuShoppingBag },
      { label: 'Daily Expenses', href: '/inventory/daily-expenses', icon: LuReceipt },
    ],
  },
  {
    label: 'Team',
    section: 'TEAM',
    items: [
      { label: 'Employees', href: '/team/employees', icon: LuUsers, moduleKey: 'HR' },
      { label: 'Departments', href: '/team/departments', icon: LuNetwork },
      { label: 'Roles and Permissions', href: '/team/roles-permissions', icon: LuShieldCheck },
      { label: 'Shifts', href: '/team/shifts', icon: LuClock4, moduleKey: 'HR' },
      { label: 'Attendance', href: '/team/attendance', icon: LuUserCheck, moduleKey: 'HR' },
    ],
  },
  {
    label: 'Finance',
    section: 'FINANCE',
    items: [
      { label: 'Daily Expenses', href: '/finance/expenses', icon: LuWallet, moduleKey: 'ACCOUNTING' },
      { label: 'Salaries', href: '/finance/salaries', icon: LuBanknote },
      { label: 'Transactions', href: '/finance/transactions', icon: LuArrowLeftRight },
      { label: 'Approvals', href: '/finance/approvals', icon: LuCircleCheck },
    ],
  },
  {
    label: 'Reports',
    section: 'REPORTS',
    items: [
      { label: 'Sales Report', href: '/reports', icon: LuChartColumn, moduleKey: 'REPORTS' },
      { label: 'Inventory Report', href: '/reports/inventory-report', icon: LuBoxes },
      { label: 'Products Report', href: '/reports/products-report', icon: LuTrendingUp },
      { label: 'Hotel', href: '/reports/hotel', icon: LuBuilding2 },
    ],
  },
  {
    label: 'Business',
    section: 'SYSTEM',
    items: [
      { label: 'Business Information', href: '/business-information', icon: LuBriefcaseBusiness },
      { label: 'Locations', href: '/locations', icon: LuMapPin },
    ],
  },
  {
    label: 'System',
    section: 'SYSTEM',
    items: [
      { label: 'Appearance', href: '/appearance', icon: LuPalette },
      { label: 'Settings', href: '/settings', icon: LuSettings },
    ],
  },
]

export function sectionForPath(pathname: string): PermissionSection | undefined {
  return navigation.find((group) => group.items.some((item) => item.href === pathname))?.section
}

export function navItemForPath(pathname: string): { item: NavItem; section: PermissionSection } | undefined {
  for (const group of navigation) {
    const item = group.items.find((i) => i.href === pathname)
    if (item) return { item, section: group.section }
  }
  return undefined
}

/** Whether a role can reach this nav item: holding its own `permission`
 * (any one, if a list) makes it reachable on its own, regardless of section
 * — e.g. an Accountant granted REQUISITION_APPROVE reaching Purchase
 * Requisitions with no Inventory section access at all. Otherwise it needs
 * the group's section, AND the item's permission too if it declares one
 * (narrowing within an already-accessible section, e.g. Approvals). */
export function navItemAllowed(item: NavItem, hasSection: boolean, permissions: string[]): boolean {
  const required = item.permission == null ? [] : Array.isArray(item.permission) ? item.permission : [item.permission]
  if (required.length > 0 && required.some((p) => permissions.includes(p))) return true
  return hasSection && required.length === 0
}

// Hrefs that are a route-segment prefix of another nav item's href — e.g.
// "/housekeeping" is a prefix of "/housekeeping/room-management". Those must
// match EXACTLY (NavLink `end`), otherwise being on the child route lights
// up the parent item too and two tabs show active at once. Non-prefix items
// stay non-exact so their own detail routes (e.g. /sales/receipts/:id) keep
// the tab highlighted.
const parentHrefs: ReadonlySet<string> = (() => {
  const all = navigation.flatMap((group) => group.items.map((item) => item.href))
  const parents = new Set<string>()
  for (const href of all) {
    const prefix = href.endsWith('/') ? href : `${href}/`
    if (all.some((other) => other !== href && other.startsWith(prefix))) parents.add(href)
  }
  return parents
})()

export function navItemMatchesExactly(href: string): boolean {
  return href === '/' || parentHrefs.has(href)
}
