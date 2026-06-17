import React, { useState, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useNavigate } from 'react-router-dom'
import { updateProject } from '../api.js'
import useCanvasStore from '../store/canvasStore.js'

function UserAvatar({ user, index }) {
  const colors = [
    'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
    'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
  ]
  const colorClass = colors[index % colors.length]
  const initials = (user.username || user.name || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="relative group">
      <div className={`w-7 h-7 rounded-full ${colorClass} flex items-center justify-center text-white text-xs font-medium ring-2 ring-white`}>
        {initials}
      </div>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
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

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const titleInputRef = useRef(null)

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
    <div className="h-14 bg-white border-b border-gray-200 shadow-sm flex items-center px-4 gap-4 flex-shrink-0 z-10">
      {/* Back to Dashboard */}
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
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
            className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate max-w-xs text-left"
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
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors text-sm font-medium"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => reactFlow.zoomOut({ duration: 200 })}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors text-sm font-medium"
          title="Zoom Out"
        >
          &minus;
        </button>
        <button
          onClick={() => reactFlow.fitView({ duration: 400, padding: 0.1 })}
          className="h-8 px-3 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors text-xs font-medium gap-1"
          title="Fit View"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0 0l-5-5m-7 11l-5 5m5-5v4m0-4H4m16 0v4m0-4h-4m0 0l5 5" />
          </svg>
          Fit
        </button>
      </div>

      {/* Right: Active users */}
      {activeUsers.length > 0 && (
        <div className="flex items-center gap-1.5 ml-2">
          <div className="flex items-center -space-x-1">
            {visibleUsers.map((u, i) => (
              <UserAvatar key={u.id || u.username || i} user={u} index={i} />
            ))}
          </div>
          {extraCount > 0 && (
            <span className="text-xs text-gray-500 font-medium">+{extraCount}</span>
          )}
          <span className="text-xs text-gray-400 ml-1">
            {activeUsers.length} online
          </span>
        </div>
      )}
    </div>
  )
}
