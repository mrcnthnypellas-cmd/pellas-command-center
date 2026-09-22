// Asset tag numbering: <PREFIX>-<zero padded number>, e.g. LAP-0001.
const db = require('../db/connection');
const { setting } = require('./util');

function nextTag(categoryId) {
  const cat = db.get('SELECT prefix FROM asset_categories WHERE id = ?', categoryId);
  if (!cat) return null;
  const pad = Number(setting('tag_padding', 4));
  const sep = setting('tag_separator', '-');
  const rows = db.all('SELECT asset_tag FROM assets WHERE asset_tag LIKE ?', `${cat.prefix}${sep}%`);
  let max = 0;
  for (const { asset_tag } of rows) {
    const n = Number(asset_tag.slice(cat.prefix.length + sep.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${cat.prefix}${sep}${String(max + 1).padStart(pad, '0')}`;
}

module.exports = { nextTag };
