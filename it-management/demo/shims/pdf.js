// PDF files can't be saved from the browser preview (downloads are blocked there).
module.exports = {
  renderTablePdf(res) {
    res.status(501).json({ error: 'PDF export works in the local version (npm start). In this preview, view the report on screen or copy the CSV.' });
  },
};
