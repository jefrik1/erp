import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth';
import Layout from './components/Layout';
import { DialogProvider } from './components/DialogProvider';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MasterProducts from './pages/MasterProducts';
import MasterCustomers from './pages/MasterCustomers';
import MasterSuppliers from './pages/MasterSuppliers';
import SalesOrders from './pages/SalesOrders';
import SalesOrderForm from './pages/SalesOrderForm';
import SalesOrderDetail from './pages/SalesOrderDetail';
import SalesInvoices from './pages/SalesInvoices';
import POS from './pages/POS';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseReceipts from './pages/PurchaseReceipts';
import PurchaseRequests from './pages/PurchaseRequests';
import RFQs from './pages/RFQs';
import InventoryStocks from './pages/InventoryStocks';
import InventoryMovements from './pages/InventoryMovements';
import InventoryTransfers from './pages/InventoryTransfers';
import FinanceCOA from './pages/FinanceCOA';
import FinanceJournals from './pages/FinanceJournals';
import FinanceARAP from './pages/FinanceARAP';
import Logistics from './pages/Logistics';
import HR from './pages/HR';
import CRM from './pages/CRM';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Projects from './pages/Projects';
import Consignments from './pages/Consignments';
import Pricing from './pages/Pricing';
import Returns from './pages/Returns';
import LandedCosts from './pages/LandedCosts';
import Fleet from './pages/Fleet';
import Waste from './pages/Waste';
import Budgets from './pages/Budgets';
import Loyalty from './pages/Loyalty';
import Assets from './pages/Assets';
import Marketplace from './pages/Marketplace';
import Credit from './pages/Credit';
import Calculator from './pages/Calculator';
import Approvals from './pages/Approvals';
import Audit from './pages/Audit';

function Protected({children}){
  const token=localStorage.getItem('token');
  if(!token) return <Navigate to="/login" replace/>;
  return <Layout>{children}</Layout>;
}

export default function App(){
  return (
    <BrowserRouter>
      <DialogProvider>
      <Routes>
        <Route path="/login" element={<Login/>}/>
        <Route path="/" element={<Protected><Dashboard/></Protected>}/>
        <Route path="/master/products" element={<Protected><MasterProducts/></Protected>}/>
        <Route path="/master/customers" element={<Protected><MasterCustomers/></Protected>}/>
        <Route path="/master/suppliers" element={<Protected><MasterSuppliers/></Protected>}/>
        <Route path="/sales/orders" element={<Protected><SalesOrders/></Protected>}/>
        <Route path="/sales/orders/new" element={<Protected><SalesOrderForm/></Protected>}/>
        <Route path="/sales/orders/detail/:id" element={<Protected><SalesOrderDetail/></Protected>}/>
        <Route path="/sales/invoices" element={<Protected><SalesInvoices/></Protected>}/>
        <Route path="/sales/pos" element={<Protected><POS/></Protected>}/>
        <Route path="/purchase/requests" element={<Protected><PurchaseRequests/></Protected>}/>
        <Route path="/purchase/rfqs" element={<Protected><RFQs/></Protected>}/>
        <Route path="/purchase/orders" element={<Protected><PurchaseOrders/></Protected>}/>
        <Route path="/purchase/receipts" element={<Protected><PurchaseReceipts/></Protected>}/>
        <Route path="/inventory/stocks" element={<Protected><InventoryStocks/></Protected>}/>
        <Route path="/inventory/movements" element={<Protected><InventoryMovements/></Protected>}/>
        <Route path="/inventory/transfers" element={<Protected><InventoryTransfers/></Protected>}/>
        <Route path="/finance/coa" element={<Protected><FinanceCOA/></Protected>}/>
        <Route path="/finance/journals" element={<Protected><FinanceJournals/></Protected>}/>
        <Route path="/finance/arap" element={<Protected><FinanceARAP/></Protected>}/>
        <Route path="/logistics" element={<Protected><Logistics/></Protected>}/>
        <Route path="/hr" element={<Protected><HR/></Protected>}/>
        <Route path="/crm" element={<Protected><CRM/></Protected>}/>
        <Route path="/reports" element={<Protected><Reports/></Protected>}/>
        <Route path="/settings" element={<Protected><Settings/></Protected>}/>
        <Route path="/projects" element={<Protected><Projects/></Protected>}/>
        <Route path="/consignments" element={<Protected><Consignments/></Protected>}/>
        <Route path="/pricing" element={<Protected><Pricing/></Protected>}/>
        <Route path="/returns" element={<Protected><Returns/></Protected>}/>
        <Route path="/landed-costs" element={<Protected><LandedCosts/></Protected>}/>
        <Route path="/fleet" element={<Protected><Fleet/></Protected>}/>
        <Route path="/waste" element={<Protected><Waste/></Protected>}/>
        <Route path="/budgets" element={<Protected><Budgets/></Protected>}/>
        <Route path="/loyalty" element={<Protected><Loyalty/></Protected>}/>
        <Route path="/assets" element={<Protected><Assets/></Protected>}/>
        <Route path="/marketplace" element={<Protected><Marketplace/></Protected>}/>
        <Route path="/credit" element={<Protected><Credit/></Protected>}/>
        <Route path="/calculator" element={<Protected><Calculator/></Protected>}/>
        <Route path="/approvals" element={<Protected><Approvals/></Protected>}/>
        <Route path="/audit" element={<Protected><Audit/></Protected>}/>
      </Routes>
      </DialogProvider>
    </BrowserRouter>
  )
}
