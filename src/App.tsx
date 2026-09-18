import { useEffect } from "react";
import type { ReactNode } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import AppShell from "@/components/layout/AppShell";
import Login from "@/pages/Login";
import SharedReceiptPage from "@/pages/SharedReceiptPage";
import Dashboard from "@/pages/Dashboard";
import ModulePlaceholder from "@/pages/ModulePlaceholder";
import CafeSettings from "@/pages/CafeSettings";
import PointOfSale from "@/pages/PointOfSale";
import Kitchen from "@/pages/Kitchen";
import Reception from "@/pages/Reception";
import Rooms from "@/pages/Rooms";
import Housekeeping from "@/pages/Housekeeping";
import InventoryWorkspace from "@/pages/InventoryWorkspace";
import Products from "@/pages/Products";
import BusinessInformation from "@/pages/BusinessInformation";
import Employees from "@/pages/Employees";
import Departments from "@/pages/Departments";
import RolesAndPermissions from "@/pages/RolesAndPermissions";
import Shifts from "@/pages/Shifts";
import Attendance from "@/pages/Attendance";
import EmployeeSalaries from "@/pages/EmployeeSalaries";
import Categories from "@/pages/Categories";
import Recipes from "@/pages/Recipes";
import MenuCategories from "@/pages/MenuCategories";
import MenuItems from "@/pages/MenuItems";
import Addons from "@/pages/Addons";
import Tables from "@/pages/Tables";
import Reports from "@/pages/Reports";
import Receipts from "@/pages/Receipts";
import Approvals from "@/pages/Approvals";
import Locations from "@/pages/Locations";
import ThemeCustomizer from "@/pages/ThemeCustomizer";
import Customers from "@/pages/Customers";
import Services from "@/pages/Services";
import Stays from "@/pages/Stays";
import PaymentMethods from "@/pages/PaymentMethods";
import PrinterSettings from "@/pages/PrinterSettings";
import Transactions from "@/pages/Transactions";
import Expenses from "@/pages/Expenses";
import LostAndFound from "@/pages/LostAndFound";
import ProductsPointOfSale from "@/pages/ProductsPointOfSale";
import ServicesPointOfSale from "@/pages/ServicesPointOfSale";
import Assets from "@/pages/Assets";
import StockLedger from "@/pages/StockLedger";
import Suppliers from "@/pages/Suppliers";
import Purchases from "@/pages/Purchases";
import PurchaseRequisitions from "@/pages/PurchaseRequisitions";
import InventoryOverview from "@/pages/InventoryOverview";
import ProductsReport from "@/pages/ProductsReport";
import TaxReport from "@/pages/TaxReport";
import ServiceAppointments from "@/pages/ServiceAppointments";
import ServiceMembershipPayments from "@/pages/ServiceMembershipPayments";
import ServiceMembershipPlans from "@/pages/ServiceMembershipPlans";
import ServiceMemberships from "@/pages/ServiceMemberships";
import ServicePaymentMethods from "@/pages/ServicePaymentMethods";
import ServiceProviders from "@/pages/ServiceProviders";
import ServiceSchedules from "@/pages/ServiceSchedules";
import {
  navigation,
  navItemAllowed,
  navItemForPath,
  type PermissionSection,
} from "@/config/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout, restoreSession } from "@/store/authSlice";
import { fetchTenantContext, resolveTenant } from "@/store/tenantSlice";
import { setOutsideShiftHandler } from "@/lib/session";

const moduleRoutes = navigation
  .flatMap((g) => g.items)
  .filter(
    (item) =>
      !new Set([
        "/",
        "/service-center/appointments",
        "/service-center/memberships",
        "/service-center/payment-methods",
        "/service-center/membership-plans",
        "/service-center/membership-payments",
        "/service-center/providers",
        "/service-center/schedules",
      ]).has(item.href),
  );

const DEFAULT_SECTIONS: PermissionSection[] = ["OVERVIEW"];

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, expiresAt } = useAppSelector((s) => s.auth);
  const location = useLocation();
  const isValid = Boolean(user && expiresAt && expiresAt > Date.now());
  if (!isValid)
    return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

/** Blocks direct navigation to a route the sidebar wouldn't have shown —
 * this stops typing the URL from bypassing that. Mirrors Sidebar.tsx's own
 * navItemAllowed check exactly, so a permission-gated item (e.g. Purchase
 * Requisitions for an Accountant with no Inventory section) is reachable by
 * URL too, not just when clicked from a sidebar that already renders it.
 * The Dashboard ("/") is always reachable so there's no possible redirect
 * loop for a role missing OVERVIEW. */
function SectionGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const allowedSections =
    useAppSelector((s) => s.auth.user?.role?.allowedSections) ??
    DEFAULT_SECTIONS;
  const permissions =
    useAppSelector((s) => s.auth.user?.role?.permissions) ?? [];
  if (location.pathname === "/") return <>{children}</>;
  const found = navItemForPath(location.pathname);
  if (
    found &&
    !navItemAllowed(
      found.item,
      allowedSections.includes(found.section),
      permissions,
    )
  )
    return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const userId = useAppSelector((s) => s.auth.user?.id);
  const { resolved, resolveError } = useAppSelector((s) => s.tenant);

  useEffect(() => {
    void dispatch(resolveTenant());
    // Resolve the workspace (subdomain -> tenant) exactly once, on boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Any API call — not just login — can come back rejected because the
    // signed-in employee's shift has ended; force them back to the login
    // screen the same way an expired session does.
    setOutsideShiftHandler(() => void dispatch(logout()));
    return () => setOutsideShiftHandler(null);
  }, [dispatch]);

  useEffect(() => {
    if (resolved && !resolveError && token) void dispatch(restoreSession());
    // Only validate the persisted session once, right after the workspace resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, resolveError]);

  useEffect(() => {
    if (userId) void dispatch(fetchTenantContext());
  }, [dispatch, userId]);

  if (!resolved) {
    return (
      <div className="flex h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <LuLoaderCircle className="animate-spin" /> Loading workspace…
      </div>
    );
  }

  if (resolveError) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-sm bg-destructive/10 text-destructive">
          <LuTriangleAlert className="size-5" />
        </span>
        <h1 className="font-display text-xl font-semibold text-foreground">
          Workspace not found
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">{resolveError}</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/r/:token" element={<SharedReceiptPage />} />
      <Route
        element={
          <ProtectedRoute>
            <SectionGuard>
              <AppShell />
            </SectionGuard>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<CafeSettings />} />
        <Route path="/pos" element={<PointOfSale />} />
        <Route path="/sales/products-pos" element={<ProductsPointOfSale />} />
        <Route path="/service-center/pos" element={<ServicesPointOfSale />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/reservations" element={<Reception />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/housekeeping/room-management" element={<Rooms />} />
        <Route path="/housekeeping" element={<Housekeeping />} />
        <Route path="/store" element={<InventoryWorkspace />} />
        <Route path="/products" element={<Products />} />
        <Route path="/service-center/products" element={<Products />} />
        <Route path="/inventory/assets" element={<Assets />} />
        <Route path="/inventory/stock-ledger" element={<StockLedger />} />
        <Route path="/inventory/suppliers" element={<Suppliers />} />
        <Route path="/inventory/purchases" element={<Purchases />} />
        <Route
          path="/inventory/purchase-requisitions"
          element={<PurchaseRequisitions />}
        />
        <Route path="/inventory/categories" element={<Categories />} />
        <Route path="/kitchen/recipes" element={<Recipes />} />
        <Route path="/menu/categories" element={<MenuCategories />} />
        <Route path="/menu/items" element={<MenuItems />} />
        <Route path="/menu/addons" element={<Addons />} />
        <Route path="/sales/tables" element={<Tables />} />
        <Route path="/sales/approvals" element={<Approvals />} />
        <Route path="/sales/receipts" element={<Receipts />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/inventory-report" element={<InventoryOverview />} />
        <Route path="/reports/products-report" element={<ProductsReport />} />
        <Route path="/reports/tax-report" element={<TaxReport />} />
        <Route path="/business-information" element={<BusinessInformation />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/appearance" element={<ThemeCustomizer />} />
        <Route path="/reception/customers" element={<Customers />} />
        <Route path="/housekeeping/customers" element={<Customers />} />
        <Route path="/sales/customers" element={<Customers />} />
        <Route path="/service-center/customers" element={<Customers />} />
        <Route path="/reception/services" element={<Services />} />
        <Route path="/service-center/services" element={<Services />} />
        <Route path="/reception/stays" element={<Stays />} />
        <Route path="/reception/payment-methods" element={<PaymentMethods />} />
        <Route path="/sales/payment-methods" element={<PaymentMethods />} />
        <Route path="/sales/printer-settings" element={<PrinterSettings />} />
        <Route
          path="/service-center/payment-methods"
          element={<ServicePaymentMethods />}
        />
        <Route
          path="/service-center/appointments"
          element={<ServiceAppointments />}
        />
        <Route
          path="/service-center/memberships"
          element={<ServiceMemberships />}
        />
        <Route
          path="/service-center/membership-plans"
          element={<ServiceMembershipPlans />}
        />
        <Route
          path="/service-center/membership-payments"
          element={<ServiceMembershipPayments />}
        />
        <Route
          path="/service-center/providers"
          element={<ServiceProviders />}
        />
        <Route
          path="/service-center/schedules"
          element={<ServiceSchedules />}
        />
        <Route path="/finance/transactions" element={<Transactions />} />
        <Route path="/finance/expenses" element={<Expenses />} />
        <Route path="/reception/daily-expenses" element={<Expenses />} />
        <Route path="/kitchen/daily-expenses" element={<Expenses />} />
        <Route path="/inventory/daily-expenses" element={<Expenses />} />
        <Route path="/housekeeping/lost-and-found" element={<LostAndFound />} />
        <Route path="/team/employees" element={<Employees />} />
        <Route path="/team/departments" element={<Departments />} />
        <Route
          path="/team/roles-permissions"
          element={<RolesAndPermissions />}
        />
        <Route path="/team/shifts" element={<Shifts />} />
        <Route path="/team/attendance" element={<Attendance />} />
        <Route path="/finance/salaries" element={<EmployeeSalaries />} />
        {moduleRoutes.map((item) => (
          <Route
            key={item.href}
            path={item.href}
            element={<ModulePlaceholder />}
          />
        ))}
      </Route>
    </Routes>
  );
}

export default App;
