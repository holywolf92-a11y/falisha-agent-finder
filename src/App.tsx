import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { AgenciesPage } from './pages/AgenciesPage';
import { SweepsPage } from './pages/SweepsPage';
import { OutreachPage } from './pages/OutreachPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-[shimmer_1.5s_linear_infinite]" />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agencies" element={<AgenciesPage />} />
        <Route path="/sweeps" element={<SweepsPage />} />
        <Route path="/outreach" element={<OutreachPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
