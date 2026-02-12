import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import { fetchScholarsBatch } from './api'


function ListPage() {
  const navigate = useNavigate()
  
  // Load saved list from localStorage
  const [savedList, setSavedList] = useState(() => {
    const saved = localStorage.getItem('savedList')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })
  
  // Full scholar data fetched from API
  const [savedItems, setSavedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch full data for saved scholars on mount and when savedList changes
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
  
  // Load copied IDs from localStorage
  const [copiedIds, setCopiedIds] = useState(() => {
    const saved = localStorage.getItem('copiedIds')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })
  
  // Load prompt copied IDs from localStorage
  const [promptCopiedIds, setPromptCopiedIds] = useState(() => {
    const saved = localStorage.getItem('promptCopiedIds')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  // Email prompt template
  const EMAIL_PROMPT = `You are drafting a concise, professional email AS me (Bhanu Prakash Reddy Gundam) to request a volunteer research or project-based position with a university professor.

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
2. Brief introduction (1–2 sentences) - who I am, my degree, graduation date from UF, and reason for reaching out (seeking an opportunity to work as a volunteer in their research or projects). 
   Example: "My name is Bhanu, a recent Computer & Information Science graduate from the University of Florida (December 2025). I am writing to inquire about potential opportunities to work as a volunteer in your research or ongoing projects, particularly in areas aligned with my academic background and technical skills."
3. Reference to 1–2 of the professor's works as examples of their research direction (1–2 sentences)
4. My academic background and relevant coursework (2 sentences - integrate coursework naturally into prose)
5. Flexible interest in contributing to any ongoing project + how I can help (2–3 sentences)
6. Polite close mentioning attached resume

Content rules:
- Select 1–2 of the professor's most relevant/recent works (grants OR publications) that align with my CS background
- When mentioning these works in the email, refer to them as "projects", "research", or "work" (NOT "grants")
- When referencing published papers: use "I found your work on [X] interesting" (you can read publications)
- When referencing ongoing projects/grants: use "I found the concept/idea behind your work on [X] interesting" or "Your work on [X] caught my attention" (you don't have access to unpublished details)
- Frame these as illustrative examples, NOT the only projects I want to join
- If there is a natural connection between their research and CS skills (Data Engineering, Data Analysis, Machine Learning, Web Development, UX Design, etc.), mention how your background could be relevant
- If the connection is unclear or forced, focus instead on your genuine interest in learning from their work and contributing in whatever capacity might be helpful
- Do NOT create artificial connections or assume they need CS assistance if it's not evident from their research
- Use learning-oriented language: "assist with", "contribute to", "support", "gain hands-on experience"
- Do NOT use: "collaborate", "collaboration", "partner", "grants"
- Do NOT ask about funding or open positions
- Do NOT phrase as "I want to work on [specific project X]"
- End with a soft ask that conveys interest in knowing about any opportunities to work as a volunteer
  Example: "I would be grateful to know if there are any opportunities for me to contribute as a volunteer..."

My fixed details (use verbatim):
- Name: Bhanu Prakash Reddy Gundam (use "Bhanu" in greeting)
- University: University of Florida (UF)
- Graduated: December 2025
- Degree: Graduate in Computer & Information Science
- Professional interest: "I have a strong foundation in data engineering for building and managing analytical data pipelines, combined with experience in machine learning, and a keen interest in developing effective web applications and user-centered UX design."
- Relevant coursework:
  CIS6930 – NLP Applications (Grade: A), CAP5771 – Introduction to Data Science (Grade: A), CIS6930 – Data Engineering (Grade: A), CEN5728 – UX Design (Grade: A-)

Here is the professor data: `

  // Sort controls
  const [sortByScore, setSortByScore] = useState(false)

  const processedItems = useMemo(() => {
    const items = [...savedItems]
    if (sortByScore) {
      items.sort((a, b) => b.relevance_score - a.relevance_score)
    }
    return items
  }, [savedItems, sortByScore])
  
  const copyToClipboard = async (item) => {
    const { requirements, reasoning, ...rest } = item
    const data = {
      ...rest,
      possible_requirements: requirements,
      reasoning: reasoning
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      // Mark as copied
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
    const fullPrompt = EMAIL_PROMPT + '\n' + JSON.stringify(data, null, 2)
    try {
      await navigator.clipboard.writeText(fullPrompt)
      // Mark as prompt copied
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
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.email || '').replace(/"/g, '""')}"`,
        `"${(item.department || '').replace(/"/g, '""')}"`,
        `"${(item.position || '').replace(/"/g, '""')}"`,
        `"${(item.title || '').replace(/"/g, '""')}"`,
        item.relevance_score || 0,
        `"${(item.should_email || '').replace(/"/g, '""')}"`,
        item.active_grants_count || 0,
        `"${JSON.stringify(item.active_grants || []).replace(/"/g, '""')}"`,
        `"${JSON.stringify(item.expired_grants || []).replace(/"/g, '""')}"`,
        `"${JSON.stringify(item.publications || []).replace(/"/g, '""')}"`,
        `"${(item.requirements || []).join('; ').replace(/"/g, '""')}"`,
        `"${(item.reasoning || []).join('; ').replace(/"/g, '""')}"`
      ]
      csvRows.push(row.join(','))
    })

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `scholars_list_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
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
    link.download = `scholars_list_${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [savedItems])

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate('/')}>
            ← Back to Search
          </button>
          <h1>📋 Saved Scholars ({savedItems.length})</h1>
        </div>
        <div className="header-right">
          <button className="clear-list-btn header-btn" onClick={clearList} disabled={savedItems.length === 0}>
            🗑️ Clear All
          </button>
          <button className="download-btn csv" onClick={downloadCSV} disabled={savedItems.length === 0}>
            📄 CSV
          </button>
          <button className="download-btn json" onClick={downloadJSON} disabled={savedItems.length === 0}>
            📦 JSON
          </button>
        </div>
      </header>
      
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
            <button className="back-link" onClick={() => navigate('/')}>
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
              </div>
            </div>
            <table className="list-table full-page">
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Score</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedItems.map(item => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <br /><small>{item.title}</small>
                  </td>
                  <td>{item.department}</td>
                  <td>{item.relevance_score}</td>
                  <td>{item.email || '-'}</td>
                  <td>
                    <div className="action-btns">
                      <button 
                        className={`copy-btn ${copiedIds.has(item.id) ? 'copied' : ''}`}
                        onClick={() => copyToClipboard(item)} 
                        title={copiedIds.has(item.id) ? 'JSON Copied!' : 'Copy JSON'}
                      >
                        {copiedIds.has(item.id) ? '✓' : '📋'}
                      </button>
                      <button 
                        className={`prompt-btn ${promptCopiedIds.has(item.id) ? 'copied' : ''}`}
                        onClick={() => copyPromptToClipboard(item)} 
                        title={promptCopiedIds.has(item.id) ? 'Prompt Copied!' : 'Copy Email Prompt'}
                      >
                        {promptCopiedIds.has(item.id) ? '✓' : '✉️'}
                      </button>
                      <button className="remove-btn" onClick={() => removeFromList(item.id)} title="Remove">✕</button>
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
