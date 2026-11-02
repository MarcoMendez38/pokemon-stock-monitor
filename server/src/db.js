const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const configuredPath = path.resolve(process.env.DATABASE_PATH || './data/monitor.db');
let databasePath = configuredPath;
try {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
} catch (error) {
  if (!['EACCES', 'EROFS', 'EPERM'].includes(error.code)) throw error;
  databasePath = path.resolve('/tmp/pokemon-monitor/monitor.db');
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  console.warn(`No se puede escribir en ${configuredPath}; usando almacenamiento temporal en ${databasePath}`);
}
const historyPath = `${databasePath}.history`;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return fallback;
  }
}
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

let products = readJson(databasePath, []);
let history = readJson(historyPath, []);
if (!Array.isArray(products)) products = [];
if (!Array.isArray(history)) history = [];

function persist() {
  writeJson(databasePath, products);
}
function listProducts() {
  return Promise.resolve([...products].sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name)));
}
function findProduct(externalId) {
  return Promise.resolve(products.find(product => product.external_id === externalId) || null);
}
async function upsertProduct(product) {
  const before = await findProduct(product.externalId);
  const current = {
    ...(before || { _id: crypto.randomUUID(), available_stock: null, reserved_stock: 0 }),
    external_id: product.externalId,
    variant_id: product.variantId,
    name: product.name,
    url: product.url,
    image_url: product.imageUrl,
    previous_price: before ? before.price : null,
    price: product.price,
    available: product.available,
    available_stock: product.availableStock ?? before?.available_stock ?? null,
    cart_url: product.cartUrl,
    last_seen_at: product.now,
    updated_at: product.now
  };
  if (before) products = products.map(item => item._id === before._id ? current : item);
  else products.push(current);
  persist();
  return { before, current };
}
function addHistory(productId, price, available, capturedAt) {
  history.push({ product_id: productId, price, available, captured_at: capturedAt });
  writeJson(historyPath, history);
  return Promise.resolve();
}
async function updateStock(id, stock) {
  const product = products.find(item => item._id === id);
  if (!product) return null;
  product.available_stock = stock;
  product.updated_at = new Date().toISOString();
  persist();
  return product;
}
async function reserveStock(id, amount) {
  const product = products.find(item => item._id === id);
  if (!product) return null;
  product.reserved_stock += amount;
  persist();
  return product;
}

module.exports = { listProducts, upsertProduct, addHistory, updateStock, reserveStock };
