import { Navigate, Route, Routes } from 'react-router-dom'

import { PublicOnly, RequireAuth } from './auth/AuthGuards'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MonitorDetailPage } from './pages/MonitorDetailPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PublicStatusPage } from './pages/PublicStatusPage'
import { RegisterPage } from './pages/RegisterPage'
import { StatusPageSettingsPage } from './pages/StatusPageSettingsPage'

import './App.css'

export default function App() {
  return (
    <Routes>
      <Route path="/status/:slug" element={<PublicStatusPage />} />

      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/monitors/:monitorId" element={<MonitorDetailPage />} />
        <Route path="/status-page" element={<StatusPageSettingsPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}