import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ProjectCanvas from './pages/ProjectCanvas.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import useCanvasStore from './store/canvasStore.js'
import { getMe } from './api.js'

function ProtectedRoute({ children }) {
  const isAuthenticated = useCanvasStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const setUser = useCanvasStore(s => s.setUser)
  const [authChecked, setAuthChecked] = useState(false)
  const location = useLocation()

  useEffect(() => {
    getMe()
      .then(data => {
        if (data && data.user) setUser(data.user)
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [setUser])

  if (!authChecked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900">
        <div className="text-sm text-gray-400 dark:text-neutral-500">Loading...</div>
      </div>
    )
  }

  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <ProtectedRoute>
              <ProjectCanvas />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
