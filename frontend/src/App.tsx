// src/App.tsx — Application router with auth protection

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import ScanResults from './pages/ScanResults';
import ScanHistory from './pages/ScanHistory';
import TeamManagement from './pages/TeamManagement';
import SpecAnalyzer from './pages/SpecAnalyzer';
import OperationScan from './pages/OperationScan';
import Settings from './pages/Settings';

function ScanRoute() {
  const { session } = useAuth();
  return session ? (
    <Layout>
      <ScanResults />
    </Layout>
  ) : (
    <div className="aegis-shell">
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <ScanResults />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--color-paper)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-line-strong)',
                fontSize: '14px',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-overlay)',
                fontFamily: 'var(--font-sans)',
              },
              success: { iconTheme: { primary: 'var(--aegis-safe-fg)', secondary: 'var(--color-paper)' } },
              error: { iconTheme: { primary: 'var(--aegis-critical-fg)', secondary: 'var(--color-paper)' } },
            }}
          />
          <Routes>
            {/* Public Landing & Auth routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Scan Results viewable by both guests and authenticated users */}
            <Route path="/scan/:scanId" element={<ScanRoute />} />

            {/* Protected routes */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/history" element={<ScanHistory />} />
              <Route path="/team" element={<TeamManagement />} />
              <Route path="/spec" element={<SpecAnalyzer />} />
              <Route path="/operation-scan" element={<OperationScan />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
