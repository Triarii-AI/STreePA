import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, createProject, deleteProject, logout, importProject,
         listBackups, createBackup, deleteBackupFile, getBackupSettings, saveBackupSettings } from '../api.js'
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

  const [showBackups, setShowBackups] = useState(false)
  const [backups, setBackups] = useState([])
  const [backupSettings, setBackupSettings] = useState({ enabled: false, interval_minutes: 60, max_backups: 20 })
  const [backupsLoading, setBackupsLoading] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [backupMsg, setBackupMsg] = useState(null)
  const [deletingBackup, setDeletingBackup] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true)
    try {
      const [list, settings] = await Promise.all([listBackups(), getBackupSettings()])
      setBackups(list || [])
      setBackupSettings(settings || { enabled: false, interval_minutes: 60, max_backups: 20 })
    } catch (err) {
      setBackupMsg({ type: 'error', text: err.message || 'Failed to load backups.' })
    } finally {
      setBackupsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showBackups) loadBackups()
  }, [showBackups, loadBackups])

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

  async function handleBackupNow() {
    setBackingUp(true)
    setBackupMsg(null)
    try {
      const result = await createBackup()
      setBackupMsg({ type: 'success', text: `Backup created: ${result.filename} (${result.valid ? 'valid' : 'INVALID'})` })
      await loadBackups()
    } catch (err) {
      setBackupMsg({ type: 'error', text: err.message || 'Backup failed.' })
    } finally {
      setBackingUp(false)
    }
  }

  async function handleDeleteBackup(filename) {
    if (!window.confirm(`Delete backup ${filename}?`)) return
    setDeletingBackup(filename)
    try {
      await deleteBackupFile(filename)
      setBackups(prev => prev.filter(b => b.filename !== filename))
    } catch (err) {
      setBackupMsg({ type: 'error', text: err.message || 'Failed to delete backup.' })
    } finally {
      setDeletingBackup(null)
    }
  }

  async function handleSaveSettings(newSettings) {
    setSavingSettings(true)
    try {
      const saved = await saveBackupSettings(newSettings)
      setBackupSettings(saved)
      setBackupMsg({ type: 'success', text: 'Auto-backup settings saved.' })
    } catch (err) {
      setBackupMsg({ type: 'error', text: err.message || 'Failed to save settings.' })
    } finally {
      setSavingSettings(false)
    }
  }

  function formatBackupDate(isoStr) {
    try {
      return new Date(isoStr).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch (_) { return isoStr }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const INTERVAL_OPTIONS = [
    { value: 5,    label: 'Every 5 minutes' },
    { value: 15,   label: 'Every 15 minutes' },
    { value: 30,   label: 'Every 30 minutes' },
    { value: 60,   label: 'Every hour' },
    { value: 360,  label: 'Every 6 hours' },
    { value: 720,  label: 'Every 12 hours' },
    { value: 1440, label: 'Every 24 hours' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top bar */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">STPA Tree Graph</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {user?.username || user?.name || 'User'}
          </span>
          <button
            onClick={() => { setShowBackups(true); setBackupMsg(null) }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-700 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-600 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
            title="Database Backups"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7M4 7c0 2 1.5 3 3.5 3h9C18.5 10 20 9 20 7M4 7c0-2 1.5-3 3.5-3h9c2 0 3.5 1 3.5 3M12 12v5m0 0l-2-2m2 2l2-2" />
            </svg>
            Backups
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Projects</h1>
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
              className="border border-gray-300 dark:border-gray-600 hover:border-indigo-400 text-gray-700 dark:text-gray-300 hover:text-indigo-700 dark:hover:text-indigo-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
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
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No projects yet</h2>
            <p className="text-gray-400 dark:text-gray-500 text-sm mb-6">Create your first STPA analysis project to get started.</p>
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
                className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all relative"
              >
                <button
                  onClick={e => handleDelete(e, project.id)}
                  disabled={deletingId === project.id}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                  title="Delete project"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>

                <div className="mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mb-3">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight mb-1">{project.title}</h3>
                  {project.purpose_statement && (
                    <p className="text-gray-500 dark:text-gray-400 text-sm line-clamp-2 leading-relaxed">{project.purpose_statement}</p>
                  )}
                </div>

                <div className="text-xs text-gray-400 dark:text-gray-500 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  Created {formatDate(project.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Backups Modal */}
      {showBackups && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7M4 7c0 2 1.5 3 3.5 3h9C18.5 10 20 9 20 7M4 7c0-2 1.5-3 3.5-3h9c2 0 3.5 1 3.5 3" />
                </svg>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Database Backups</h2>
              </div>
              <button
                onClick={() => setShowBackups(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Status message */}
              {backupMsg && (
                <div className={`p-3 rounded-lg text-sm border flex items-start gap-2 ${backupMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {backupMsg.type === 'success'
                    ? <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  }
                  {backupMsg.text}
                </div>
              )}

              {/* Manual backup */}
              <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Manual Backup</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Create a full copy of the database right now and validate it.</div>
                </div>
                <button
                  onClick={handleBackupNow}
                  disabled={backingUp}
                  className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  {backingUp ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Backing up…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      Backup Now
                    </>
                  )}
                </button>
              </div>

              {/* Auto-backup settings */}
              <div className="p-4 border border-gray-200 dark:border-gray-600 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Auto-Backup</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Automatically back up the database on a schedule.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveSettings({ ...backupSettings, enabled: !backupSettings.enabled })}
                    disabled={savingSettings}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${backupSettings.enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${backupSettings.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {backupSettings.enabled && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Interval</label>
                      <select
                        value={backupSettings.interval_minutes}
                        onChange={e => handleSaveSettings({ ...backupSettings, interval_minutes: parseInt(e.target.value) })}
                        disabled={savingSettings}
                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                      >
                        {INTERVAL_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Keep last</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={backupSettings.max_backups}
                          onChange={e => setBackupSettings(s => ({ ...s, max_backups: parseInt(e.target.value) || 1 }))}
                          onBlur={() => handleSaveSettings(backupSettings)}
                          disabled={savingSettings}
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">backups</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Backup list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Stored Backups {!backupsLoading && <span className="text-gray-400 font-normal">({backups.length})</span>}
                  </h3>
                  <button onClick={loadBackups} disabled={backupsLoading} className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
                    Refresh
                  </button>
                </div>

                {backupsLoading ? (
                  <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Loading…</div>
                ) : backups.length === 0 ? (
                  <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">
                    No backups yet. Click "Backup Now" to create one.
                  </div>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Size</th>
                          <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valid</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {backups.map(b => (
                          <tr key={b.filename} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-800 dark:text-gray-200">{formatBackupDate(b.created_at)}</div>
                              <div className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">{b.filename}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatSize(b.size)}</td>
                            <td className="px-4 py-3 text-center">
                              {b.valid
                                ? <span className="inline-flex items-center gap-1 text-green-700 font-medium text-xs"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>OK</span>
                                : <span className="inline-flex items-center gap-1 text-red-600 font-medium text-xs"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>Invalid</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleDeleteBackup(b.filename)}
                                disabled={deletingBackup === b.filename}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                                title="Delete backup"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Project</h2>
              <button
                onClick={() => { setShowNewModal(false); setNewTitle(''); setNewPurpose(''); setCreateError('') }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="p-5 space-y-4">
              {createError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="e.g. Autonomous Vehicle Braking System"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Purpose Statement <span className="text-red-500">*</span></label>
                <textarea
                  value={newPurpose}
                  onChange={e => setNewPurpose(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Describe the system purpose and safety objectives..."
                  rows={3}
                  required
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowNewModal(false); setNewTitle(''); setNewPurpose(''); setCreateError('') }}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
