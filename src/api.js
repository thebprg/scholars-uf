const API_BASE = '/api/scholars'

/**
 * Fetch paginated, filtered scholars (card-level data only)
 */
export async function fetchScholars(filters = {}, page = 1) {
  const params = new URLSearchParams()
  params.set('page', page)

  if (filters.search) params.set('search', filters.search)
  if (filters.minScore) params.set('minScore', filters.minScore)
  if (filters.maxScore) params.set('maxScore', filters.maxScore)
  if (filters.minGrants) params.set('minGrants', filters.minGrants)
  if (filters.maxGrants) params.set('maxGrants', filters.maxGrants)
  if (filters.reqSearch) params.set('reqSearch', filters.reqSearch)
  if (filters.emailOnly) params.set('emailOnly', 'true')

  if (filters.depts?.length) {
    params.set('depts', filters.depts.join(','))
    params.set('deptMode', filters.deptMode || 'include')
  }
  if (filters.subDepts?.length) {
    params.set('subDepts', filters.subDepts.join(','))
    params.set('subDeptMode', filters.subDeptMode || 'include')
  }
  if (filters.positions?.length) {
    params.set('positions', filters.positions.join(','))
    params.set('posMode', filters.posMode || 'include')
  }

  const res = await fetch(`${API_BASE}?${params}`)
  if (!res.ok) throw new Error('Failed to fetch scholars')
  return res.json() // { data, total, page, totalPages }
}

/**
 * Fetch full details for a single scholar
 */
export async function fetchScholarDetail(id) {
  const res = await fetch(`${API_BASE}/${id}`)
  if (!res.ok) throw new Error('Failed to fetch scholar details')
  return res.json()
}

/**
 * Fetch full details for multiple scholars by their IDs
 */
export async function fetchScholarsBatch(ids) {
  if (!ids.length) return []
  const res = await fetch(`${API_BASE}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error('Failed to fetch scholars batch')
  return res.json()
}

/**
 * Fetch available filter options (departments and positions)
 */
export async function fetchFilterOptions() {
  const res = await fetch(`${API_BASE}/filters`)
  if (!res.ok) throw new Error('Failed to fetch filter options')
  return res.json() // { departments, positions }
}
