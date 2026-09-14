// Local dev entry point. On Vercel, api/index.js serves the same app.
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Invoice creator running at http://localhost:${PORT}`);
});
