// Turns low-level errors into messages people can act on (used by the server and the phone app).
function describeError(err) {
  const msg = String((err && err.message) || '');
  if (err && err.status) return { status: err.status, message: msg };
  if ((err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') || /FOREIGN KEY constraint failed/i.test(msg)) {
    return { status: 400, message: 'One of the chosen items (for example a location, department, employee or device) no longer exists. Reload the page (F5) and choose again.' };
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') return { status: 400, message: null }; // caller adds the size limit
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') return { status: 400, message: 'The form sent a file this action does not accept.' };
  return { status: 500, message: null };
}
module.exports = { describeError };
