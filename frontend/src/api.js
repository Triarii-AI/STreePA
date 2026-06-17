export function pluralize(nodeType) {
  const map = {
    loss: 'losses',
    hazard: 'hazards',
    system_constraint: 'system_constraints',
    control_action: 'control_actions',
    uca: 'ucas',
    loss_scenario: 'loss_scenarios',
  }
  return map[nodeType] || nodeType + 's'
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      message = body.error || body.message || message
    } catch (_) {}
    throw new Error(message)
  }
  const text = await res.text()
  if (!text) return null
  return JSON.parse(text)
}

export async function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logout() {
  return request('/auth/logout', { method: 'POST' })
}

export async function register(username, password) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function getMe() {
  return request('/auth/me')
}

export async function getProjects() {
  return request('/api/projects')
}

export async function createProject(title, purposeStatement) {
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ title, purpose_statement: purposeStatement }),
  })
}

export async function getProject(id) {
  return request(`/api/projects/${id}`)
}

export async function updateProject(id, data) {
  return request(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteProject(id) {
  return request(`/api/projects/${id}`, { method: 'DELETE' })
}

export async function createNode(projectId, nodeType, data) {
  return request(`/api/projects/${projectId}/${pluralize(nodeType)}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateNode(projectId, nodeType, nodeId, data) {
  return request(`/api/projects/${projectId}/${pluralize(nodeType)}/${nodeId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteNode(projectId, nodeType, nodeId) {
  return request(`/api/projects/${projectId}/${pluralize(nodeType)}/${nodeId}`, {
    method: 'DELETE',
  })
}

export async function createLink(projectId, fromType, fromId, toType, toId) {
  return request(`/api/projects/${projectId}/links`, {
    method: 'POST',
    body: JSON.stringify({ from_type: fromType, from_id: fromId, to_type: toType, to_id: toId }),
  })
}

export async function deleteLink(projectId, fromType, fromId, toType, toId) {
  return request(`/api/projects/${projectId}/links`, {
    method: 'DELETE',
    body: JSON.stringify({ from_type: fromType, from_id: fromId, to_type: toType, to_id: toId }),
  })
}

export async function createCanvasEdge(projectId, data) {
  return request(`/api/projects/${projectId}/canvas_edges`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteCanvasEdge(projectId, edgeId) {
  return request(`/api/projects/${projectId}/canvas_edges/${edgeId}`, {
    method: 'DELETE',
  })
}
