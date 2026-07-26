import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in UI tree:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900 px-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-lg font-semibold text-gray-800 dark:text-neutral-100">
              Something went wrong
            </h1>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {this.props.message || 'This page hit an unexpected error and could not render.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <a
                href="/dashboard"
                className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Back to dashboard
              </a>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
