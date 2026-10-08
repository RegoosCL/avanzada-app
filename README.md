# Avanzada · Santander Arena

App web instalable (PWA) para registrar vehículos en la hoja **patentes** y buscar patentes (muestra todos los registros repetidos y las patentes parecidas).

## 1. Conectar la hoja (Apps Script)

1. Abre la hoja de Google Sheets → **Extensiones → Apps Script**.
2. Borra lo que haya y pega el contenido de `apps-script/Codigo.gs`.
3. Cambia `CLAVE: 'CAMBIA_ESTA_CLAVE'` por una clave del equipo (la pedirá la app una vez en cada teléfono).
4. Guarda → **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario** (sin esto la app no puede conectarse)
5. Autoriza los permisos y copia el link que termina en `/exec`.
6. Pega ese link en `config.js`.

Para probar: abre el link `/exec` en el navegador; debe decir **Avanzada OK**.

> Si después cambias el código: **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión**. Así el link no cambia.

## 2. Publicar en GitHub Pages

1. Crea un repositorio en GitHub (público, para que Pages sea gratis).
2. **Add file → Upload files** y sube todos los archivos de esta carpeta.
3. **Settings → Pages → Branch: main / (root) → Save**.
4. En 1–2 minutos queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## 3. Instalar en el teléfono

- **Android (Chrome):** menú ⋮ → *Agregar a pantalla principal* / *Instalar app*.
- **iPhone (Safari):** botón Compartir → *Agregar a inicio*.

## Notas

- Sin señal, los registros quedan guardados en el teléfono y se envían solos al volver internet (sin duplicarse).
- La clave del equipo protege los nombres y teléfonos: aunque alguien encuentre el link en GitHub, no puede leer ni escribir la hoja sin ella. **No subas `Codigo.gs` con la clave real.**
