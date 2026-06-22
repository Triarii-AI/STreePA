import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProject, downloadProjectJson, downloadProjectExcel, addProjectShare, getProjectShares, removeProjectShare, updateProjectShare } from '../api.js'
import useCanvasStore from '../store/canvasStore.js'

const AVATAR_COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
]

const ICON_COLORS = [
  { name: 'indigo', bg: 'bg-indigo-600' },
  { name: 'blue',   bg: 'bg-blue-500' },
  { name: 'teal',   bg: 'bg-teal-500' },
  { name: 'green',  bg: 'bg-green-500' },
  { name: 'yellow', bg: 'bg-yellow-500' },
  { name: 'orange', bg: 'bg-orange-500' },
  { name: 'red',    bg: 'bg-red-500' },
  { name: 'pink',   bg: 'bg-pink-500' },
  { name: 'purple', bg: 'bg-purple-600' },
]
function iconColorBg(colorName) {
  return (ICON_COLORS.find(c => c.name === colorName) || ICON_COLORS[0]).bg
}

function userInitials(user) {
  return (user.username || user.name || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function UserAvatar({ user, index }) {
  const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length]
  return (
    <div className="relative group">
      <div className={`w-7 h-7 rounded-full ${colorClass} flex items-center justify-center text-white text-xs font-medium ring-2 ring-white dark:ring-gray-800`}>
        {userInitials(user)}
      </div>
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {user.username || user.name}
      </div>
    </div>
  )
}

export default function Toolbar({ project }) {
  const navigate = useNavigate()
  const currentProject = useCanvasStore(s => s.currentProject)
  const patchCurrentProject = useCanvasStore(s => s.patchCurrentProject)
  const activeUsers = useCanvasStore(s => s.activeUsers)
  const viewOnly = useCanvasStore(s => s.viewOnly)
  const setViewOnly = useCanvasStore(s => s.setViewOnly)
  const darkMode = useCanvasStore(s => s.darkMode)
  const toggleDarkMode = useCanvasStore(s => s.toggleDarkMode)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showUsersPanel, setShowUsersPanel] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [shareInput, setShareInput] = useState('')
  const [shareRole, setShareRole] = useState('editor')
  const [shareStatus, setShareStatus] = useState(null) // { type: 'success'|'error', text }
  const [shareLoading, setShareLoading] = useState(false)
  const [sharesList, setSharesList] = useState([])
  const [sharesLoading, setSharesLoading] = useState(false)
  const titleInputRef = useRef(null)
  const usersPanelRef = useRef(null)

  function startEditTitle() {
    setTitleValue(project?.title || currentProject?.title || '')
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  async function saveTitle() {
    const proj = project || currentProject
    if (!proj) { setEditingTitle(false); return }
    const trimmed = titleValue.trim()
    if (!trimmed || trimmed === proj.title) { setEditingTitle(false); return }
    patchCurrentProject({ title: trimmed })
    setEditingTitle(false)
    try {
      await updateProject(proj.id, { title: trimmed })
    } catch (_) {
      patchCurrentProject({ title: proj.title })
    }
  }

  function handleTitleKeyDown(e) {
    if (e.key === 'Enter') saveTitle()
    if (e.key === 'Escape') setEditingTitle(false)
  }

  async function loadShares() {
    const projId = (project || currentProject)?.id
    if (!projId) return
    setSharesLoading(true)
    try {
      const data = await getProjectShares(projId)
      setSharesList(data || [])
    } catch (_) {}
    finally { setSharesLoading(false) }
  }

  async function handleToggleUsersPanel() {
    const next = !showUsersPanel
    setShowUsersPanel(next)
    if (next) loadShares()
  }

  async function handleShareFromPanel(e) {
    e.preventDefault()
    const projId = (project || currentProject)?.id
    if (!projId || !shareInput.trim()) return
    setShareLoading(true)
    setShareStatus(null)
    try {
      const userRole = (project || currentProject)?.user_role
      const role = userRole === 'owner' ? shareRole : 'editor'
      const entry = await addProjectShare(projId, shareInput.trim(), role)
      setSharesList(prev => [...prev, entry])
      setShareStatus({ type: 'success', text: `Shared with ${shareInput.trim()}` })
      setShareInput('')
    } catch (err) {
      setShareStatus({ type: 'error', text: err.message || 'Failed to share.' })
    } finally {
      setShareLoading(false)
    }
  }

  async function handleRoleChange(userId, newRole) {
    const projId = (project || currentProject)?.id
    if (!projId) return
    const prev = sharesList.find(s => s.user_id === userId)?.role
    setSharesList(list => list.map(s => s.user_id === userId ? { ...s, role: newRole } : s))
    try {
      await updateProjectShare(projId, userId, newRole)
    } catch (_) {
      setSharesList(list => list.map(s => s.user_id === userId ? { ...s, role: prev } : s))
    }
  }

  async function handleRemoveShareFromPanel(userId) {
    const projId = (project || currentProject)?.id
    if (!projId) return
    setSharesList(list => list.filter(s => s.user_id !== userId))
    try {
      await removeProjectShare(projId, userId)
    } catch (_) {
      loadShares()
    }
  }

  async function handleIconColorChange(colorName) {
    setShowColorPicker(false)
    const proj = project || currentProject
    if (!proj) return
    const prev = proj.icon_color
    patchCurrentProject({ icon_color: colorName })
    try {
      await updateProject(proj.id, { icon_color: colorName })
    } catch (_) {
      patchCurrentProject({ icon_color: prev })
    }
  }

  const iconColor = (project || currentProject)?.icon_color || 'indigo'
  const displayTitle = project?.title || currentProject?.title || 'Untitled Project'
  const userRole = (project || currentProject)?.user_role || 'owner'
  const isViewer = userRole === 'viewer'
  const isOwner = userRole === 'owner'
  const visibleUsers = activeUsers.slice(0, 3)
  const extraCount = activeUsers.length > 3 ? activeUsers.length - 3 : 0

  return (
    <div className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm flex items-center px-4 gap-4 flex-shrink-0 z-10">
      {/* Back to Dashboard */}
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 dark:hover:text-indigo-400 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
        title="Back to Dashboard"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Dashboard
      </button>

      {/* Left: Title */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Project icon — click to change color (hidden for viewers) */}
        <div className="relative flex-shrink-0">
          {isViewer ? (
            <div className={`w-7 h-7 rounded-lg ${iconColorBg(iconColor)} flex items-center justify-center`}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowColorPicker(v => !v)}
                className={`w-7 h-7 rounded-lg ${iconColorBg(iconColor)} flex items-center justify-center hover:opacity-85 transition-opacity`}
                title="Change project color"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </button>
              {showColorPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColorPicker(false)} />
                  <div className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-3" onClick={e => e.stopPropagation()}>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Icon color</p>
                    <div className="flex gap-1.5 flex-wrap" style={{ width: 132 }}>
                      {ICON_COLORS.map(c => (
                        <button
                          key={c.name}
                          onClick={() => handleIconColorChange(c.name)}
                          className={`w-6 h-6 rounded-full ${c.bg} transition-transform hover:scale-110 ${iconColor === c.name ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500' : ''}`}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {isViewer ? (
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-xs">
            {displayTitle}
          </span>
        ) : editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={handleTitleKeyDown}
            className="text-sm font-semibold text-gray-900 border border-indigo-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[120px] max-w-xs"
          />
        ) : (
          <button
            onClick={startEditTitle}
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-indigo-600 truncate max-w-xs text-left"
            title="Click to edit title"
          >
            {displayTitle}
          </button>
        )}
      </div>

      {/* View-only toggle — locked badge for viewers, toggle for editors/owners */}
      {isViewer ? (
        <div className="h-8 px-3 flex items-center gap-1.5 rounded-lg border bg-amber-50 dark:bg-amber-900/30 border-amber-400 text-amber-700 dark:text-amber-400 text-xs font-medium flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          View Only
        </div>
      ) : (
        <button
          onClick={() => setViewOnly(!viewOnly)}
          className={`h-8 px-3 flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors flex-shrink-0 ${
            viewOnly
              ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50'
              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title={viewOnly ? 'Switch to edit mode' : 'Switch to view-only mode'}
        >
          {viewOnly ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )}
          {viewOnly ? 'View Only' : 'Edit Mode'}
        </button>
      )}

      {/* Dark mode toggle */}
      <button
        onClick={toggleDarkMode}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
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

      {/* Export dropdown */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowExportMenu(s => !s)}
          className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xs font-medium"
          title="Export project"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showExportMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
            <div className="absolute right-0 top-10 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 w-48">
              <button
                onClick={() => { downloadProjectJson((project || currentProject)?.id); setShowExportMenu(false) }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Backup (.stpa.json)
              </button>
              <button
                onClick={() => { downloadProjectExcel((project || currentProject)?.id); setShowExportMenu(false) }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Spreadsheet (.xlsx)
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right: Active users / Access panel */}
      <div className="relative ml-2" ref={usersPanelRef}>
        <button
          onClick={handleToggleUsersPanel}
          className="flex items-center gap-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg px-2 py-1 transition-colors"
        >
          {activeUsers.length > 0 ? (
            <>
              <div className="flex items-center -space-x-1">
                {visibleUsers.map((u, i) => (
                  <UserAvatar key={u.id || u.username || i} user={u} index={i} />
                ))}
              </div>
              {extraCount > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">+{extraCount}</span>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                {activeUsers.length} online
              </span>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs font-medium">Access</span>
            </div>
          )}
        </button>

        {showUsersPanel && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUsersPanel(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg w-64 py-2">

              {/* Online users section */}
              {activeUsers.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-3 pb-1.5">
                    Currently online
                  </p>
                  <ul className="mb-1">
                    {activeUsers.map((u, i) => (
                      <li key={u.id || u.username || i} className="flex items-center gap-2.5 px-3 py-1.5">
                        <div className={`w-6 h-6 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-medium flex-shrink-0`}>
                          {userInitials(u)}
                        </div>
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                          {u.username || u.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                </>
              )}

              {/* Shared users with roles */}
              <div className="px-3 pt-1 pb-1">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                  {sharesLoading ? 'Loading…' : `Shared with (${sharesList.length})`}
                </p>
                {sharesList.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {sharesList.map(s => (
                      <li key={s.user_id} className="flex items-center gap-2 py-1">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xs font-semibold text-indigo-600 flex-shrink-0">
                          {(s.username || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-xs text-gray-800 dark:text-gray-200 truncate flex-1">{s.username}</span>
                        {isOwner ? (
                          <select
                            value={s.role}
                            onChange={e => handleRoleChange(s.user_id, e.target.value)}
                            className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.role === 'viewer' ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                            {s.role === 'viewer' ? 'Viewer' : 'Editor'}
                          </span>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => handleRemoveShareFromPanel(s.user_id)}
                            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Remove access"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Invite form — hidden for viewers */}
              {!isViewer && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-3 pt-2 pb-1">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Invite someone</p>
                  {shareStatus && (
                    <p className={`text-xs mb-1.5 ${shareStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {shareStatus.text}
                    </p>
                  )}
                  <form onSubmit={handleShareFromPanel} className="space-y-1.5">
                    <input
                      type="text"
                      value={shareInput}
                      onChange={e => { setShareInput(e.target.value); setShareStatus(null) }}
                      placeholder="Username"
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    />
                    <div className="flex gap-1.5">
                      {isOwner && (
                        <select
                          value={shareRole}
                          onChange={e => setShareRole(e.target.value)}
                          className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none flex-shrink-0"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      )}
                      <button
                        type="submit"
                        disabled={shareLoading || !shareInput.trim()}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        {shareLoading ? '…' : 'Share'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
