import React, { useState, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useNavigate } from 'react-router-dom'
import { updateProject, downloadProjectJson, downloadProjectExcel } from '../api.js'
import useCanvasStore from '../store/canvasStore.js'

const AVATAR_COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
]

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
  const reactFlow = useReactFlow()
  const navigate = useNavigate()
  const currentProject = useCanvasStore(s => s.currentProject)
  const activeUsers = useCanvasStore(s => s.activeUsers)
  const viewOnly = useCanvasStore(s => s.viewOnly)
  const setViewOnly = useCanvasStore(s => s.setViewOnly)
  const darkMode = useCanvasStore(s => s.darkMode)
  const toggleDarkMode = useCanvasStore(s => s.toggleDarkMode)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showUsersPanel, setShowUsersPanel] = useState(false)
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
    try {
      await updateProject(proj.id, { title: trimmed })
    } catch (_) {}
    setEditingTitle(false)
  }

  function handleTitleKeyDown(e) {
    if (e.key === 'Enter') saveTitle()
    if (e.key === 'Escape') setEditingTitle(false)
  }

  const displayTitle = project?.title || currentProject?.title || 'Untitled Project'
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
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex-shrink-0 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>

        {editingTitle ? (
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

      {/* Center: Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => reactFlow.zoomIn({ duration: 200 })}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => reactFlow.zoomOut({ duration: 200 })}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
          title="Zoom Out"
        >
          &minus;
        </button>
        <button
          onClick={() => reactFlow.fitView({ duration: 400, padding: 0.1 })}
          className="h-8 px-3 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xs font-medium gap-1"
          title="Fit View"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0 0l-5-5m-7 11l-5 5m5-5v4m0-4H4m16 0v4m0-4h-4m0 0l5 5" />
          </svg>
          Fit
        </button>
      </div>

      {/* View-only toggle */}
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
        {viewOnly ? 'View Only' : 'Edit'}
      </button>

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

      {/* Right: Active users */}
      {activeUsers.length > 0 && (
        <div className="relative ml-2" ref={usersPanelRef}>
          <button
            onClick={() => setShowUsersPanel(v => !v)}
            className="flex items-center gap-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg px-2 py-1 transition-colors"
          >
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
          </button>

          {showUsersPanel && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUsersPanel(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg w-52 py-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-3 pb-1.5 border-b border-gray-100 dark:border-gray-700">
                  Currently online
                </p>
                <ul className="mt-1">
                  {activeUsers.map((u, i) => (
                    <li key={u.id || u.username || i} className="flex items-center gap-2.5 px-3 py-2">
                      <div className={`w-7 h-7 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-medium flex-shrink-0`}>
                        {userInitials(u)}
                      </div>
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {u.username || u.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
