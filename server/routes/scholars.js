import express from 'express'
import { getDB } from '../db.js'

const router = express.Router()

// Card-level projection — only fields needed for the grid view
const CARD_PROJECTION = {
  _id: 0,
  id: 1,
  name: 1,
  title: 1,
  department: 1,
  position: 1,
  relevance_score: 1,
  should_email: 1,
  active_grants_count: 1,
  requirements: 1,
}

// GET /api/scholars — paginated, filtered list (card-level fields)
router.get('/', async (req, res) => {
  try {
    const db = getDB()
    const collection = db.collection('scholars')
    const {
      page = 1,
      search,
      minScore, maxScore,
      minGrants, maxGrants,
      reqSearch,
      emailOnly,
      depts, deptMode,
      subDepts, subDeptMode,
      positions, posMode,
    } = req.query

    const query = {}

    // Text search (name or title)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
      ]
    }

    // Relevance score range
    if (minScore || maxScore) {
      query.relevance_score = {}
      if (minScore) query.relevance_score.$gte = parseInt(minScore)
      if (maxScore) query.relevance_score.$lte = parseInt(maxScore)
    }

    // Active grants range
    if (minGrants || maxGrants) {
      query.active_grants_count = {}
      if (minGrants) query.active_grants_count.$gte = parseInt(minGrants)
      if (maxGrants) query.active_grants_count.$lte = parseInt(maxGrants)
    }

    // CS requirements keyword search
    if (reqSearch) {
      query.requirements = { $elemMatch: { $regex: reqSearch, $options: 'i' } }
    }

    // Good match only
    if (emailOnly === 'true') {
      query.should_email = 'Yes'
    }

    // Department filter (by prefix code)
    if (depts) {
      const deptList = depts.split(',')
      const deptRegexes = deptList.map(d => new RegExp(`^${d}-`, 'i'))
      if (deptMode === 'exclude') {
        query.department = { $not: { $in: deptRegexes } }
      } else {
        query.department = { $in: deptRegexes }
      }
    }

    // Sub-department filter (exact match)
    if (subDepts) {
      const subDeptList = subDepts.split(',')
      if (subDeptMode === 'exclude') {
        if (query.department) {
          if (!query.$and) query.$and = []
          query.$and.push({ department: { $nin: subDeptList } })
        } else {
          query.department = { $nin: subDeptList }
        }
      } else {
        if (query.department) {
          if (!query.$and) query.$and = []
          query.$and.push({ department: { $in: subDeptList } })
        } else {
          query.department = { $in: subDeptList }
        }
      }
    }

    // Position filter
    if (positions) {
      const posList = positions.split(',')
      if (posMode === 'exclude') {
        query.position = { $nin: posList }
      } else {
        query.position = { $in: posList }
      }
    }

    const limit = 25
    const skip = (parseInt(page) - 1) * limit

    // Use aggregation to add publications_count without returning the full array
    const pipeline = [
      { $match: query },
      { $sort: { relevance_score: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $addFields: {
                publications_count: { $size: { $ifNull: ['$publications', []] } },
              },
            },
            { $project: { ...CARD_PROJECTION, publications_count: 1 } },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]

    const [result] = await collection.aggregate(pipeline).toArray()
    const data = result.data
    const total = result.total[0]?.count || 0

    res.json({
      data,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error('Error fetching scholars:', err)
    res.status(500).json({ error: 'Failed to fetch scholars' })
  }
})

// GET /api/scholars/filters — distinct departments and positions
router.get('/filters', async (req, res) => {
  try {
    const db = getDB()
    const collection = db.collection('scholars')
    const [departments, positions] = await Promise.all([
      collection.distinct('department'),
      collection.distinct('position'),
    ])
    res.json({ departments: departments.sort(), positions: positions.sort() })
  } catch (err) {
    console.error('Error fetching filters:', err)
    res.status(500).json({ error: 'Failed to fetch filter options' })
  }
})

// POST /api/scholars/batch — full data for multiple scholars by IDs
router.post('/batch', async (req, res) => {
  try {
    const db = getDB()
    const collection = db.collection('scholars')
    const { ids } = req.body
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids array required' })
    }
    const scholars = await collection
      .find({ id: { $in: ids } }, { projection: { _id: 0 } })
      .toArray()
    res.json(scholars)
  } catch (err) {
    console.error('Error fetching batch:', err)
    res.status(500).json({ error: 'Failed to fetch scholars batch' })
  }
})

// GET /api/scholars/:id — full single scholar
router.get('/:id', async (req, res) => {
  try {
    const db = getDB()
    const collection = db.collection('scholars')
    const scholar = await collection.findOne(
      { id: req.params.id },
      { projection: { _id: 0 } }
    )
    if (!scholar) {
      return res.status(404).json({ error: 'Scholar not found' })
    }
    res.json(scholar)
  } catch (err) {
    console.error('Error fetching scholar:', err)
    res.status(500).json({ error: 'Failed to fetch scholar' })
  }
})

export default router
