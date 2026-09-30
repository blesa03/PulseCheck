import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import {
  PublicOnly,
  RequireAuth,
} from './auth/AuthGuards'

import {
  DashboardPage,
} from './pages/DashboardPage'

import {
  LoginPage,
} from './pages/LoginPage'

import {
  RegisterPage,
} from './pages/RegisterPage'

import {
  MonitorDetailPage,
} from './pages/MonitorDetailPage'

import './App.css'


function App() {
  return (
    <Routes>
      <Route
        element={<PublicOnly />}
      >
        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/register"
          element={<RegisterPage />}
        />
      </Route>

      <Route
        element={<RequireAuth />}
      >
        <Route
          path="/dashboard"
          element={<DashboardPage />}
        />

        <Route
          path="/monitors/:monitorId"
          element={<MonitorDetailPage />}
        />
      </Route>

      <Route
        path="/"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  )
}


export default App