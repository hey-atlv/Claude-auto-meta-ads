import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SheetsDataProvider } from './contexts/SheetsDataContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { RoasSummary } from './pages/RoasSummary';
import { KpiManagement } from './pages/KpiManagement';
import { KpiProgress } from './pages/KpiProgress';
import { ContentAnalysis } from './pages/ContentAnalysis';
import { Alerts } from './pages/Alerts';
import { AlertsV2 } from './pages/AlertsV2';
import { AlertsFanpage } from './pages/AlertsFanpage';
import { Settings } from './pages/Settings';
import { Downloads } from './pages/Downloads';

import { Accounts } from './pages/Accounts';
import { Fanpages } from './pages/Fanpages';
import { Usage } from './pages/Usage';
import { Guide } from './pages/Guide';
import { FAQ } from './pages/FAQ';

const ProtectedRoute = ({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) => {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Đang tải...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && role !== 'admin') {
    return <div className="p-8 text-center text-red-600">Bạn không có quyền truy cập trang này.</div>;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Đang tải hệ thống...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <SheetsDataProvider>
            <Layout />
          </SheetsDataProvider>
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="roas-summary" element={<RoasSummary />} />
        <Route path="kpi-progress" element={<KpiProgress />} />
        <Route path="kpi-management" element={
          <ProtectedRoute requireAdmin>
            <KpiManagement />
          </ProtectedRoute>
        } />
        <Route path="content" element={<ContentAnalysis />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="alerts-v2" element={<AlertsV2 />} />
        <Route path="alerts-fanpage" element={<AlertsFanpage />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="pages" element={<Fanpages />} />
        <Route path="usage" element={
          <ProtectedRoute requireAdmin>
            <Usage />
          </ProtectedRoute>
        } />
        <Route path="settings" element={
          <ProtectedRoute requireAdmin>
            <Settings />
          </ProtectedRoute>
        } />
        <Route path="changelog" element={<div className="p-8">Nhật ký Thay đổi (Đang phát triển)</div>} />
        <Route path="guide" element={<Guide />} />
        <Route path="downloads" element={<Downloads />} />
        <Route path="faq" element={<FAQ />} />
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
