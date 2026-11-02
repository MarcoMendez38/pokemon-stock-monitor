# Monitor Pokémon

Sistema Node.js + Express + Angular para monitorear productos Pokémon de BigBang, administrar stock reservado y enviar avisos por WhatsApp Business Cloud API.

## Arquitectura

- `server/`: API Express, scraper programado, SQLite local y notificaciones.
- `client/`: dashboard Angular.
- El stock se ingresa por producto. Cuando el precio baja, se reserva la mitad del stock disponible configurado y se envía un aviso con el enlace de checkout.
- Los productos agotados siguen visibles. Cuando vuelven a tener stock, se registra el evento y se notifica.

## Desarrollo

```powershell
npm.cmd install
npm.cmd --prefix client install
npm.cmd run dev
```

La API queda en `http://localhost:3000` y el dashboard Angular en `http://localhost:4200`.

Durante el desarrollo, Angular reenvía automáticamente las llamadas `/api` a Express mediante `client/proxy.conf.json`.

## Variables de entorno

Copia `.env.example` a `.env`:

- `DATABASE_PATH`: ruta del almacenamiento persistente.
- `ADMIN_API_KEY`: clave requerida para cambiar stock o ejecutar un monitoreo manual.
- `MONITOR_URL`: URL de BigBang.
- `MONITOR_INTERVAL_MINUTES`: frecuencia del monitoreo.
- `WHATSAPP_ENABLED`: `true` para activar envíos.
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_RECIPIENT`: credenciales y teléfono destino de Meta.

En Render conviene usar un disco persistente para `DATABASE_PATH`, o reemplazar la capa SQLite por PostgreSQL antes de operar a escala.

El dashboard solicita la API key administrativa para las acciones protegidas. Se guarda en el almacenamiento local del navegador y se envía en el encabezado `X-API-Key`.

## Despliegue en Render

Crear un Web Service con:

```text
Build command: npm.cmd install && npm.cmd --prefix client install && npm.cmd --prefix client run build
Start command: npm.cmd start
```

El servidor Express sirve `client/dist/client/browser` cuando existe. Configura las variables de entorno en Render y usa un disco persistente para conservar el historial.
