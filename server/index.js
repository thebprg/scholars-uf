import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB, closeDB } from './db.js'
import scholarsRouter from './routes/scholars.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Routes
app.use('/api/scholars', scholarsRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
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
