import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, createProject, deleteProject, logout, importProject } from '../api.js'
import useCanvasStore from '../store/canvasStore.js'

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch (_) {
    return dateStr
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useCanvasStore(s => s.user)
  const setUser = useCanvasStore(s => s.setUser)
  const projects = useCanvasStore(s => s.projects)
  const setProjects = useCanvasStore(s => s.setProjects)

  const [showNewModal, setShowNewModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPurpose, setNewPurpose] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef(null)

  useEffect(() => {
    getProjects()
      .then(data => setProjects(data || []))
      .catch(() => setProjects([]))
  }, [setProjects])

  async function handleLogout() {
    try { await logout() } catch (_) {}
    setUser(null)
    navigate('/login')
  }

  async function handleCreateProject(e) {
    e.preventDefault()
    if (!newTitle.trim() || !newPurpose.trim()) {
      setCreateError('Title and purpose statement are required.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const data = await createProject(newTitle.trim(), newPurpose.trim())
      setProjects([...projects, data.project])
      setShowNewModal(false)
      setNewTitle('')
      setNewPurpose('')
      navigate(`/projects/${data.project.id}`)
    } catch (err) {
      setCreateError(err.message || 'Failed to create project.')
      setCreating(false)
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const result = await importProject(data)
      const updated = await getProjects()
      setProjects(updated || [])
      navigate(`/projects/${result.project.id}`)
    } catch (err) {
      alert(err.message || 'Failed to import project. Make sure the file is a valid .stpa.json backup.')
    } finally {
      setImporting(false)
    }
  }

  async function handleDelete(e, projectId) {
    e.stopPropagation()
    if (!window.confirm('Delete this project? This action cannot be undone.')) return
    setDeletingId(projectId)
    try {
      await deleteProject(projectId)
      const updated = await getProjects()
      setProjects(updated || [])
    } catch (err) {
      alert(err.message || 'Failed to delete project.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">STPA Tree Graph</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {user?.username || user?.name || 'User'}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".json,.stpa.json"
              className="hidden"
              onChange={handleImport}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="border border-gray-300 hover:border-indigo-400 text-gray-700 hover:text-indigo-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {importing ? 'Importing…' : 'Import'}
            </button>
            <button
              onClick={() => { setShowNewModal(true); setCreateError('') }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No projects yet</h2>
            <p className="text-gray-400 text-sm mb-6">Create your first STPA analysis project to get started.</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <div
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="group bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all relative"
              >
                <button
                  onClick={e => handleDelete(e, project.id)}
                  disabled={deletingId === project.id}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                  title="Delete project"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>

                <div className="mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center mb-3">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 text-base leading-tight mb-1">{project.title}</h3>
                  {project.purpose_statement && (
                    <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed">{project.purpose_statement}</p>
                  )}
                </div>

                <div className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                  Created {formatDate(project.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">New Project</h2>
              <button
                onClick={() => { setShowNewModal(false); setNewTitle(''); setNewPurpose(''); setCreateError('') }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="p-5 space-y-4">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g. Autonomous Vehicle Braking System"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose Statement <span className="text-red-500">*</span></label>
                <textarea
                  value={newPurpose}
                  onChange={e => setNewPurpose(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  placeholder="Describe the system purpose and safety objectives..."
                  rows={3}
                  required
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowNewModal(false); setNewTitle(''); setNewPurpose(''); setCreateError('') }}
                  className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
