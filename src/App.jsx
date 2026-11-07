import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { MotionConfig } from 'motion/react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { DialogProvider } from './components/DialogProvider';
import Login from './pages/Login';
import { useAuth } from './store/auth';
import { PAGE_ACCESS, canAccess, homeFor } from './config/access';

// Code-split per halaman: bundle utama jadi kecil, halaman dimuat saat dibuka.
const Dashboard = lazy(()=>import('./pages/Dashboard'));
const Guidebook = lazy(()=>import('./pages/Guidebook'));
const MasterProducts = lazy(()=>import('./pages/MasterProducts'));
const MasterCustomers = lazy(()=>import('./pages/MasterCustomers'));
const MasterSuppliers = lazy(()=>import('./pages/MasterSuppliers'));
const SalesOrders = lazy(()=>import('./pages/SalesOrders'));
const SalesOrderForm = lazy(()=>import('./pages/SalesOrderForm'));
const SalesOrderDetail = lazy(()=>import('./pages/SalesOrderDetail'));
const SalesInvoices = lazy(()=>import('./pages/SalesInvoices'));
const OrderHistory = lazy(()=>import('./pages/OrderHistory'));
const CreditControl = lazy(()=>import('./pages/CreditControl'));
const StockOpname = lazy(()=>import('./pages/StockOpname'));
const Tax = lazy(()=>import('./pages/Tax'));
const NotificationCenter = lazy(()=>import('./pages/NotificationCenter'));
const PublicTrack = lazy(()=>import('./pages/PublicTrack'));
const AccountingPeriods = lazy(()=>import('./pages/AccountingPeriods'));
const BankRecon = lazy(()=>import('./pages/BankRecon'));
const InventoryReports = lazy(()=>import('./pages/InventoryReports'));
const ApprovalRules = lazy(()=>import('./pages/ApprovalRules'));
const Receipt = lazy(()=>import('./pages/Receipt'));
const ErrorMonitor = lazy(()=>import('./pages/ErrorMonitor'));
const POS = lazy(()=>import('./pages/POS'));
const PurchaseOrders = lazy(()=>import('./pages/PurchaseOrders'));
const PurchaseReceipts = lazy(()=>import('./pages/PurchaseReceipts'));
const PurchaseRequests = lazy(()=>import('./pages/PurchaseRequests'));
const RFQs = lazy(()=>import('./pages/RFQs'));
const InventoryStocks = lazy(()=>import('./pages/InventoryStocks'));
const StockIn = lazy(()=>import('./pages/StockIn'));
const InventoryMovements = lazy(()=>import('./pages/InventoryMovements'));
const InventoryTransfers = lazy(()=>import('./pages/InventoryTransfers'));
const FinanceCOA = lazy(()=>import('./pages/FinanceCOA'));
const FinanceJournals = lazy(()=>import('./pages/FinanceJournals'));
const FinanceARAP = lazy(()=>import('./pages/FinanceARAP'));
const Logistics = lazy(()=>import('./pages/Logistics'));
const HR = lazy(()=>import('./pages/HR'));
const CRM = lazy(()=>import('./pages/CRM'));
const Reports = lazy(()=>import('./pages/Reports'));
const Settings = lazy(()=>import('./pages/Settings'));
const Projects = lazy(()=>import('./pages/Projects'));
const Consignments = lazy(()=>import('./pages/Consignments'));
const Pricing = lazy(()=>import('./pages/Pricing'));
const Returns = lazy(()=>import('./pages/Returns'));
const LandedCosts = lazy(()=>import('./pages/LandedCosts'));
const Fleet = lazy(()=>import('./pages/Fleet'));
const Waste = lazy(()=>import('./pages/Waste'));
const Budgets = lazy(()=>import('./pages/Budgets'));
const Loyalty = lazy(()=>import('./pages/Loyalty'));
const Assets = lazy(()=>import('./pages/Assets'));
const Calculator = lazy(()=>import('./pages/Calculator'));
const Approvals = lazy(()=>import('./pages/Approvals'));
const Audit = lazy(()=>import('./pages/Audit'));
const MyLeave = lazy(()=>import('./pages/MyLeave'));
const MyPermits = lazy(()=>import('./pages/MyPermits'));
const DriverTrips = lazy(()=>import('./pages/DriverTrips'));
const SuratJalan = lazy(()=>import('./pages/SuratJalan'));
const SuratJalanList = lazy(()=>import('./pages/SuratJalanList'));
const MyAttendance = lazy(()=>import('./pages/MyAttendance'));
const MyProfile = lazy(()=>import('./pages/MyProfile'));
const Announcements = lazy(()=>import('./pages/Announcements'));

