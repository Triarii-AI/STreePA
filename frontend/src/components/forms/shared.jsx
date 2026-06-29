import React, { useState, useMemo, useRef, useEffect } from 'react'

export function SearchableSelect({ value, onChange, options, placeholder, focusRingClass, isMainFn, required }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q ? options.filter(o => o.label.toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q)) : options
  }, [options, query])

  const selectedOption = options.find(o => String(o.id) === String(value))

  useEffect(() => {
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 ${focusRingClass || 'focus:ring-streepa-400'} ${!selectedOption ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}
      >
        <span className={selectedOption && isMainFn && isMainFn(selectedOption) ? 'font-bold' : ''}>
          {selectedOption ? `${selectedOption.label}${selectedOption.description ? ` — ${selectedOption.description.slice(0, 40)}` : ''}` : placeholder}
        </span>
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-streepa-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {!required && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => { onChange(''); setOpen(false); setQuery('') }}
              >
                {placeholder}
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No results</div>
            )}
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1 ${String(o.id) === String(value) ? 'bg-streepa-50 dark:bg-streepa-900/30 text-streepa-700 dark:text-streepa-300' : 'text-gray-700 dark:text-gray-300'}`}
                onClick={() => { onChange(String(o.id)); setOpen(false); setQuery('') }}
              >
                <span className={isMainFn && isMainFn(o) ? 'font-bold' : ''}>{o.label}</span>
                {o.description && <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{o.description.slice(0, 50)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function SearchableCheckboxList({ items, selectedIds, onToggle, accentClass, isMainFn }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q ? items.filter(i => i.label?.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)) : items
  }, [items, query])
  const selectedCount = selectedIds.length

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700">
      <div className="px-2 py-1.5 border-b border-gray-100 dark:border-gray-600 flex items-center gap-1.5">
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search..."
          className="flex-1 text-xs focus:outline-none bg-transparent placeholder-gray-400"
        />
        {selectedCount > 0 && (
          <span className="text-[10px] font-medium text-streepa-600 bg-streepa-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
            {selectedCount} selected
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-600 max-h-40 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No results</div>
        )}
        {filtered.map(item => (
          <label key={item.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={e => onToggle(item.id, e.target.checked)}
              className={accentClass}
            />
            <span className={`text-xs text-gray-700 dark:text-gray-300 ${isMainFn && isMainFn(item) ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
            {item.description && <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.description}</span>}
          </label>
        ))}
      </div>
    </div>
  )
}
