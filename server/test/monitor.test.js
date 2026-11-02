const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProducts } = require('../src/monitor');

test('parsea productos Shopify y construye enlace de carrito seguro', () => {
  const products = parseProducts({
    products: [{
      id: 123,
      title: 'Producto Pokémon',
      handle: 'producto-pokemon',
      images: [{ src: 'https://cdn.example/image.jpg' }],
      variants: [
        { id: 456, price: '6990', available: false },
        { id: 789, price: '5990', available: true }
      ]
    }]
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].variantId, '789');
  assert.equal(products[0].price, 5990);
  assert.equal(products[0].available, true);
  assert.equal(products[0].cartUrl, 'https://bigbang.cl/cart/789:1');
  assert.equal(new URL(products[0].cartUrl).hostname, 'bigbang.cl');
});

test('no inventa stock cuando Shopify no informa cantidad', () => {
  const products = parseProducts({
    products: [{
      id: 123,
      title: 'Producto Pokémon',
      handle: 'producto-pokemon',
      variants: [{ id: 456, price: '6990', available: true }]
    }]
  });

  assert.equal(products[0].availableStock, null);
  assert.equal(products[0].available, true);
});
