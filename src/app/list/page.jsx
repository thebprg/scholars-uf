'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchScholarsBatch } from '@/lib/api'

// Default prompt template — placeholders get replaced with user's data
const DEFAULT_PROMPT_TEMPLATE = `You are drafting a concise, professional email AS me ({{NAME}}) to request a volunteer research or project-based position with a university professor.

Input:
1. Professor metadata (JSON format - see expected fields below)
2. My fixed academic background (below)

Expected JSON fields:
- name, department, research_tags, grants (array), publications (array)

Output format:
- Provide ONLY the email subject line and body (no commentary)

Email requirements:
- Length: 180–200 words
- Tone: Respectful, professional, learning-oriented
- Assume the professor is very busy and may skim
- No bullet points in the email body

Email structure (strictly follow):
1. Subject line that is professional and indicates purpose, but remains broad enough not to limit to one specific project
   - "Volunteer Position Inquiry – Computer Science Graduate"
   Do NOT mention specific projects/grants in the subject line
2. Brief introduction (1–2 sentences) - who I am, my degree, graduation date from {{UNIVERSITY}}, and reason for reaching out (seeking an opportunity to work as a volunteer in their research or projects).
   Example: "My name is {{SHORT_NAME}}, a recent {{DEGREE}} graduate from the {{UNIVERSITY}} ({{GRADUATION_DATE}}). I am writing to inquire about potential opportunities to work as a volunteer in your research or ongoing projects, particularly in areas aligned with my academic background and technical skills."
3. Reference to 1–2 of the professor's works as examples of their research direction (1–2 sentences)
4. My academic background and relevant coursework (2 sentences - integrate coursework naturally into prose)
5. Flexible interest in contributing to any ongoing project + how I can help (2–3 sentences)
6. Polite close mentioning attached resume

Content rules:
- Select 1–2 of the professor's most relevant/recent works (grants OR publications) that align with my background
- When mentioning these works in the email, refer to them as "projects", "research", or "work" (NOT "grants")
- When referencing published papers: use "I found your work on [X] interesting" (you can read publications)
- When referencing ongoing projects/grants: use "I found the concept/idea behind your work on [X] interesting" or "Your work on [X] caught my attention" (you don't have access to unpublished details)
- Frame these as illustrative examples, NOT the only projects I want to join
- If there is a natural connection between their research and CS skills, mention how your background could be relevant
- If the connection is unclear or forced, focus instead on your genuine interest in learning from their work and contributing in whatever capacity might be helpful
- Do NOT create artificial connections or assume they need CS assistance if it's not evident from their research
- Use learning-oriented language: "assist with", "contribute to", "support", "gain hands-on experience"
- Do NOT use: "collaborate", "collaboration", "partner", "grants"
- Do NOT ask about funding or open positions
- Do NOT phrase as "I want to work on [specific project X]"
- End with a soft ask that conveys interest in knowing about any opportunities to work as a volunteer
  Example: "I would be grateful to know if there are any opportunities for me to contribute as a volunteer..."

My fixed details (use verbatim):
- Name: {{NAME}} (use "{{SHORT_NAME}}" in greeting)
- University: {{UNIVERSITY}}
- Graduated: {{GRADUATION_DATE}}
- Degree: {{DEGREE}}
- Professional interest: "{{PROFESSIONAL_INTEREST}}"
- Relevant coursework:
{{COURSEWORK}}

Here is the professor data:
`

// Default user profile values
const DEFAULT_PROFILE = {
  fullName: '',
  shortName: '',
  university: '',
  graduationDate: '',
  degree: '',
  professionalInterest: '',
  coursework: '',
}

function buildPromptFromTemplate(template, profile) {
  return template
    .replace(/\{\{NAME\}\}/g, profile.fullName || '[Your Full Name]')
    .replace(/\{\{SHORT_NAME\}\}/g, profile.shortName || '[Your Name]')
    .replace(/\{\{UNIVERSITY\}\}/g, profile.university || '[Your University]')
    .replace(/\{\{GRADUATION_DATE\}\}/g, profile.graduationDate || '[Graduation Date]')
    .replace(/\{\{DEGREE\}\}/g, profile.degree || '[Your Degree]')
    .replace(/\{\{PROFESSIONAL_INTEREST\}\}/g, profile.professionalInterest || '[Your professional interests]')
    .replace(/\{\{COURSEWORK\}\}/g, profile.coursework || '[Your relevant coursework]')
}