function Protected({children, allow}){
  const user = useAuth(s=>s.user);
  const token = localStorage.getItem('token');
  if(!token) return <Navigate to="/login" replace/>;
  const roles = user?.roles || [];
  if(allow && !canAccess(roles, allow)){
    // Tidak punya akses: lempar ke beranda role masing-masing (kasir -> POS, driver -> Trip Saya).
    return <Navigate to={homeFor(roles)} replace/>;
  }
  return <Layout>{children}</Layout>;
}

export default function App(){
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
      <DialogProvider>
      <Suspense fallback={
        <div className="min-h-[100dvh] bg-bg">
          {/* bar tipis di atas: tanda chunk halaman sedang diambil, bukan layar putih */}
          <div className="fixed top-0 left-0 right-0 h-0.5 bg-brand/15 overflow-hidden z-[60]">
            <div className="route-progress h-full w-1/2 bg-brand"/>
          </div>
          <div className="grid place-items-center min-h-[100dvh]">
            <div className="flex items-center gap-2 text-sm text-ink-3">
              <span className="w-2 h-2 rounded-full bg-brand animate-pulse"/>Memuat halaman…
            </div>
          </div>
        </div>
      }>
      <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login/>}/>
        {/* Guidebook publik: bisa dibuka tanpa login, ditautkan dari halaman login. */}
        <Route path="/panduan" element={<Guidebook/>}/>
        {/* Halaman lacak publik untuk pelanggan: token acak per order, tanpa login. */}
        <Route path="/lacak/:token" element={<PublicTrack/>}/>
        <Route path="/" element={<Protected allow={PAGE_ACCESS.dashboard}><Dashboard/></Protected>}/>
        <Route path="/master/products" element={<Protected allow={PAGE_ACCESS.masterProducts}><MasterProducts/></Protected>}/>
        <Route path="/master/customers" element={<Protected allow={PAGE_ACCESS.masterCustomers}><MasterCustomers/></Protected>}/>
        <Route path="/master/suppliers" element={<Protected allow={PAGE_ACCESS.masterSuppliers}><MasterSuppliers/></Protected>}/>
        <Route path="/sales/orders" element={<Protected allow={PAGE_ACCESS.salesOrders}><SalesOrders/></Protected>}/>
        <Route path="/sales/orders/new" element={<Protected allow={PAGE_ACCESS.salesOrders}><SalesOrderForm/></Protected>}/>
        <Route path="/sales/orders/detail/:id" element={<Protected allow={PAGE_ACCESS.salesOrders}><SalesOrderDetail/></Protected>}/>
        <Route path="/sales/invoices" element={<Protected allow={PAGE_ACCESS.invoices}><SalesInvoices/></Protected>}/>
        <Route path="/sales/order-history" element={<Protected allow={PAGE_ACCESS.orderHistory}><OrderHistory/></Protected>}/>
        <Route path="/credit" element={<Protected allow={PAGE_ACCESS.credit}><CreditControl/></Protected>}/>
        <Route path="/inventory/opname" element={<Protected allow={PAGE_ACCESS.opname}><StockOpname/></Protected>}/>
        <Route path="/finance/tax" element={<Protected allow={PAGE_ACCESS.tax}><Tax/></Protected>}/>
        <Route path="/finance/periods" element={<Protected allow={PAGE_ACCESS.periods}><AccountingPeriods/></Protected>}/>
        <Route path="/finance/recon" element={<Protected allow={PAGE_ACCESS.recon}><BankRecon/></Protected>}/>
        <Route path="/reports/inventory" element={<Protected allow={PAGE_ACCESS.inventoryReports}><InventoryReports/></Protected>}/>
        <Route path="/approval-rules" element={<Protected allow={PAGE_ACCESS.approvalRules}><ApprovalRules/></Protected>}/>
        <Route path="/pos/receipt/:id" element={<Protected allow={PAGE_ACCESS.receipt}><Receipt/></Protected>}/>
        <Route path="/errors" element={<Protected allow={PAGE_ACCESS.errors}><ErrorMonitor/></Protected>}/>
        <Route path="/notify" element={<Protected allow={PAGE_ACCESS.notify}><NotificationCenter/></Protected>}/>
        <Route path="/sales/pos" element={<Protected allow={PAGE_ACCESS.pos}><POS/></Protected>}/>
        <Route path="/purchase/requests" element={<Protected allow={PAGE_ACCESS.purchase}><PurchaseRequests/></Protected>}/>
        <Route path="/purchase/rfqs" element={<Protected allow={PAGE_ACCESS.purchase}><RFQs/></Protected>}/>
        <Route path="/purchase/orders" element={<Protected allow={PAGE_ACCESS.purchase}><PurchaseOrders/></Protected>}/>
        <Route path="/purchase/receipts" element={<Protected allow={PAGE_ACCESS.purchase}><PurchaseReceipts/></Protected>}/>
        <Route path="/inventory/stocks" element={<Protected allow={PAGE_ACCESS.inventory}><InventoryStocks/></Protected>}/>
        <Route path="/inventory/stock-in" element={<Protected allow={PAGE_ACCESS.inventory}><StockIn/></Protected>}/>
        <Route path="/inventory/movements" element={<Protected allow={PAGE_ACCESS.inventory}><InventoryMovements/></Protected>}/>
        <Route path="/inventory/transfers" element={<Protected allow={PAGE_ACCESS.inventory}><InventoryTransfers/></Protected>}/>
        <Route path="/finance/coa" element={<Protected allow={PAGE_ACCESS.finance}><FinanceCOA/></Protected>}/>
        <Route path="/finance/journals" element={<Protected allow={PAGE_ACCESS.finance}><FinanceJournals/></Protected>}/>
        <Route path="/finance/arap" element={<Protected allow={PAGE_ACCESS.finance}><FinanceARAP/></Protected>}/>
        <Route path="/logistics" element={<Protected allow={PAGE_ACCESS.logistics}><Logistics/></Protected>}/>
        <Route path="/hr" element={<Protected allow={PAGE_ACCESS.hr}><HR/></Protected>}/>
        <Route path="/crm" element={<Protected allow={PAGE_ACCESS.crm}><CRM/></Protected>}/>
        <Route path="/reports" element={<Protected allow={PAGE_ACCESS.reports}><Reports/></Protected>}/>
        <Route path="/settings" element={<Protected allow={PAGE_ACCESS.settings}><Settings/></Protected>}/>
        <Route path="/projects" element={<Protected allow={PAGE_ACCESS.projects}><Projects/></Protected>}/>
        <Route path="/consignments" element={<Protected allow={PAGE_ACCESS.consignments}><Consignments/></Protected>}/>
        <Route path="/pricing" element={<Protected allow={PAGE_ACCESS.pricing}><Pricing/></Protected>}/>
        <Route path="/returns" element={<Protected allow={PAGE_ACCESS.returns}><Returns/></Protected>}/>
        <Route path="/landed-costs" element={<Protected allow={PAGE_ACCESS.landedCosts}><LandedCosts/></Protected>}/>
        <Route path="/fleet" element={<Protected allow={PAGE_ACCESS.fleet}><Fleet/></Protected>}/>
        <Route path="/waste" element={<Protected allow={PAGE_ACCESS.waste}><Waste/></Protected>}/>
        <Route path="/budgets" element={<Protected allow={PAGE_ACCESS.budgets}><Budgets/></Protected>}/>
        <Route path="/loyalty" element={<Protected allow={PAGE_ACCESS.loyalty}><Loyalty/></Protected>}/>
        <Route path="/assets" element={<Protected allow={PAGE_ACCESS.assets}><Assets/></Protected>}/>
        <Route path="/calculator" element={<Protected allow={PAGE_ACCESS.calculator}><Calculator/></Protected>}/>
        <Route path="/approvals" element={<Protected allow={PAGE_ACCESS.approvals}><Approvals/></Protected>}/>
        <Route path="/audit" element={<Protected allow={PAGE_ACCESS.audit}><Audit/></Protected>}/>
        <Route path="/cuti" element={<Protected allow={PAGE_ACCESS.myLeave}><MyLeave/></Protected>}/>
        <Route path="/izin" element={<Protected allow={PAGE_ACCESS.myPermits}><MyPermits/></Protected>}/>
        <Route path="/driver" element={<Protected allow={PAGE_ACCESS.driverTrips}><DriverTrips/></Protected>}/>
        <Route path="/surat-jalan" element={<Protected allow={PAGE_ACCESS.suratJalan}><SuratJalanList/></Protected>}/>
        <Route path="/surat-jalan/:id" element={<Protected allow={PAGE_ACCESS.suratJalan}><SuratJalan/></Protected>}/>
        <Route path="/absen" element={<Protected allow={PAGE_ACCESS.myAttendance}><MyAttendance/></Protected>}/>
        <Route path="/profil" element={<Protected allow={PAGE_ACCESS.myProfile}><MyProfile/></Protected>}/>
        <Route path="/pengumuman" element={<Protected allow={PAGE_ACCESS.announcements}><Announcements/></Protected>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
      </ErrorBoundary>
      </Suspense>
      </DialogProvider>
      </MotionConfig>
    </BrowserRouter>
  )
}
