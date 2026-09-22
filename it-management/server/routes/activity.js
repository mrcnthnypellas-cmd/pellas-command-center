const express = require('express');
const db = require('../db/connection');
const { requirePerm } = require('../lib/auth');

const r = express.Router();

r.get('/', requirePerm('activity.view'), (req, res) => {
  const where = [];
  const p = [];
  const q = req.query;
  if (q.q) { where.push('(action LIKE ? OR entity_label LIKE ? OR user_name LIKE ? OR details LIKE ?)'); for (let i = 0; i < 4; i++) p.push(`%${q.q}%`); }
  if (q.entity_type) { where.push('entity_type = ?'); p.push(q.entity_type); }
  if (q.user_id) { where.push('user_id = ?'); p.push(q.user_id); }
  if (q.from) { where.push("created_at >= ?"); p.push(`${q.from} 00:00:00`); }
  if (q.to) { where.push("created_at <= ?"); p.push(`${q.to} 23:59:59`); }
  if (q.security === '1') where.push("(entity_type IN ('credential','wifi','user','role') OR action LIKE 'Signed in')");
  const limit = Math.min(Number(q.limit || 300), 2000);
  res.json(db.all(`SELECT * FROM activity_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${limit}`, ...p));
});

module.exports = r;
