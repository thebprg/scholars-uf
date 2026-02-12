import { useState, useMemo, useCallback, memo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import { fetchScholars, fetchScholarDetail, fetchFilterOptions } from './api'

const DEPT_MAPPINGS = {
  'AG': 'College of Agricultural and Life Sciences',
  'BA': 'Warrington College of Business',
  'CJC': 'College of Journalism and Communications',
  'COTA': 'College of the Arts',
  'DCP': 'College of Design, Construction and Planning',
  'DN': 'College of Dentistry',
  'ED': 'College of Education',
  'EG': 'Herbert Wertheim College of Engineering',
  'HH': 'College of Health and Human Performance',
  'JAX': 'College of Medicine – Jacksonville',
  'JX': 'College of Medicine – Jacksonville',
  'LB': 'George A. Smathers Libraries',
  'LS': 'College of Liberal Arts and Sciences',
  'LW': 'Levin College of Law',
  'MD': 'College of Medicine',
  'NH': 'Florida Museum of Natural History',
  'NR': 'College of Nursing',
  'PH': 'College of Pharmacy',
  'PHHP': 'College of Public Health and Health Professions',
  'VM': 'College of Veterinary Medicine',
  'SR': 'College of Veterinary Medicine',
  'HA': 'Health Affairs',
  'HP': 'Health Professions',
  'HS': 'Health Science Center',
  'RE': 'Office of Research',
  'SH': 'Student Health Care Center',
  'SL': 'Student Life',
  'PR': 'Office of the President',
  'PV': 'Office of the Provost',
  'TT': 'Treasurer\'s Office',
  'GR': 'Graduate School',
  'IP': 'UF Innovate',
  'IT': 'Information Technology'
}

function App() {

  // Load filters from localStorage
  const loadFilters = () => {
    const saved = localStorage.getItem('filters')
    if (saved) {
      const f = JSON.parse(saved)
      return {
        search: f.search || '',
        minScore: f.minScore || '',
        maxScore: f.maxScore || '',
        minGrants: f.minGrants || '',
        maxGrants: f.maxGrants || '',
        reqSearch: f.reqSearch || '',
        emailOnly: f.emailOnly || false,
        selectedDepts: new Set(f.selectedDepts || []),
        deptMode: f.deptMode || 'include',
        selectedSubDepts: new Set(f.selectedSubDepts || []),
        subDeptMode: f.subDeptMode || 'include',
        selectedPositions: new Set(f.selectedPositions || []),
        posMode: f.posMode || 'include'
      }
    }
    return null
  }

  const initialFilters = loadFilters()

  // Filters
  const [search, setSearch] = useState(initialFilters?.search || '')
  const [minScore, setMinScore] = useState(initialFilters?.minScore || '')
  const [maxScore, setMaxScore] = useState(initialFilters?.maxScore || '')
  const [minGrants, setMinGrants] = useState(initialFilters?.minGrants || '')
  const [maxGrants, setMaxGrants] = useState(initialFilters?.maxGrants || '')
  const [reqSearch, setReqSearch] = useState(initialFilters?.reqSearch || '')
  const [emailOnly, setEmailOnly] = useState(initialFilters?.emailOnly || false)

  // Department filters
  const [selectedDepts, setSelectedDepts] = useState(initialFilters?.selectedDepts || new Set())
  const [deptMode, setDeptMode] = useState(initialFilters?.deptMode || 'include')
  const [selectedSubDepts, setSelectedSubDepts] = useState(initialFilters?.selectedSubDepts || new Set())
  const [subDeptMode, setSubDeptMode] = useState(initialFilters?.subDeptMode || 'include')

  // Position filter
  const [selectedPositions, setSelectedPositions] = useState(initialFilters?.selectedPositions || new Set())
  const [posMode, setPosMode] = useState(initialFilters?.posMode || 'include')

  // Persist filters to localStorage
  useEffect(() => {
    const filters = {
      search, minScore, maxScore, minGrants, maxGrants, reqSearch, emailOnly,
      selectedDepts: [...selectedDepts],
      deptMode,
      selectedSubDepts: [...selectedSubDepts],
      subDeptMode,
      selectedPositions: [...selectedPositions],
      posMode
    }
    localStorage.setItem('filters', JSON.stringify(filters))
  }, [search, minScore, maxScore, minGrants, maxGrants, reqSearch, emailOnly,
      selectedDepts, deptMode, selectedSubDepts, subDeptMode, selectedPositions, posMode])

  // UI state
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const navigate = useNavigate()

  // Saved list (cart-like feature) - persisted to localStorage
  const [savedList, setSavedList] = useState(() => {
    const saved = localStorage.getItem('savedList')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  // Persist savedList to localStorage
  useEffect(() => {
    localStorage.setItem('savedList', JSON.stringify([...savedList]))
  }, [savedList])

  // Pagination
  const [page, setPage] = useState(1)

  // Modal
  const [selected, setSelected] = useState(null)
  const [modalLoading, setModalLoading] = useState(false)

  // API data state
  const [scholars, setScholars] = useState([])
  const [totalResults, setTotalResults] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filter options from DB
  const [allDepartments, setAllDepartments] = useState([])
  const [allPositions, setAllPositions] = useState([])

  // Debounce timer ref
  const debounceRef = useRef(null)

  // Fetch filter options on mount
  useEffect(() => {
    fetchFilterOptions()
      .then(data => {
        setAllDepartments(data.departments)
        setAllPositions(data.positions)
      })
      .catch(err => console.error('Failed to load filter options:', err))
  }, [])

  // Build filter params for API
  const buildFilterParams = useCallback(() => {
    const params = {}
    if (search) params.search = search
    if (minScore) params.minScore = minScore
    if (maxScore) params.maxScore = maxScore
    if (minGrants) params.minGrants = minGrants
    if (maxGrants) params.maxGrants = maxGrants
    if (reqSearch) params.reqSearch = reqSearch
    if (emailOnly) params.emailOnly = true

    // Convert department display names back to codes for API
    if (selectedDepts.size > 0) {
      const deptCodes = [...selectedDepts].map(d => d.split(' - ')[0].trim())
      params.depts = deptCodes
      params.deptMode = deptMode
    }
    if (selectedSubDepts.size > 0) {
      params.subDepts = [...selectedSubDepts]
      params.subDeptMode = subDeptMode
    }
    if (selectedPositions.size > 0) {
      params.positions = [...selectedPositions]
      params.posMode = posMode
    }
    return params
  }, [search, minScore, maxScore, minGrants, maxGrants, reqSearch, emailOnly,
      selectedDepts, deptMode, selectedSubDepts, subDeptMode, selectedPositions, posMode])

  // Fetch scholars when filters or page changes (debounced for text inputs)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const params = buildFilterParams()
        const result = await fetchScholars(params, page)
        setScholars(result.data)
        setTotalResults(result.total)
        setTotalPages(result.totalPages)
      } catch (err) {
        console.error('Failed to fetch scholars:', err)
        setError('Failed to load scholars. Is the server running?')
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [page, buildFilterParams])

  // Parse departments from DB data into display format
  const { departments, deptToSubDepts } = useMemo(() => {
    const depts = new Set()
    const mapping = {}

    allDepartments.forEach(dept => {
      if (dept) {
        const parts = dept.split('-')
        const mainDeptCode = parts[0].trim()
        const subDept = parts.length > 1 ? parts.slice(1).join('-').trim() : null

        if (mainDeptCode) {
          const mappedName = DEPT_MAPPINGS[mainDeptCode]
          const displayName = mappedName ? `${mainDeptCode} - ${mappedName}` : mainDeptCode

          depts.add(displayName)
          if (!mapping[displayName]) mapping[displayName] = new Set()
          if (subDept) mapping[displayName].add(`${mainDeptCode}-${subDept}`)
        }
      }
    })

    return {
      departments: Array.from(depts).sort(),
      deptToSubDepts: mapping
    }
  }, [allDepartments])

  const positions = useMemo(() => allPositions.sort(), [allPositions])

  const availableSubDepts = useMemo(() => {
    if (selectedDepts.size === 0) {
      const all = new Set()
      Object.values(deptToSubDepts).forEach(subs => subs.forEach(s => all.add(s)))
      return Array.from(all).sort()
    }
    const subs = new Set()
    selectedDepts.forEach(d => {
      if (deptToSubDepts[d]) deptToSubDepts[d].forEach(s => subs.add(s))
    })
    return Array.from(subs).sort()
  }, [selectedDepts, deptToSubDepts])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearch('')
    setMinScore('')
    setMaxScore('')
    setMinGrants('')
    setMaxGrants('')
    setReqSearch('')
    setEmailOnly(false)
    setSelectedDepts(new Set())
    setSelectedSubDepts(new Set())
    setSelectedPositions(new Set())
    setDeptMode('include')
    setSubDeptMode('include')
    setPosMode('include')
    setPage(1)
    localStorage.removeItem('filters')
  }, [])

  // Reset entire app (clear all localStorage)
  const resetApp = useCallback(() => {
    if (window.confirm('Reset all app data? This will clear your saved list, filters, and copied items.')) {
      localStorage.clear()
      clearAllFilters()
      setSavedList(new Set())
      window.location.reload()
    }
  }, [clearAllFilters])

  // List functions
  const toggleSaved = useCallback((id) => {
    setSavedList(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }, [])

  // Handle card click -> fetch full details for modal
  const handleCardClick = useCallback(async (scholar) => {
    setModalLoading(true)
    setSelected({ ...scholar, _loading: true })
    try {
      const fullData = await fetchScholarDetail(scholar.id)
      setSelected(fullData)
    } catch (err) {
      console.error('Failed to fetch scholar details:', err)
      setSelected({ ...scholar, _error: true })
    } finally {
      setModalLoading(false)
    }
  }, [])

  const toggleSet = useCallback((set, setFn, value) => {
    const newSet = new Set(set)
    if (newSet.has(value)) newSet.delete(value)
    else newSet.add(value)
    setFn(newSet)
    setPage(1)
  }, [])

  // Special handler for department toggle - clears orphaned sub-departments when unchecking
  const toggleDept = useCallback((value) => {
    const newDepts = new Set(selectedDepts)
    const isRemoving = newDepts.has(value)

    if (isRemoving) {
      newDepts.delete(value)

      if (selectedSubDepts.size > 0) {
        const removedDeptSubs = deptToSubDepts[value] || new Set()
        const stillValidSubs = new Set()
        newDepts.forEach(d => {
          if (deptToSubDepts[d]) {
            deptToSubDepts[d].forEach(s => stillValidSubs.add(s))
          }
        })

        if (newDepts.size > 0) {
          const newSubDepts = new Set()
          selectedSubDepts.forEach(s => {
            if (stillValidSubs.has(s)) {
              newSubDepts.add(s)
            }
          })
          setSelectedSubDepts(newSubDepts)
        }
      }
    } else {
      newDepts.add(value)
    }

    setSelectedDepts(newDepts)
    setPage(1)
  }, [selectedDepts, selectedSubDepts, deptToSubDepts])

  const handleFilterChange = useCallback((setter) => (e) => {
    setter(e.target.value)
    setPage(1)
  }, [])

  return (
    <div className="app">
      <header className="header">
        <h1>Gator Scholars</h1>
        <div className="header-right">
          <div className="header-stats">
            {loading ? 'Loading...' : (
              <>Showing <strong>{scholars.length}</strong> of {totalResults} matches</>
            )}
          </div>
          <button className="list-badge" onClick={() => navigate('/list')}>
            📋 View List {savedList.size > 0 && <span className="list-count">{savedList.size}</span>}
          </button>
          <button
            className="reset-btn"
            onClick={resetApp}
            title="Reset App Data"
          >
            ↻
          </button>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="filter-section">
            <label className="filter-label">🔍 Search by Name or Title</label>
            <input
              type="text"
              className="filter-input"
              placeholder="e.g. John Smith..."
              value={search}
              onChange={handleFilterChange(setSearch)}
            />
          </div>

          <button className="clear-all-btn" onClick={clearAllFilters}>
            🗑️ Clear All Filters
          </button>

          <div className="filter-section">
            <label className="filter-label">Relevance Score Range</label>
            <div className="range-inputs">
              <div className="range-input-group">
                <span>Min:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                  value={minScore}
                  onChange={handleFilterChange(setMinScore)}
                />
              </div>
              <div className="range-input-group">
                <span>Max:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="100"
                  value={maxScore}
                  onChange={handleFilterChange(setMaxScore)}
                />
              </div>
            </div>
          </div>

          <div className="filter-section">
            <label className="filter-label">Active Grants Range</label>
            <div className="range-inputs">
              <div className="range-input-group">
                <span>Min:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                  value={minGrants}
                  onChange={handleFilterChange(setMinGrants)}
                />
              </div>
              <div className="range-input-group">
                <span>Max:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="∞"
                  value={maxGrants}
                  onChange={handleFilterChange(setMaxGrants)}
                />
              </div>
            </div>
          </div>

          <div className="filter-section">
            <label className="filter-label">CS Requirement Keywords</label>
            <input
              type="text"
              className="filter-input"
              placeholder="e.g. Machine Learning..."
              value={reqSearch}
              onChange={handleFilterChange(setReqSearch)}
            />
          </div>

          <div className="filter-section">
            <label className="filter-checkbox">
              <input type="checkbox" checked={emailOnly} onChange={e => { setEmailOnly(e.target.checked); setPage(1) }} />
              Show Only "Good Match" Scholars
            </label>
          </div>

          <MultiSelectFilter
            label="🏛️ Department (Primary)"
            items={departments}
            selected={selectedDepts}
            onToggle={toggleDept}
            mode={deptMode}
            onModeChange={setDeptMode}
            onClear={() => { setSelectedDepts(new Set()); setSelectedSubDepts(new Set()); setPage(1) }}
          />

          <MultiSelectFilter
            label="📁 Sub-Department"
            items={availableSubDepts}
            selected={selectedSubDepts}
            onToggle={(val) => toggleSet(selectedSubDepts, setSelectedSubDepts, val)}
            mode={subDeptMode}
            onModeChange={setSubDeptMode}
            onClear={() => { setSelectedSubDepts(new Set()); setPage(1) }}
          />

          <button className="more-filters-btn" onClick={() => setShowMoreFilters(!showMoreFilters)}>
            {showMoreFilters ? '▲ Less Filters' : '▼ More Filters...'}
          </button>

          {showMoreFilters && (
            <MultiSelectFilter
              label="👔 Position / Role"
              items={positions}
              selected={selectedPositions}
              onToggle={(val) => toggleSet(selectedPositions, setSelectedPositions, val)}
              mode={posMode}
              onModeChange={setPosMode}
              onClear={() => { setSelectedPositions(new Set()); setPage(1) }}
            />
          )}
        </aside>

        <main className="results">
          {error ? (
            <div className="empty-state">
              <h3>⚠️ Connection Error</h3>
              <p>{error}</p>
            </div>
          ) : loading ? (
            <div className="empty-state">
              <h3>Loading scholars...</h3>
            </div>
          ) : scholars.length === 0 ? (
            <div className="empty-state">
              <h3>No matches found</h3>
              <p>Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="results-grid">
                {scholars.map(scholar => (
                  <ScholarCard
                    key={scholar.id}
                    data={scholar}
                    onClick={() => handleCardClick(scholar)}
                    isSaved={savedList.has(scholar.id)}
                    onToggleSave={() => toggleSaved(scholar.id)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span className="page-info">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {selected && <Modal data={selected} onClose={() => setSelected(null)} loading={modalLoading} />}
    </div>
  )
}

const MultiSelectFilter = memo(function MultiSelectFilter({ label, items, selected, onToggle, mode, onModeChange, onClear }) {
  const [expanded, setExpanded] = useState(false)
  const [filterText, setFilterText] = useState('')

  const filteredItems = useMemo(() => {
    return filterText
      ? items.filter(i => i.toLowerCase().includes(filterText.toLowerCase()))
      : items
  }, [items, filterText])

  return (
    <div className="filter-section multi-select">
      <div className="multi-header">
        <label className="filter-label">{label}</label>
        {selected.size > 0 && (
          <button className="clear-filter-btn" onClick={onClear}>
            Clear ({selected.size})
          </button>
        )}
      </div>

      <div className="mode-toggle">
        <button className={`mode-btn ${mode === 'include' ? 'active' : ''}`}
          onClick={() => onModeChange('include')}>
          ✅ Include
        </button>
        <button className={`mode-btn ${mode === 'exclude' ? 'active' : ''}`}
          onClick={() => onModeChange('exclude')}>
          ❌ Exclude
        </button>
      </div>

      <input
        type="text"
        className="filter-input filter-search"
        placeholder="Filter options..."
        value={filterText}
        onChange={e => setFilterText(e.target.value)}
      />

      <div className={`checkbox-list ${expanded ? 'expanded' : ''}`}>
        {filteredItems.slice(0, expanded ? undefined : 6).map(item => (
          <label key={item} className="checkbox-item">
            <input type="checkbox" checked={selected.has(item)} onChange={() => onToggle(item)} />
            {item}
          </label>
        ))}
      </div>

      {filteredItems.length > 6 && (
        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? '▲ Show less' : `▼ Show all (${filteredItems.length})`}
        </button>
      )}
    </div>
  )
})

const ScholarCard = memo(function ScholarCard({ data, onClick, isSaved, onToggleSave }) {
  const scoreClass = data.relevance_score >= 70 ? 'score-high' :
    data.relevance_score >= 40 ? 'score-med' : 'score-low'

  const handleAddClick = (e) => {
    e.stopPropagation()
    onToggleSave()
  }

  return (
    <div className={`scholar-card ${isSaved ? 'card-saved' : ''}`} onClick={onClick}>
      <div className="card-top">
        <div>
          <h3 className="card-name">{data.name}</h3>
          <p className="card-title">{data.title}</p>
        </div>
        <div className="card-top-right">
          <button
            className={`card-add-btn ${isSaved ? 'saved' : ''}`}
            onClick={handleAddClick}
            title={isSaved ? 'Remove from list' : 'Add to list'}
          >
            {isSaved ? '✓' : '+'}
          </button>
          <span className={`score-badge ${scoreClass}`}>{data.relevance_score}</span>
        </div>
      </div>

      <div className="card-info">
        <div className="info-item">
          <span>🏛️</span>
          <span>{data.department || 'N/A'}</span>
        </div>
        <div className="info-item">
          <span>💰</span>
          <strong>{data.active_grants_count}</strong> grants
        </div>
        <div className="info-item">
          <span>📄</span>
          <strong>{data.publications_count ?? data.publications?.length ?? 0}</strong> pubs
        </div>
      </div>

      {data.requirements && data.requirements.length > 0 && (
        <div className="card-tags">
          {data.requirements.slice(0, 2).map((r, i) => (
            <span key={i} className="tag tag-req">{r}</span>
          ))}
          {data.requirements.length > 2 && <span className="tag">+{data.requirements.length - 2}</span>}
        </div>
      )}

      {data.should_email === 'Yes' && (
        <div className="card-footer">
          <div className="good-match-badge">✓ Good Match</div>
        </div>
      )}
    </div>
  )
})

function PublicationCard({ pub }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`pub-card ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(!expanded)}>
      <div className="pub-header">
        <div className="pub-title">{pub.title}</div>
        <span className="pub-expand-icon">{expanded ? '▲' : '▼'}</span>
      </div>
      <div className="pub-meta">{pub.date}</div>
      {pub.abstract && (
        <div className={`pub-abstract ${expanded ? 'full' : ''}`}>
          {expanded ? pub.abstract : (pub.abstract.length > 150 ? pub.abstract.substring(0, 150) + '...' : pub.abstract)}
        </div>
      )}
      {expanded && !pub.abstract && (
        <div className="pub-abstract" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
          No abstract available
        </div>
      )}
    </div>
  )
}

function Modal({ data, onClose, loading }) {
  const [tab, setTab] = useState('grants')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <h2>{data.name}</h2>
            <p>{data.title} • {data.department}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {loading || data._loading ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <h3>Loading details...</h3>
            </div>
          ) : data._error ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <h3>⚠️ Failed to load details</h3>
            </div>
          ) : (
            <>
              <div className="modal-section">
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Email</label>
                    <span>{data.email || 'Not available'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Position</label>
                    <span>{data.position || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Relevance Score</label>
                    <span>{data.relevance_score}/100</span>
                  </div>
                  <div className="detail-item">
                    <label>Good Match</label>
                    <span>{data.should_email}</span>
                  </div>
                </div>
              </div>

              {data.requirements && data.requirements.length > 0 && (
                <div className="modal-section">
                  <h3>💻 Possible CS Requirements</h3>
                  <div className="card-tags">
                    {data.requirements.map((r, i) => (
                      <span key={i} className="tag tag-req">{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {data.reasoning && data.reasoning.length > 0 && (
                <div className="modal-section">
                  <h3>📝 Analysis Reasoning <span className="count">{data.reasoning.length}</span></h3>
                  <ul className="reasoning-list">
                    {data.reasoning.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="modal-section">
                <div className="tabs">
                  <button className={`tab ${tab === 'grants' ? 'active' : ''}`} onClick={() => setTab('grants')}>
                    💰 Grants ({(data.active_grants?.length || 0) + (data.expired_grants?.length || 0)})
                  </button>
                  <button className={`tab ${tab === 'pubs' ? 'active' : ''}`} onClick={() => setTab('pubs')}>
                    📄 Publications ({data.publications?.length || 0})
                  </button>
                </div>

                {tab === 'grants' && (
                  <>
                    {data.active_grants?.length > 0 && (
                      <>
                        <h3 style={{ marginBottom: '0.75rem', color: 'var(--success)' }}>
                          🟢 Active Grants <span className="count">{data.active_grants.length}</span>
                        </h3>
                        {data.active_grants.map((g, i) => (
                          <div key={i} className="grant-card">
                            <div className="grant-title">{g.title}</div>
                            <div className="grant-meta">
                              {g.funder_name && <span>🏢 {g.funder_name}</span>}
                              {g.duration && <span> • 📅 {g.duration}</span>}
                              {g.status && <span> • {g.status}</span>}
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {data.expired_grants?.length > 0 && (
                      <>
                        <h3 style={{ margin: '1rem 0 0.75rem', color: 'var(--text-muted)' }}>
                          ⚪ Expired Grants <span className="count">{data.expired_grants.length}</span>
                        </h3>
                        {data.expired_grants.map((g, i) => (
                          <div key={i} className="grant-card" style={{ opacity: 0.7 }}>
                            <div className="grant-title">{g.title}</div>
                            <div className="grant-meta">
                              {g.funder_name && <span>🏢 {g.funder_name}</span>}
                              {g.duration && <span> • 📅 {g.duration}</span>}
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {!data.active_grants?.length && !data.expired_grants?.length && (
                      <p style={{ color: 'var(--text-muted)' }}>No grants found.</p>
                    )}
                  </>
                )}

                {tab === 'pubs' && (
                  <>
                    {data.publications?.length > 0 ? (
                      data.publications.map((p, i) => (
                        <PublicationCard key={i} pub={p} />
                      ))
                    ) : (
                      <p style={{ color: 'var(--text-muted)' }}>No publications found.</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