function ListPage() {
  const router = useRouter()

  // Initialize all state with server-safe defaults to avoid hydration mismatch
  const [savedList, setSavedList] = useState(new Set())
  const [savedItems, setSavedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copiedIds, setCopiedIds] = useState(new Set())
  const [promptCopiedIds, setPromptCopiedIds] = useState(new Set())
  const [showPromptSettings, setShowPromptSettings] = useState(false)
  const [promptMode, setPromptMode] = useState('template')
  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const [customPrompt, setCustomPrompt] = useState('')
  const [mailedIds, setMailedIds] = useState(new Set())
  const [hideMailed, setHideMailed] = useState(false)

  // Guard: don't persist until hydration is complete.
  // MUST be useState (not useRef) so persistence effects only run
  // in the NEXT render cycle when state actually holds hydrated values.
  const [hasHydrated, setHasHydrated] = useState(false)

  // Hydrate from localStorage after mount (client-only)
  useEffect(() => {
    const saved = localStorage.getItem('savedList')
    if (saved) setSavedList(new Set(JSON.parse(saved)))

    const ci = localStorage.getItem('copiedIds')
    if (ci) setCopiedIds(new Set(JSON.parse(ci)))

    const pci = localStorage.getItem('promptCopiedIds')
    if (pci) setPromptCopiedIds(new Set(JSON.parse(pci)))

    const pm = localStorage.getItem('promptMode')
    if (pm) setPromptMode(pm)

    const up = localStorage.getItem('userProfile')
    if (up) setProfile(prev => ({ ...prev, ...JSON.parse(up) }))

    const cp = localStorage.getItem('customPrompt')
    if (cp) setCustomPrompt(cp)

    const mi = localStorage.getItem('mailedIds')
    if (mi) setMailedIds(new Set(JSON.parse(mi)))

    // Triggers a new render — persistence effects will see hydrated values
    setHasHydrated(true)
  }, [])

  // Fetch full data for saved scholars when savedList changes
  useEffect(() => {
    const ids = [...savedList]
    if (ids.length === 0) {
      setSavedItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    fetchScholarsBatch(ids)
      .then(data => {
        setSavedItems(data)
      })
      .catch(err => {
        console.error('Failed to fetch saved scholars:', err)
        setError('Failed to load saved scholars. Is the server running?')
      })
      .finally(() => setLoading(false))
  }, [savedList])

  // Persist prompt settings (only after hydration render)
  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem('promptMode', promptMode)
  }, [promptMode, hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem('userProfile', JSON.stringify(profile))
  }, [profile, hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem('customPrompt', customPrompt)
  }, [customPrompt, hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem('mailedIds', JSON.stringify([...mailedIds]))
  }, [mailedIds, hasHydrated])

  // Build the final prompt text (without scholar data — that gets appended per scholar)
  const builtPrompt = useMemo(() => {
    if (promptMode === 'custom') {
      return customPrompt || '[No custom prompt set — click ⚙️ Prompt Settings to configure]'
    }
    return buildPromptFromTemplate(DEFAULT_PROMPT_TEMPLATE, profile)
  }, [promptMode, profile, customPrompt])

  const updateProfile = useCallback((field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }))
  }, [])

  // Sort & filter controls
  const [sortByScore, setSortByScore] = useState(false)

  const toggleMailed = useCallback((id) => {
    setMailedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }, [])

  const processedItems = useMemo(() => {
    let items = [...savedItems]
    if (hideMailed) {
      items = items.filter(item => !mailedIds.has(item.id))
    }
    if (sortByScore) {
      items.sort((a, b) => b.relevance_score - a.relevance_score)
    }
    return items
  }, [savedItems, sortByScore, hideMailed, mailedIds])

  // Fallback for mobile over HTTP where navigator.clipboard is unavailable
  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }

  const copyToClipboard = async (item) => {
    const { requirements, reasoning, ...rest } = item
    const data = {
      ...rest,
      possible_requirements: requirements,
      reasoning: reasoning
    }
    const text = JSON.stringify(data, null, 2)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        fallbackCopy(text)
      }
      setCopiedIds(prev => {
        const newSet = new Set(prev)
        newSet.add(item.id)
        localStorage.setItem('copiedIds', JSON.stringify([...newSet]))
        return newSet
      })
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const copyPromptToClipboard = async (item) => {
    const { requirements, reasoning, ...rest } = item
    const data = {
      ...rest,
      possible_requirements: requirements,
      reasoning: reasoning
    }
    const fullPrompt = builtPrompt + '\n' + JSON.stringify(data, null, 2)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullPrompt)
      } else {
        fallbackCopy(fullPrompt)
      }
      setPromptCopiedIds(prev => {
        const newSet = new Set(prev)
        newSet.add(item.id)
        localStorage.setItem('promptCopiedIds', JSON.stringify([...newSet]))
        return newSet
      })
    } catch (err) {
      console.error('Failed to copy prompt:', err)
    }
  }

  const removeFromList = useCallback((id) => {
    setSavedList(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      localStorage.setItem('savedList', JSON.stringify([...newSet]))
      return newSet
    })
  }, [])

  const clearList = useCallback(() => {
    setSavedList(new Set())
    localStorage.setItem('savedList', JSON.stringify([]))
  }, [])

  const escCSV = (val) => '"' + String(val || '').replace(/"/g, '""') + '"'

  const downloadCSV = useCallback(() => {
    if (savedItems.length === 0) return

    const headers = [
      'name', 'email', 'department', 'position', 'title',
      'relevance_score', 'should_email', 'active_grants_count',
      'active_grants_json', 'expired_grants_json', 'publications_json',
      'possible_requirements', 'reasoning'
    ]

    const csvRows = [headers.join(',')]
    savedItems.forEach(item => {
      const row = [
        escCSV(item.name),
        escCSV(item.email),
        escCSV(item.department),
        escCSV(item.position),
        escCSV(item.title),
        item.relevance_score || 0,
        escCSV(item.should_email),
        item.active_grants_count || 0,
        escCSV(JSON.stringify(item.active_grants || [])),
        escCSV(JSON.stringify(item.expired_grants || [])),
        escCSV(JSON.stringify(item.publications || [])),
        escCSV((item.requirements || []).join('; ')),
        escCSV((item.reasoning || []).join('; '))
      ]
      csvRows.push(row.join(','))
    })

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'scholars_list_' + new Date().toISOString().split('T')[0] + '.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [savedItems])

  const downloadJSON = useCallback(() => {
    if (savedItems.length === 0) return

    const transformedItems = savedItems.map(item => {
      const { requirements, reasoning, ...rest } = item
      return {
        ...rest,
        possible_requirements: requirements,
        reasoning: reasoning
      }
    })

    const jsonContent = JSON.stringify(transformedItems, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'scholars_list_' + new Date().toISOString().split('T')[0] + '.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [savedItems])

  // Check if profile has any data filled in
  const hasProfileData = Object.values(profile).some(v => v.trim() !== '')

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <button className="back-btn" onClick={() => router.push('/')}>
            ← Back to Search
          </button>
          <h1>📋 Saved Scholars ({savedItems.length})</h1>
        </div>
        <div className="header-right">
          <button
            className={'prompt-settings-toggle header-btn ' + (showPromptSettings ? 'active' : '')}
            onClick={() => setShowPromptSettings(!showPromptSettings)}
            title="Configure Email Prompt"
          >
            ⚙️ Prompt Settings
          </button>
          <button className="clear-list-btn header-btn" onClick={clearList} disabled={savedItems.length === 0}>
            Clear All
          </button>
          <button className="download-btn csv" onClick={downloadCSV} disabled={savedItems.length === 0}>
            CSV
          </button>
          <button className="download-btn json" onClick={downloadJSON} disabled={savedItems.length === 0}>
            JSON
          </button>
        </div>
      </header>

      {/* ── Prompt Settings Panel ── */}
      {showPromptSettings && (
        <div className="prompt-settings-panel">
          <div className="prompt-settings-header">
            <h2>⚙️ Email Prompt Configuration</h2>
            <p className="prompt-settings-desc">
              Configure how the email prompt is generated when you click ✉️ on a scholar. 
              The scholar&apos;s profile JSON is automatically appended at the end.
            </p>
          </div>

          <div className="prompt-mode-tabs">
            <button
              className={'prompt-mode-tab ' + (promptMode === 'template' ? 'active' : '')}
              onClick={() => setPromptMode('template')}
            >
              📝 Use Template
            </button>
            <button
              className={'prompt-mode-tab ' + (promptMode === 'custom' ? 'active' : '')}
              onClick={() => setPromptMode('custom')}
            >
              ✏️ Custom Prompt
            </button>
          </div>

          {promptMode === 'template' ? (
            <div className="prompt-template-form">
              <p className="form-hint">
                Fill in your details below. These will be inserted into the email prompt template.
                {!hasProfileData && <span className="form-warning"> ⚠️ No data filled in yet — prompts will use placeholder text.</span>}
              </p>
              <div className="form-grid">
                <div className="form-field">
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Bhanu Prakash Reddy Gundam"
                    value={profile.fullName}
                    onChange={e => updateProfile('fullName', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Short Name (used in email greeting)</label>
                  <input
                    type="text"
                    placeholder="e.g. Bhanu"
                    value={profile.shortName}
                    onChange={e => updateProfile('shortName', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>University</label>
                  <input
                    type="text"
                    placeholder="e.g. University of Florida (UF)"
                    value={profile.university}
                    onChange={e => updateProfile('university', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Graduation Date</label>
                  <input
                    type="text"
                    placeholder="e.g. December 2025"
                    value={profile.graduationDate}
                    onChange={e => updateProfile('graduationDate', e.target.value)}
                  />
                </div>
                <div className="form-field full-width">
                  <label>Degree</label>
                  <input
                    type="text"
                    placeholder="e.g. Graduate in Computer & Information Science"
                    value={profile.degree}
                    onChange={e => updateProfile('degree', e.target.value)}
                  />
                </div>
                <div className="form-field full-width">
                  <label>Professional Interest</label>
                  <textarea
                    placeholder="e.g. I have a strong foundation in data engineering for building and managing analytical data pipelines, combined with experience in machine learning..."
                    value={profile.professionalInterest}
                    onChange={e => updateProfile('professionalInterest', e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="form-field full-width">
                  <label>Relevant Coursework</label>
                  <textarea
                    placeholder="e.g. CIS6930 – NLP Applications (Grade: A), CAP5771 – Introduction to Data Science (Grade: A)..."
                    value={profile.coursework}
                    onChange={e => updateProfile('coursework', e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="prompt-custom-form">
              <p className="form-hint">
                Write your complete custom prompt below. The scholar&apos;s JSON profile data will be appended at the end automatically.
              </p>
              <textarea
                className="custom-prompt-textarea"
                placeholder="Write your custom email prompt here..."
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                rows={12}
              />
            </div>
          )}

          {/* Preview */}
          <div className="prompt-preview">
            <div className="prompt-preview-header">
              <h3>📄 Prompt Preview</h3>
              <span className="preview-note">(Scholar JSON will be appended when copying)</span>
            </div>
            <pre className="prompt-preview-text">{builtPrompt}</pre>
          </div>
        </div>
      )}

      <main className="list-page-content">
        {loading ? (
          <div className="empty-state">
            <h3>Loading saved scholars...</h3>
          </div>
        ) : error ? (
          <div className="empty-state">
            <h3>⚠️ Connection Error</h3>
            <p>{error}</p>
          </div>
        ) : savedItems.length === 0 ? (
          <div className="empty-state">
            <h3>Your list is empty</h3>
            <p>Add scholars using the + button on their cards</p>
            <button className="back-link" onClick={() => router.push('/')}>
              ← Go back to search
            </button>
          </div>
        ) : (
          <>
            <div className="list-controls">
              <div className="control-group">
                <label>
                  <input
                    type="checkbox"
                    checked={sortByScore}
                    onChange={e => setSortByScore(e.target.checked)}
                  />
                  Sort by Relevance Score
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={hideMailed}
                    onChange={e => setHideMailed(e.target.checked)}
                  />
                  Hide Mailed ({mailedIds.size})
                </label>
              </div>
            </div>
            <table className="list-table full-page">
            <thead>
              <tr>
                <th>Mailed</th>
                <th>Name</th>
                <th>Department</th>
                <th>Score</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedItems.map(item => (
                <tr key={item.id} className={mailedIds.has(item.id) ? 'row-mailed' : ''}>
                  <td data-label="Mailed">
                    <input
                      type="checkbox"
                      className="mailed-checkbox"
                      checked={mailedIds.has(item.id)}
                      onChange={() => toggleMailed(item.id)}
                      title={mailedIds.has(item.id) ? 'Mark as not mailed' : 'Mark as mailed'}
                    />
                  </td>
                  <td data-label="Name">
                    {item.name}
                    <br /><small>{item.title}</small>
                  </td>
                  <td data-label="Department">{item.department}</td>
                  <td data-label="Score">{item.relevance_score}</td>
                  <td data-label="Email">{item.email || '-'}</td>
                  <td data-label="Actions">
                    <div className="action-btns">
                      <button
                        className={'copy-btn ' + (copiedIds.has(item.id) ? 'copied' : '')}
                        onClick={() => copyToClipboard(item)}
                        title={copiedIds.has(item.id) ? 'JSON Copied!' : 'Copy JSON'}
                      >
                        {copiedIds.has(item.id) ? 'copied' : 'copy data'}
                      </button>
                      <button
                        className={'prompt-btn ' + (promptCopiedIds.has(item.id) ? 'copied' : '')}
                        onClick={() => copyPromptToClipboard(item)}
                        title={promptCopiedIds.has(item.id) ? 'Prompt Copied!' : 'Copy Email Prompt'}
                      >
                        {promptCopiedIds.has(item.id) ? 'copied' : 'copy prompt'}
                      </button>
                      <button className="remove-btn" onClick={() => removeFromList(item.id)} title="Remove">remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </main>
    </div>
  )
}

export default ListPage
