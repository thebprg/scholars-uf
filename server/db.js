import { MongoClient } from 'mongodb'

let client = null
let db = null

export async function connectDB() {
  if (db) return db
  client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  db = client.db('ufl_scholars_db')
  console.log('Connected to MongoDB Atlas')
  return db
}

export function getDB() {
  if (!db) throw new Error('Database not connected. Call connectDB() first.')
  return db
}

export async function closeDB() {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}
