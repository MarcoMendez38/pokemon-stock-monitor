require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./db');
const { runMonitor } = require('./monitor');

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    const allowed = new Set([
      'http://localhost:4200',
      'http://127.0.0.1:4200',
      process.env.CORS_ORIGIN
    ].filter(Boolean));
    callback(null, !origin || allowed.has(origin));
  }
}));
app.use(express.json({ limit: '16kb' }));

function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return res.status(503).json({ error: 'ADMIN_API_KEY no está configurada' });
  if (req.get('X-API-Key') !== expected) return res.status(401).json({ error: 'API key inválida' });
  next();
}

const requestTimes = new Map();
function monitorRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const previous = requestTimes.get(key) || 0;
  if (now - previous < 30_000) return res.status(429).json({ error: 'Espera 30 segundos antes de volver a monitorear' });
  requestTimes.set(key, now);
  next();
}

app.get('/api/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));
app.get('/api/products', async (_req, res) => {
  const products = await db.listProducts();
  res.json(products.map(product => ({ ...product, id: product._id, price_dropped: Number(product.price != null && product.previous_price != null && product.price < product.previous_price) })));
});
app.get('/api/products/:id/history', async (req, res) => {
  const history = await db.listHistory(req.params.id);
  res.json(history);
});
app.patch('/api/products/:id/stock', requireAdminKey, async (req, res) => {
  const stock = Number(req.body.stock);
  if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'stock debe ser un entero no negativo' });
  const product = await db.updateStock(req.params.id, stock);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ...product, id: product._id });
});
app.post('/api/monitor/run', requireAdminKey, monitorRateLimit, async (_req, res) => {
  try {
    res.json(await runMonitor());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

const clientPath = path.resolve(__dirname, '../../client/dist/client/browser');
app.use(express.static(clientPath));
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientPath, 'index.html'), (error) => error && next());
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Monitor Pokémon escuchando en http://localhost:${port}`));
const minutes = Number(process.env.MONITOR_INTERVAL_MINUTES || 15);
let monitorRunning = false;
async function scheduledMonitor() {
  if (monitorRunning) return console.warn('Monitoreo omitido: todavía hay una ejecución en curso');
  monitorRunning = true;
  try { await runMonitor(); } catch (error) { console.error('Error de monitoreo:', error.message); }
  finally { monitorRunning = false; }
}
cron.schedule(`*/${Math.max(1, minutes)} * * * *`, scheduledMonitor);
runMonitor()
  .then(result => console.log(`Sincronización inicial: ${result.scanned} productos Pokémon`))
  .catch(error => console.error('Error en sincronización inicial:', error.message));
