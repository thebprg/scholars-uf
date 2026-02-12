import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectDB, closeDB } from './db.js'
import scholarsRouter from './routes/scholars.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// API Routes
app.use('/api/scholars', scholarsRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// In production, serve the Vite build from dist/
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

// SPA fallback — serve index.html for all non-API routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// Start server
async function start() {
  try {
    await connectDB()
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await closeDB()
  process.exit(0)
})

start()
