// Documents (receipts, invoices, warranty files, photos) attached to any entity.
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db/connection');
const config = require('../config');
const { requireAuth, requirePerm } = require('../lib/auth');
const { log, history } = require('../lib/activity');
const { bad, notFound, insert, upload } = require('../lib/util');

const r = express.Router();
const ENTITIES = ['asset', 'employee', 'maintenance', 'isp', 'device', 'audit'];

r.get('/', requireAuth, (req, res) => {
  const { entity_type, entity_id } = req.query;
  res.json(db.all(`SELECT d.id, d.entity_type, d.entity_id, d.doc_type, d.original_name, d.mime_type, d.size_bytes, d.created_at, u.full_name AS uploaded_by_name
                     FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.entity_type = ? AND d.entity_id = ? ORDER BY d.id DESC`, entity_type, entity_id));
});

r.post('/', requirePerm('documents.upload'), upload.single('file'), (req, res) => {
  if (!req.file) throw bad('Choose a file to upload');
  const { entity_type, doc_type } = req.body;
  const entityId = Number(req.body.entity_id);
  if (!ENTITIES.includes(entity_type) || !entityId) throw bad('Invalid document target');
  const id = insert('documents', {
    entity_type, entity_id: entityId, doc_type: doc_type || 'Other', original_name: req.file.originalname.slice(0, 200),
    stored_name: req.file.filename, mime_type: req.file.mimetype, size_bytes: req.file.size, uploaded_by: req.user.id,
  });
  if (entity_type === 'asset') history(req, entityId, 'Document', `${doc_type || 'Document'} uploaded: ${req.file.originalname}`);
  log(req, 'Document uploaded', entity_type, entityId, req.file.originalname, { type: doc_type });
  res.status(201).json({ id });
});

r.get('/:id/download', requireAuth, (req, res) => {
  const d = db.get('SELECT * FROM documents WHERE id = ?', req.params.id);
  if (!d) throw notFound('Document');
  const file = path.join(config.UPLOAD_DIR, path.basename(d.stored_name));
  if (!fs.existsSync(file)) throw notFound('File');
  const inline = req.query.inline === '1' && /^(image\/|application\/pdf)/.test(d.mime_type || '');
  res.setHeader('Content-Type', d.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${d.original_name.replace(/["\r\n]/g, '')}"`);
  fs.createReadStream(file).pipe(res);
});

r.delete('/:id', requirePerm('documents.upload'), (req, res) => {
  const d = db.get('SELECT * FROM documents WHERE id = ?', req.params.id);
  if (!d) throw notFound('Document');
  db.run('DELETE FROM documents WHERE id = ?', d.id);
  fs.rm(path.join(config.UPLOAD_DIR, path.basename(d.stored_name)), () => {});
  log(req, 'Document deleted', d.entity_type, d.entity_id, d.original_name);
  res.json({ ok: true });
});

module.exports = r;
