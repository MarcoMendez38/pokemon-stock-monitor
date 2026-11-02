import { bootstrapApplication } from '@angular/platform-browser';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface Product {
  id: number; name: string; url: string; image_url: string | null; price: number | null;
  previous_price: number | null; available: number; available_stock: number | null; reserved_stock: number;
  price_dropped: number;
}
interface PricePoint { price: number | null; available: number; captured_at: string; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <main>
      <header><div><span class="eyebrow">BIGBANG · POKÉMON</span><h1>Monitor de productos</h1><label class="key-label">Clave administrativa <input type="password" [value]="adminKey" (change)="setAdminKey(key.value)" #key placeholder="X-API-Key"></label></div>
        <button class="primary" (click)="runMonitor()" [disabled]="running">{{ running ? 'Actualizando…' : 'Actualizar ahora' }}</button>
      </header>
      <section class="stats"><div><strong>{{ products.length }}</strong><span>productos</span></div><div><strong>{{ availableCount }}</strong><span>disponibles</span></div><div><strong>{{ soldOutCount }}</strong><span>agotados</span></div><div><strong>{{ reservedCount }}</strong><span>reservas</span></div></section>
      <p class="notice" *ngIf="message">{{ message }}</p>
      <section class="table-wrap"><table><thead><tr><th>Producto</th><th>Precio antes</th><th>Precio ahora</th><th>Estado</th><th>Stock disponible</th><th>Reservado</th><th></th></tr></thead>
      <tbody><tr *ngFor="let product of products" [class.soldout]="!product.available">
        <td class="product"><img *ngIf="product.image_url" [src]="product.image_url" alt=""><div><a [href]="product.url" target="_blank">{{ product.name }}</a><small *ngIf="product.price_dropped">Precio bajó desde {{ money(product.previous_price) }}</small></div></td>
        <td>{{ money(product.previous_price) }}</td>
        <td><b>{{ money(product.price) }}</b><small *ngIf="product.price_dropped" class="down">↓ {{ money(product.previous_price! - product.price!) }}</small></td>
        <td><span class="badge" [class.ok]="product.available">{{ product.available ? 'Disponible' : 'Agotado' }}</span></td>
        <td><b *ngIf="product.available_stock != null; else unknownStock">{{ product.available_stock }}</b><ng-template #unknownStock>No informado</ng-template></td>
        <td>{{ product.reserved_stock }}</td><td><a class="buy" [href]="product.url" target="_blank">Ver compra ↗</a><button class="history-button" (click)="showHistory(product)">Historial</button></td>
      </tr></tbody></table>
      <div class="empty" *ngIf="!products.length">Aún no hay productos. Pulsa “Actualizar ahora” para iniciar el monitoreo.</div></section>
      <section class="history" *ngIf="selectedProduct">
        <div class="history-head"><div><span class="eyebrow">LÍNEA TEMPORAL</span><h2>{{ selectedProduct.name }}</h2></div><button (click)="selectedProduct = null">Cerrar</button></div>
        <p *ngIf="!priceHistory.length">Todavía no hay capturas históricas para este producto.</p>
        <table *ngIf="priceHistory.length"><thead><tr><th>Fecha</th><th>Precio</th><th>Stock</th></tr></thead><tbody><tr *ngFor="let point of priceHistory"><td>{{ point.captured_at | date:'dd/MM/yyyy HH:mm' }}</td><td>{{ money(point.price) }}</td><td>{{ point.available ? 'Disponible' : 'Agotado' }}</td></tr></tbody></table>
      </section>
    </main>`,
  styleUrls: ['./styles.css']
})
class AppComponent implements OnDestroy, OnInit {
  products: Product[] = []; running = false; message = ''; adminKey = localStorage.getItem('pokemon-monitor-admin-key') || ''; selectedProduct: Product | null = null; priceHistory: PricePoint[] = [];
  private readonly refreshTimer = window.setInterval(() => this.load(), 60_000);
  constructor(private readonly http: HttpClient) {}
  ngOnInit() { this.load(); }
  ngOnDestroy() { window.clearInterval(this.refreshTimer); }
  async load() { try { this.products = await firstValueFrom(this.http.get<Product[]>('/api/products')); } catch { this.message = 'No se pudo conectar con la API.'; } }
  async showHistory(product: Product) { this.selectedProduct = product; this.priceHistory = await firstValueFrom(this.http.get<PricePoint[]>(`/api/products/${product.id}/history`)); }
  async saveStock(product: Product, value: string) { try { const updated = await firstValueFrom(this.http.patch<Product>(`/api/products/${product.id}/stock`, { stock: Number(value) }, { headers: this.authHeaders() })); Object.assign(product, updated); this.message = `Stock guardado para ${product.name}.`; } catch { this.message = 'No autorizado o el stock no es válido.'; } }
  setAdminKey(value: string) { this.adminKey = value.trim(); localStorage.setItem('pokemon-monitor-admin-key', this.adminKey); }
  private authHeaders() { return { 'X-API-Key': this.adminKey }; }
  async runMonitor() { this.running = true; this.message = ''; try { const result = await firstValueFrom(this.http.post<{ scanned: number }>('/api/monitor/run', {}, { headers: this.authHeaders() })); this.message = `Actualización completada: ${result.scanned} productos Pokémon encontrados.`; await this.load(); } catch { this.message = 'No autorizado o la actualización falló. Verifica la clave administrativa.'; } finally { this.running = false; } }
  money(value: number | null) { return value == null ? '—' : `$${value.toLocaleString('es-CL')}`; }
  get availableCount() { return this.products.filter(p => p.available).length; }
  get soldOutCount() { return this.products.filter(p => !p.available).length; }
  get reservedCount() { return this.products.reduce((sum, p) => sum + p.reserved_stock, 0); }
}

bootstrapApplication(AppComponent, { providers: [provideHttpClient()] }).catch(console.error);
