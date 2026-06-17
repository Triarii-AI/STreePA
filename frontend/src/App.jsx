import React, { useEffect } from 'react'
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

  useEffect(() => {
    getMe()
      .then(data => {
        if (data && data.user) setUser(data.user)
      })
      .catch(() => {
        // Not authenticated, leave as is
      })
  }, [setUser])

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
