// Uploaded files live in a table inside the demo database instead of on disk.
const store = () => require('./connection');
const name = (p) => String(p).split('/').pop();

module.exports = {
  mkdirSync() {},
  rmSync() {},
  existsSync: (p) => !!store().get('SELECT 1 AS x FROM _demo_files WHERE name = ?', name(p)),
  rm: (p, cb) => { store().run('DELETE FROM _demo_files WHERE name = ?', name(p)); if (cb) cb(); },
  createReadStream: (p) => ({
    pipe(res) {
      const f = store().get('SELECT mime, data FROM _demo_files WHERE name = ?', name(p));
      res.send(f ? f.data : new Uint8Array());
    },
  }),
  readFileSync() { throw new Error('fs.readFileSync is not available in the browser demo'); },
  writeFileSync() {},
  saveFile: (fileName, mime, bytes) => store().run('INSERT OR REPLACE INTO _demo_files (name, mime, data) VALUES (?, ?, ?)', fileName, mime, bytes),
  readFile: (fileName) => store().get('SELECT mime, data FROM _demo_files WHERE name = ?', name(fileName)),
};
