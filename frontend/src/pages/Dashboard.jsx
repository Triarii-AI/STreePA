import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, getSharedProjects, createProject, deleteProject, duplicateProject, logout,
         importProject, listBackups, createBackup, deleteBackupFile, getBackupSettings, saveBackupSettings,
         updateUser, updateProject, getProjectShares, addProjectShare, removeProjectShare, updateProjectShare,
         downloadProjectJson, downloadProjectExcel } from '../api.js'
import useCanvasStore from '../store/canvasStore.js'

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch (_) {
    return dateStr
  }
}

function formatLastEdited(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch (_) {
    return ''
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useCanvasStore(s => s.user)
  const setUser = useCanvasStore(s => s.setUser)
  const projects = useCanvasStore(s => s.projects)
  const setProjects = useCanvasStore(s => s.setProjects)
  const darkMode = useCanvasStore(s => s.darkMode)
  const toggleDarkMode = useCanvasStore(s => s.toggleDarkMode)

  const [activeTab, setActiveTab] = useState('mine')
  const [sharedProjects, setSharedProjects] = useState([])

  const [showShareModal, setShowShareModal] = useState(false)
  const [shareTargetProject, setShareTargetProject] = useState(null)
  const [shareList, setShareList] = useState([])
  const [shareUsername, setShareUsername] = useState('')
  const [shareRole, setShareRole] = useState('editor')
  const [shareError, setShareError] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [removingShare, setRemovingShare] = useState(null)
  const [updatingShareRole, setUpdatingShareRole] = useState(null)

  const [cardMenu, setCardMenu] = useState(null) // { project, anchorEl }
  const [renamingProject, setRenamingProject] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  const [showNewModal, setShowNewModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPurpose, setNewPurpose] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef(null)

  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [acctCurrentPassword, setAcctCurrentPassword] = useState('')
  const [acctNewUsername, setAcctNewUsername] = useState('')
  const [acctNewPassword, setAcctNewPassword] = useState('')
  const [acctConfirmPassword, setAcctConfirmPassword] = useState('')
  const [acctError, setAcctError] = useState('')
  const [acctSuccess, setAcctSuccess] = useState('')
  const [acctSaving, setAcctSaving] = useState(false)

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
    getSharedProjects()
      .then(data => setSharedProjects(data || []))
      .catch(() => setSharedProjects([]))
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

  const ICON_COLORS = [
    { name: 'streepa', bg: 'bg-streepa-100 dark:bg-streepa-900/40', icon: 'text-streepa-600', swatch: 'bg-streepa-500' },
    { name: 'blue',   bg: 'bg-blue-100 dark:bg-blue-900/40',     icon: 'text-blue-600',   swatch: 'bg-blue-500' },
    { name: 'teal',   bg: 'bg-teal-100 dark:bg-teal-900/40',     icon: 'text-teal-600',   swatch: 'bg-teal-500' },
    { name: 'green',  bg: 'bg-green-100 dark:bg-green-900/40',   icon: 'text-green-600',  swatch: 'bg-green-500' },
    { name: 'yellow', bg: 'bg-yellow-100 dark:bg-yellow-900/40', icon: 'text-yellow-600', swatch: 'bg-yellow-500' },
    { name: 'orange', bg: 'bg-orange-100 dark:bg-orange-900/40', icon: 'text-orange-600', swatch: 'bg-orange-500' },
    { name: 'red',    bg: 'bg-red-100 dark:bg-red-900/40',       icon: 'text-red-600',    swatch: 'bg-red-500' },
    { name: 'pink',   bg: 'bg-pink-100 dark:bg-pink-900/40',     icon: 'text-pink-600',   swatch: 'bg-pink-500' },
    { name: 'purple', bg: 'bg-purple-100 dark:bg-purple-900/40', icon: 'text-purple-600', swatch: 'bg-purple-500' },
  ]
  function colorFor(project) {
    return ICON_COLORS.find(c => c.name === project.icon_color) || ICON_COLORS[0]
  }

  async function handleColorChange(e, project, colorName) {
    e.stopPropagation()
    setCardMenu(null)
    try {
      await updateProject(project.id, { icon_color: colorName })
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, icon_color: colorName } : p))
      setSharedProjects(prev => prev.map(p => p.id === project.id ? { ...p, icon_color: colorName } : p))
    } catch (err) {
      console.error('Color change failed:', err)
    }
  }

  async function handleDuplicate(e, project) {
    e.stopPropagation()
    setCardMenu(null)
    try {
      const data = await duplicateProject(project.id)
      setProjects(prev => [data.project, ...prev])
    } catch (err) {
      alert(err.message || 'Failed to duplicate project.')
    }
  }

  function openRename(e, project) {
    e.stopPropagation()
    setCardMenu(null)
    setRenamingProject(project)
    setRenameValue(project.title)
  }

  async function handleRename(e) {
    e.preventDefault()
    if (!renameValue.trim() || renameValue.trim() === renamingProject.title) {
      setRenamingProject(null); return
    }
    setRenameSaving(true)
    try {
      const updated = await updateProject(renamingProject.id, { title: renameValue.trim() })
      const newTitle = updated?.title ?? renameValue.trim()
      setProjects(prev => prev.map(p => p.id === renamingProject.id ? { ...p, title: newTitle } : p))
      setSharedProjects(prev => prev.map(p => p.id === renamingProject.id ? { ...p, title: newTitle } : p))
      setRenamingProject(null)
    } catch (err) {
      alert(err.message || 'Failed to rename project.')
    } finally {
      setRenameSaving(false)
    }
  }

  async function openShareModal(e, project) {
    e.stopPropagation()
    setShareTargetProject(project)
    setShareUsername('')
    setShareRole('editor')
    setShareError('')
    setShareList([])
    setShowShareModal(true)
    try {
      const data = await getProjectShares(project.id)
      setShareList(data || [])
    } catch (err) {
      setShareError(err.message || 'Failed to load shares.')
    }
  }

  async function handleAddShare(e) {
    e.preventDefault()
    if (!shareUsername.trim()) return
    setShareLoading(true)
    setShareError('')
    try {
      const entry = await addProjectShare(shareTargetProject.id, shareUsername.trim(), shareRole)
      setShareList(prev => [...prev, entry])
      setShareUsername('')
    } catch (err) {
      setShareError(err.message || 'Failed to share project.')
    } finally {
      setShareLoading(false)
    }
  }

  async function handleRemoveShare(userId) {
    setRemovingShare(userId)
    try {
      await removeProjectShare(shareTargetProject.id, userId)
      setShareList(prev => prev.filter(s => s.user_id !== userId))
    } catch (err) {
      setShareError(err.message || 'Failed to remove share.')
    } finally {
      setRemovingShare(null)
    }
  }

  async function handleUpdateShareRole(userId, newRole) {
    setUpdatingShareRole(userId)
    const prev = shareList.find(s => s.user_id === userId)?.role
    setShareList(list => list.map(s => s.user_id === userId ? { ...s, role: newRole } : s))
    try {
      await updateProjectShare(shareTargetProject.id, userId, newRole)
    } catch (err) {
      setShareList(list => list.map(s => s.user_id === userId ? { ...s, role: prev } : s))
      setShareError(err.message || 'Failed to update role.')
    } finally {
      setUpdatingShareRole(null)
    }
  }

  async function handleUpdateAccount(e) {
    e.preventDefault()
    setAcctError('')
    setAcctSuccess('')
    if (acctNewPassword && acctNewPassword !== acctConfirmPassword) {
      setAcctError('New passwords do not match.')
      return
    }
    if (!acctNewUsername && !acctNewPassword) {
      setAcctError('Enter a new username or new password to update.')
      return
    }
    setAcctSaving(true)
    try {
      const data = await updateUser({
        currentPassword: acctCurrentPassword,
        newUsername: acctNewUsername || undefined,
        newPassword: acctNewPassword || undefined,
      })
      setUser(data.user)
      setAcctSuccess('Account updated successfully.')
      setAcctCurrentPassword('')
      setAcctNewPassword('')
      setAcctConfirmPassword('')
      setAcctNewUsername('')
    } catch (err) {
      setAcctError(err.message || 'Failed to update account.')
    } finally {
      setAcctSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top bar */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 pl-3 pr-6 h-14 flex items-center justify-between">
        <div className="flex items-center">
          <img src="/streepa_wordmark.svg" alt="STreePA" className="h-12 w-auto dark:brightness-150" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {user?.username || user?.name || 'User'}
          </span>
          <button
            onClick={toggleDarkMode}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => { setShowAccountSettings(true); setAcctError(''); setAcctSuccess('') }}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Account Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => { setShowBackups(true); setBackupMsg(null) }}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-streepa-700 dark:hover:text-streepa-400 border border-gray-200 dark:border-gray-600 hover:border-streepa-300 rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5"
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
        {/* Tabs + actions row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('mine')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'mine'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              My Projects
              {projects.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{projects.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'shared'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Shared with Me
              {sharedProjects.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{sharedProjects.length}</span>
              )}
            </button>
          </div>

          {activeTab === 'mine' && (
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
                className="border border-gray-300 dark:border-gray-600 hover:border-streepa-400 text-gray-700 dark:text-gray-300 hover:text-streepa-700 dark:hover:text-streepa-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {importing ? 'Importing…' : 'Import'}
              </button>
              <button
                onClick={() => { setShowNewModal(true); setCreateError('') }}
                className="bg-streepa-600 hover:bg-streepa-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Project
              </button>
            </div>
          )}
        </div>

        {/* My Projects tab */}
        {activeTab === 'mine' && (
          projects.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-streepa-50 dark:bg-streepa-900/30 mb-4">
                <svg className="w-8 h-8 text-streepa-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No projects yet</h2>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-6">Create your first STPA analysis project to get started.</p>
              <button
                onClick={() => setShowNewModal(true)}
                className="bg-streepa-600 hover:bg-streepa-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                Create Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => {
                const color = colorFor(project)
                const isMenuOpen = cardMenu?.project?.id === project.id
                return (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 cursor-pointer hover:border-streepa-300 dark:hover:border-streepa-500 hover:shadow-md transition-all relative"
                  >
                    {/* Three-dot menu button */}
                    <div className="absolute top-3 right-3">
                      <button
                        onClick={e => { e.stopPropagation(); setCardMenu(isMenuOpen ? null : { project }) }}
                        className={`p-1.5 rounded-lg transition-opacity ${isMenuOpen ? 'opacity-100 bg-gray-100 dark:bg-gray-700' : 'opacity-0 group-hover:opacity-100'} text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700`}
                        title="Project options"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                        </svg>
                      </button>
                      {isMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setCardMenu(null) }} />
                          <div className="absolute right-0 top-8 z-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg w-52 py-1.5" onClick={e => e.stopPropagation()}>
                            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Icon color</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {ICON_COLORS.map(c => (
                                  <button
                                    key={c.name}
                                    onClick={e => handleColorChange(e, project, c.name)}
                                    className={`w-5 h-5 rounded-full ${c.swatch} transition-transform hover:scale-110 ${project.icon_color === c.name ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500' : ''}`}
                                    title={c.name}
                                  />
                                ))}
                              </div>
                            </div>
                            <button onClick={e => openRename(e, project)} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              Rename
                            </button>
                            <button onClick={e => { e.stopPropagation(); openShareModal(e, project) }} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                              Share
                            </button>
                            <button onClick={e => handleDuplicate(e, project)} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              Duplicate
                            </button>
                            <button onClick={e => { e.stopPropagation(); setCardMenu(null); downloadProjectJson(project.id) }} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Download JSON
                            </button>
                            <button onClick={e => { e.stopPropagation(); setCardMenu(null); downloadProjectExcel(project.id) }} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Download Excel
                            </button>
                            <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
                              <button onClick={e => { e.stopPropagation(); setCardMenu(null); handleDelete(e, project.id) }} className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Delete
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mb-3">
                      {/* Clickable icon — opens color picker menu */}
                      <button
                        onClick={e => { e.stopPropagation(); setCardMenu(isMenuOpen ? null : { project }) }}
                        className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center mb-3 hover:opacity-80 transition-opacity`}
                        title="Change icon color"
                      >
                        <svg className={`w-4 h-4 ${color.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </button>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight mb-1 pr-8">{project.title}</h3>
                      {project.purpose_statement && (
                        <p className="text-gray-500 dark:text-gray-400 text-sm line-clamp-2 leading-relaxed">{project.purpose_statement}</p>
                      )}
                    </div>

                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                      <span>Created {formatDate(project.created_at)}</span>
                      {project.updated_at && (
                        <span title={new Date(project.updated_at).toLocaleString()}>
                          Edited {formatLastEdited(project.updated_at)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Shared with Me tab */}
        {activeTab === 'shared' && (
          sharedProjects.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No shared projects</h2>
              <p className="text-gray-400 dark:text-gray-500 text-sm">Projects shared with you by other users will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sharedProjects.map(project => {
                const color = colorFor(project)
                const isMenuOpen = cardMenu?.project?.id === project.id
                return (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 cursor-pointer hover:border-streepa-300 dark:hover:border-streepa-500 hover:shadow-md transition-all relative"
                  >
                    {/* Three-dot menu button */}
                    <div className="absolute top-3 right-3">
                      <button
                        onClick={e => { e.stopPropagation(); setCardMenu(isMenuOpen ? null : { project }) }}
                        className={`p-1.5 rounded-lg transition-opacity ${isMenuOpen ? 'opacity-100 bg-gray-100 dark:bg-gray-700' : 'opacity-0 group-hover:opacity-100'} text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700`}
                        title="Project options"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                        </svg>
                      </button>
                      {isMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setCardMenu(null) }} />
                          <div className="absolute right-0 top-8 z-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg w-52 py-1.5" onClick={e => e.stopPropagation()}>
                            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Icon color</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {ICON_COLORS.map(c => (
                                  <button
                                    key={c.name}
                                    onClick={e => handleColorChange(e, project, c.name)}
                                    className={`w-5 h-5 rounded-full ${c.swatch} transition-transform hover:scale-110 ${project.icon_color === c.name ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500' : ''}`}
                                    title={c.name}
                                  />
                                ))}
                              </div>
                            </div>
                            <button onClick={e => openRename(e, project)} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              Rename
                            </button>
                            <button onClick={e => { e.stopPropagation(); openShareModal(e, project) }} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                              Share
                            </button>
                            <button onClick={e => handleDuplicate(e, project)} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              Duplicate
                            </button>
                            <button onClick={e => { e.stopPropagation(); setCardMenu(null); downloadProjectJson(project.id) }} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Download JSON
                            </button>
                            <button onClick={e => { e.stopPropagation(); setCardMenu(null); downloadProjectExcel(project.id) }} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Download Excel
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mb-3">
                      {/* Clickable icon — opens color picker menu */}
                      <button
                        onClick={e => { e.stopPropagation(); setCardMenu(isMenuOpen ? null : { project }) }}
                        className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center mb-3 hover:opacity-80 transition-opacity`}
                        title="Change icon color"
                      >
                        <svg className={`w-4 h-4 ${color.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </button>
                      <div className="flex items-start justify-between gap-2 pr-8">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight mb-1">{project.title}</h3>
                        {project.user_role === 'viewer' && (
                          <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            Viewer
                          </span>
                        )}
                      </div>
                      {project.purpose_statement && (
                        <p className="text-gray-500 dark:text-gray-400 text-sm line-clamp-2 leading-relaxed">{project.purpose_statement}</p>
                      )}
                    </div>

                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Created {formatDate(project.created_at)}</span>
                        {project.updated_at && (
                          <span title={new Date(project.updated_at).toLocaleString()}>
                            Edited {formatLastEdited(project.updated_at)}
                          </span>
                        )}
                      </div>
                      {project.owner_username && (
                        <div className="flex justify-end">
                          <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full text-xs">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {project.owner_username}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </main>

      {/* Backups Modal */}
      {showBackups && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-streepa-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="flex-shrink-0 bg-streepa-600 hover:bg-streepa-700 disabled:bg-streepa-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
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
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${backupSettings.enabled ? 'bg-streepa-600' : 'bg-gray-200'}`}
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
                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
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
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
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
                  <button onClick={loadBackups} disabled={backupsLoading} className="text-xs text-streepa-600 hover:underline disabled:opacity-50">
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

      {/* Share Project Modal */}
      {showShareModal && shareTargetProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Share Project</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{shareTargetProject.title}</p>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {shareError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  {shareError}
                </div>
              )}
              {(() => {
                const isOwner = shareTargetProject?.owner_id === user?.id
                const canManageRoles = isOwner || shareTargetProject?.user_role === 'editor'
                return (
                  <>
                    <form onSubmit={handleAddShare} className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shareUsername}
                          onChange={e => setShareUsername(e.target.value)}
                          placeholder="Enter username"
                          className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                        />
                        <select
                          value={shareRole}
                          onChange={e => setShareRole(e.target.value)}
                          className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none flex-shrink-0"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="submit"
                          disabled={shareLoading || !shareUsername.trim()}
                          className="bg-streepa-600 hover:bg-streepa-700 disabled:bg-streepa-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0"
                        >
                          {shareLoading ? '…' : 'Share'}
                        </button>
                      </div>
                    </form>

                    {shareList.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Shared with</p>
                        <ul className="space-y-1">
                          {shareList.map(s => (
                            <li key={s.user_id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                              <div className="w-6 h-6 rounded-full bg-streepa-100 dark:bg-streepa-900/40 flex items-center justify-center text-xs font-semibold text-streepa-600 flex-shrink-0">
                                {s.username[0].toUpperCase()}
                              </div>
                              <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{s.username}</span>
                              {canManageRoles ? (
                                <select
                                  value={s.role}
                                  onChange={e => handleUpdateShareRole(s.user_id, e.target.value)}
                                  disabled={updatingShareRole === s.user_id}
                                  className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none disabled:opacity-50"
                                >
                                  <option value="editor">Editor</option>
                                  <option value="viewer">Viewer</option>
                                </select>
                              ) : (
                                <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${s.role === 'viewer' ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                                  {s.role === 'viewer' ? 'Viewer' : 'Editor'}
                                </span>
                              )}
                              {isOwner && (
                                <button
                                  onClick={() => handleRemoveShare(s.user_id)}
                                  disabled={removingShare === s.user_id}
                                  className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                                  title="Remove access"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Account Settings Modal */}
      {showAccountSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Account Settings</h2>
              <button
                onClick={() => setShowAccountSettings(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleUpdateAccount} className="p-5 space-y-4">
              {acctError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  {acctError}
                </div>
              )}
              {acctSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400">
                  {acctSuccess}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Username</label>
                <input
                  type="text"
                  value={acctNewUsername}
                  onChange={e => setAcctNewUsername(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={acctNewPassword}
                  onChange={e => setAcctNewPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Leave blank to keep current"
                />
              </div>
              {acctNewPassword && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={acctConfirmPassword}
                    onChange={e => setAcctConfirmPassword(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Confirm new password"
                  />
                </div>
              )}
              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={acctCurrentPassword}
                  onChange={e => setAcctCurrentPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Required to confirm changes"
                  required
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAccountSettings(false)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={acctSaving}
                  className="flex-1 bg-streepa-600 hover:bg-streepa-700 disabled:bg-streepa-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {acctSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
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
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-500 focus:border-transparent resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                  className="flex-1 bg-streepa-600 hover:bg-streepa-700 disabled:bg-streepa-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Project Modal */}
      {renamingProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Rename Project</h2>
              <button
                onClick={() => setRenamingProject(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleRename} className="p-5 space-y-4">
              <input
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
                required
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRenamingProject(null)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renameSaving}
                  className="flex-1 bg-streepa-600 hover:bg-streepa-700 disabled:bg-streepa-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {renameSaving ? 'Saving…' : 'Rename'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
