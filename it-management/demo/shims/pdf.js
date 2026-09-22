// PDF files can't be saved from the browser preview (downloads are blocked there).
const unavailable = (res) => res.status(501).json({ error: 'PDF export works in the local version (npm start). In this preview, you can see the reports and labels on screen.' });
module.exports = { renderTablePdf: unavailable, renderLabelsPdf: unavailable };
