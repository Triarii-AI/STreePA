import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ProjectCanvas from './pages/ProjectCanvas.jsx'
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
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-sm text-gray-400 dark:text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
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
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
