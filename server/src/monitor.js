const cheerio = require('cheerio');
const db = require('./db');
const { sendWhatsApp } = require('./whatsapp');
const { sendEmail } = require('./email');

const MONITOR_URL = process.env.MONITOR_URL || 'https://bigbang.cl/collections/pokemon-tcg/products.json?limit=250';

function parsePrice(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function parseProducts(html) {
  if (typeof html === 'object' && Array.isArray(html.products)) {
    return html.products.map(product => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const available = variants.some(variant => variant.available);
      const variant = variants.find(item => item.available) || variants[0];
      const prices = variants.map(variant => Number(variant.price)).filter(Number.isFinite);
      return {
        externalId: String(product.id),
        variantId: variant?.id ? String(variant.id) : null,
        name: product.title,
        url: new URL(`/products/${product.handle}`, MONITOR_URL).toString(),
        imageUrl: product.images?.[0]?.src || null,
        price: prices.length ? Math.min(...prices) : null,
        available,
        availableStock: null,
        cartUrl: variant?.id ? new URL(`/cart/${variant.id}:1`, MONITOR_URL).toString() : null
      };
    }).filter(product => product.name);
  }
  const $ = cheerio.load(html);
  const products = [];
  $('.product, li.product, .product-card, article').each((_, element) => {
    const node = $(element);
    const name = node.find('.woocommerce-loop-product__title, .product-title, h2, h3').first().text().trim();
    const url = node.find('a').first().attr('href');
    const price = parsePrice(node.find('.price, .amount, .product-price').first().text());
    const imageUrl = node.find('img').first().attr('src') || node.find('img').first().attr('data-src') || null;
    const text = node.text().toLowerCase();
    const available = !/(agotado|sin stock|out of stock|sold out)/i.test(text);
    if (name && url && /pokemon/i.test(`${name} ${url}`)) {
      products.push({ externalId: url, name, url, imageUrl, price, available });
    }
  });
  return products;
}

async function notify(event, product, stock, cartUrl) {
  const price = product.price == null ? 'No informado' : `$${product.price.toLocaleString('es-CL')}`;
  const text = event === 'price_drop'
    ? `Bajó de precio\n\nProducto: ${product.name}\nPrecio anterior: $${product.previousPrice.toLocaleString('es-CL')}\nPrecio actual: ${price}\nStock disponible: ${stock ?? 'No informado'}\n\nAbrir carrito preparado:\n${cartUrl || product.url}`
    : `Producto repuesto\n\nProducto: ${product.name}\nPrecio: ${price}\nStock disponible: ${stock ?? 'No informado'}\n\nComprar ahora:\n${cartUrl || product.url}`;
  await sendEmail({
    subject: event === 'price_drop' ? `🔻 Bajó de precio: ${product.name}` : `✅ Producto repuesto: ${product.name}`,
    text
  });
}

async function fetchAvailableStock(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'PokemonStockMonitor/1.0 (+monitor)', Accept: 'text/html' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const match = html.match(/id=["']inventory-bar["'][\s\S]*?aria-valuenow=["'](\d+)["']/i)
        || html.match(/Actualmente,\s*<b>(\d+)\s*art/i);
      if (match) return Number(match[1]);
    } catch (error) {
      if (attempt === 3) console.error(`No se pudo leer stock de ${url}: ${error.message}`);
      else await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  return null;
}

async function runMonitor() {
  const response = await fetch(MONITOR_URL, {
    headers: { 'User-Agent': 'PokemonStockMonitor/1.0 (+monitor)' }
  });
  if (!response.ok) throw new Error(`La tienda respondió ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const products = parseProducts(contentType.includes('json') ? await response.json() : await response.text());
  const now = new Date().toISOString();
  let notifications = 0;

  for (const product of products) {
    const availableStock = await fetchAvailableStock(product.url);
    const hasStock = availableStock == null ? product.available : availableStock > 0;
    const { before, current } = await db.upsertProduct({
      ...product,
      availableStock,
      now,
      available: hasStock ? 1 : 0
    });
    await db.addHistory(current._id, product.price, hasStock ? 1 : 0, now);
    const priceDropped = before && before.price != null && product.price != null && product.price < before.price;
    const restocked = before && !before.available && hasStock;
    if (priceDropped) {
      const reserve = Math.floor(Math.max(0, (current.available_stock || 0) - current.reserved_stock) / 2);
      if (reserve > 0) {
        await db.reserveStock(current._id, reserve);
        await sendWhatsApp(`🔻 Bajó de precio: ${product.name}\nPrecio: $${product.price.toLocaleString('es-CL')}\nReserva registrada: ${reserve} unidad(es)\nCompra: ${product.url}`);
        notifications += 1;
      }
      const quantity = Math.floor((current.available_stock || 0) / 2);
      const cartUrl = product.variantId && quantity > 0
        ? new URL(`/cart/${product.variantId}:${quantity}`, MONITOR_URL).toString()
        : product.url;
      await notify('price_drop', { ...product, previousPrice: before.price }, current.available_stock, cartUrl);
    }
    if (restocked) {
      await sendWhatsApp(`✅ Repuesto: ${product.name}\nPrecio: $${(product.price || 0).toLocaleString('es-CL')}\nCompra: ${product.url}`);
      const cartUrl = product.variantId
        ? new URL(`/cart/${product.variantId}:1`, MONITOR_URL).toString()
        : product.url;
      await notify('restock', product, current.available_stock, cartUrl);
      notifications += 1;
    }
  }
  return { scanned: products.length, notifications, capturedAt: now };
}

module.exports = { runMonitor, parseProducts };
