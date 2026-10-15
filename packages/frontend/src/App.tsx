import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute, OrgRequired } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';

import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { OrganizationsPage } from '@/pages/OrganizationsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { IntegrationsPage } from '@/pages/IntegrationsPage';
import { AutomationsPage } from '@/pages/AutomationsPage';
import { ExecutionsPage } from '@/pages/ExecutionsPage';
import { IncidentsPage } from '@/pages/IncidentsPage';
import { BackupsPage } from '@/pages/BackupsPage';
import { SecurityPage } from '@/pages/SecurityPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { PerformancePage } from '@/pages/PerformancePage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { SettingsPage } from '@/pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastContainer position="top-right" autoClose={4000} hideProgressBar={false} />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Organization selector (auth required, no org required) */}
          <Route path="/organizations" element={
            <ProtectedRoute>
              <OrganizationsPage />
            </ProtectedRoute>
          } />

          {/* Protected app routes with layout */}
          <Route path="/" element={
            <ProtectedRoute>
              <OrgRequired>
                <Layout />
              </OrgRequired>
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="automations" element={<AutomationsPage />} />
            <Route path="executions" element={<ExecutionsPage />} />
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="backups" element={<BackupsPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="audit" element={<AuditLogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
