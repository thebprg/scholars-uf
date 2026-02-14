'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { fetchScholars, fetchScholarDetail, fetchFilterOptions } from '@/lib/api'
import ScholarCard from '@/components/ScholarCard'
import MultiSelectFilter from '@/components/MultiSelectFilter'

// Lazy-load Modal — only downloaded when user clicks a scholar card
const Modal = dynamic(() => import('@/components/Modal'), { ssr: false })

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

  // Filters — initialized with server-safe defaults
  const [search, setSearch] = useState('')
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [minGrants, setMinGrants] = useState('')
  const [maxGrants, setMaxGrants] = useState('')
  const [reqSearch, setReqSearch] = useState('')
  const [emailOnly, setEmailOnly] = useState(false)

  // Department filters
  const [selectedDepts, setSelectedDepts] = useState(new Set())
  const [deptMode, setDeptMode] = useState('include')
  const [selectedSubDepts, setSelectedSubDepts] = useState(new Set())
  const [subDeptMode, setSubDeptMode] = useState('include')

  // Position filter
  const [selectedPositions, setSelectedPositions] = useState(new Set())
  const [posMode, setPosMode] = useState('include')

  // Saved list — initialized empty to avoid hydration mismatch
  const [savedList, setSavedList] = useState(new Set())

  // Guard: don't persist until hydration is complete.
  // MUST be useState (not useRef) so persistence effects only run
  // in the NEXT render cycle when state actually holds hydrated values.
  const [hasHydrated, setHasHydrated] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [disclaimerCountdown, setDisclaimerCountdown] = useState(5)

  // Hydrate all localStorage state after mount (client-only)
  useEffect(() => {
    // Hydrate filters
    const saved = localStorage.getItem('filters')
    if (saved) {
      const f = JSON.parse(saved)
      if (f.search) setSearch(f.search)
      if (f.minScore) setMinScore(f.minScore)
      if (f.maxScore) setMaxScore(f.maxScore)
      if (f.minGrants) setMinGrants(f.minGrants)
      if (f.maxGrants) setMaxGrants(f.maxGrants)
      if (f.reqSearch) setReqSearch(f.reqSearch)
      if (f.emailOnly) setEmailOnly(f.emailOnly)
      if (f.selectedDepts?.length) setSelectedDepts(new Set(f.selectedDepts))
      if (f.deptMode) setDeptMode(f.deptMode)
      if (f.selectedSubDepts?.length) setSelectedSubDepts(new Set(f.selectedSubDepts))
      if (f.subDeptMode) setSubDeptMode(f.subDeptMode)
      if (f.selectedPositions?.length) setSelectedPositions(new Set(f.selectedPositions))
      if (f.posMode) setPosMode(f.posMode)
    }

    // Hydrate saved list
    const sl = localStorage.getItem('savedList')
    if (sl) setSavedList(new Set(JSON.parse(sl)))

    // Show disclaimer on first visit
    if (!localStorage.getItem('disclaimerAccepted')) {
      setShowDisclaimer(true)
    }

    // Triggers a new render — persistence effects will see hydrated values
    setHasHydrated(true)
  }, [])

  // Disclaimer countdown timer — disables accept button for 5 seconds
  useEffect(() => {
    if (!showDisclaimer || disclaimerCountdown <= 0) return
    const timer = setTimeout(() => setDisclaimerCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [showDisclaimer, disclaimerCountdown])

  // Debounced localStorage persistence for filters (only after hydration render)
  const filterPersistRef = useRef(null)
  useEffect(() => {
    if (!hasHydrated) return
    if (filterPersistRef.current) clearTimeout(filterPersistRef.current)
    filterPersistRef.current = setTimeout(() => {
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
    }, 500)
    return () => {
      if (filterPersistRef.current) clearTimeout(filterPersistRef.current)
    }
  }, [hasHydrated, search, minScore, maxScore, minGrants, maxGrants, reqSearch, emailOnly,
      selectedDepts, deptMode, selectedSubDepts, subDeptMode, selectedPositions, posMode])

  // UI state
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const router = useRouter()



  // Persist savedList to localStorage (only after hydration render)
  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem('savedList', JSON.stringify([...savedList]))
  }, [savedList, hasHydrated])

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

  // Reset entire app — inline two-click confirmation (no browser popup)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const resetTimerRef = useRef(null)

  const resetApp = useCallback(() => {
    if (!confirmingReset) {
      // First click — enter confirm mode for 3 seconds
      setConfirmingReset(true)
      resetTimerRef.current = setTimeout(() => setConfirmingReset(false), 3000)
      return
    }
    // Second click — actually reset
    clearTimeout(resetTimerRef.current)
    localStorage.clear()
    window.location.reload()
  }, [confirmingReset])

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
        <div className="header-left">
          <h1>Gator Scholars</h1>
          <div className="header-stats">
            {loading ? 'Loading...' : (
              <>Showing <strong>{scholars.length}</strong> of {totalResults} matches</>
            )}
          </div>
          <button
            className="mobile-filter-toggle"
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
          >
            {showMobileSidebar ? '✕' : 'Filters'}
          </button>
        </div>

        <div className="header-right">
          <button className="list-badge" onClick={() => router.push('/list')}>
            📋 View List {savedList.size > 0 && <span className="list-count">{savedList.size}</span>}
          </button>
          <button
            className={`reset-btn${confirmingReset ? ' confirming' : ''}`}
            onClick={resetApp}
            title={confirmingReset ? 'Click again to confirm reset' : 'Reset App Data'}
          >
            {confirmingReset ? 'Sure? ↻' : '↻'}
          </button>
        </div>
      </header>

      <div className="main">
        <aside className={`sidebar ${showMobileSidebar ? 'open' : ''}`}>
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

      {showDisclaimer && (
        <div className="disclaimer-overlay">
          <div className="disclaimer-modal">
            <div className="disclaimer-header">
              <div className="disclaimer-icon">🐊</div>
              <h2>Gator Scholars</h2>
              <p className="disclaimer-subtitle">Research Discovery &amp; Collaboration Tool</p>
            </div>

            <div className="disclaimer-body">
              <p>
                Gator Scholars helps you browse faculty research profiles at the University
                of Florida — including publications, grants, and areas of expertise — to
                identify professors whose work aligns with your academic interests for
                potential research collaboration.
              </p>

              <div className="disclaimer-warning">
                <div className="disclaimer-warning-header">
                  <span className="disclaimer-warning-icon">⚠</span>
                  <strong>Responsible Use Policy</strong>
                </div>
                <ul>
                  <li>Do not use this tool to spam or harass faculty members.</li>
                  <li>All outreach must be professional, relevant, and respectful of professors' time.</li>
                  <li>This platform is intended solely for genuine academic and research purposes.</li>
                </ul>
              </div>
            </div>

            <div className="disclaimer-footer">
              <button
                className={`disclaimer-accept-btn${disclaimerCountdown > 0 ? ' disabled' : ''}`}
                disabled={disclaimerCountdown > 0}
                onClick={() => { setShowDisclaimer(false); localStorage.setItem('disclaimerAccepted', 'true') }}
              >
                {disclaimerCountdown > 0 ? `Please read (${disclaimerCountdown}s)` : 'I Agree & Continue'}
              </button>
              <p className="disclaimer-credit">
                View Code & Pipeline on{' '}
                <a href="https://github.com/thebprg/pros-uf" target="_blank" rel="noopener noreferrer">
                  GitHub
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
