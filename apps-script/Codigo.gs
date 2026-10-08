/**
 * AVANZADA · Santander Arena
 * 1) Recibe los registros de la app y los anota debajo del último nombre
 *    de la hoja "patentes", siempre en las mismas columnas.
 * 2) Busca una patente en toda la hoja y devuelve TODOS los registros
 *    que la tengan (aunque esté repetida con otro nombre u otro teléfono),
 *    más las patentes parecidas (1 letra distinta) por si hubo un error al tipear.
 *
 * Si algún día cambian las columnas, solo cambia las letras de aquí abajo.
 */
const CONFIG = {
  HOJA: 'patentes',     // nombre exacto de la pestaña
  // Columnas donde la app escribe los registros nuevos:
  COL_NOMBRE: 'L',
  COL_TELEFONO: 'M',
  COL_PATENTE: 'P',
  COL_EMPRESA: 'R',
  COL_FECHA: '',        // opcional: pon una letra (ej. 'S') si quieren fecha y hora
  COPIAR_COLORES: true, // copia los colores (amarillo/verde) de la fila de arriba

  // Los demás bloques de la hoja (para la búsqueda). La búsqueda además los
  // detecta sola leyendo los títulos (NOMBRE / TELÉFONO / PATENTE / EMPRESA),
  // así que si agregan un bloque nuevo a la derecha no hace falta tocar nada.
  // Si en una fila el teléfono y la empresa están cambiados de lugar, se corrige solo.
  OTROS_GRUPOS: [
    { nombre: 'A',  telefono: 'B',  patente: 'D',  empresa: 'F'  },
    { nombre: 'U',  telefono: 'V',  patente: 'W',  empresa: 'Y'  },
    { nombre: 'AB', telefono: 'AD', patente: 'AG', empresa: 'AI' }
  ],

  // Pestañas donde buscar. Deja [] para buscar en TODAS las pestañas.
  HOJAS_BUSQUEDA: ['patentes'],
  MAX_RESULTADOS: 60,

  // Clave del equipo: la app la pide una vez en cada teléfono.
  // Sin ella nadie puede leer ni escribir la hoja aunque encuentre el link.
  // ¡Cámbiala por una propia! (no la subas a GitHub)
  CLAVE: 'CAMBIA_ESTA_CLAVE'
};

/* ───────────────────────── ENTRADA ───────────────────────── */

// La app manda todo por POST: { accion: 'agregar' | 'buscar' | 'verificar', clave, ... }
function doPost(e) {
  let d;
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json({ ok: false, error: 'Datos inválidos' }); }

  if (String(d.clave || '') !== String(CONFIG.CLAVE)) {
    return json({ ok: false, clave: true, error: 'Clave incorrecta' });
  }
  try {
    if (d.accion === 'verificar') return json({ ok: true });
    if (d.accion === 'buscar') return json(buscar(d.patente));
    return json(agregar(d));
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

// Abrir el link /exec en el navegador muestra "Avanzada OK" (para probar que está publicado).
function doGet() {
  return ContentService.createTextOutput('Avanzada OK');
}

/* ───────────────────────── GUARDAR ───────────────────────── */

function agregar(d) {
  const nombre   = limpiar(d.nombre);
  const telefono = String(d.telefono || '').replace(/\D/g, '');
  const patente  = normPatente(d.patente);
  const empresa  = limpiar(d.empresa);
  if (!nombre || !telefono || !patente || !empresa) throw new Error('Faltan datos');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('La hoja está ocupada, intenta de nuevo');
  try {
    // Si la app reenvía el mismo registro (se cortó la señal justo después de guardar),
    // no lo anotamos dos veces.
    const cache = CacheService.getScriptCache();
    const id = d.id ? 'reg_' + String(d.id).slice(0, 60) : '';
    if (id) {
      const ya = cache.get(id);
      if (ya) return { ok: true, fila: Number(ya), repetido: true };
    }

    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HOJA);
    if (!hoja) throw new Error('No encuentro la pestaña "' + CONFIG.HOJA + '"');

    const fila = siguienteFila(hoja);
    // Si la hoja se quedó sin filas abajo, le agregamos más (copian el formato de la de arriba).
    const maxFilas = hoja.getMaxRows();
    if (fila > maxFilas) hoja.insertRowsAfter(maxFilas, fila - maxFilas + 20);

    if (CONFIG.COPIAR_COLORES && fila > 1) {
      const cols = [CONFIG.COL_NOMBRE, CONFIG.COL_TELEFONO, CONFIG.COL_PATENTE, CONFIG.COL_EMPRESA, CONFIG.COL_FECHA]
        .filter(String).map(colNum);
      const desde = Math.min.apply(null, cols), hasta = Math.max.apply(null, cols);
      hoja.getRange(fila - 1, desde, 1, hasta - desde + 1)
          .copyTo(hoja.getRange(fila, desde, 1, hasta - desde + 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    escribir(hoja, fila, CONFIG.COL_NOMBRE, nombre);
    escribir(hoja, fila, CONFIG.COL_TELEFONO, Number(telefono) || telefono);
    escribir(hoja, fila, CONFIG.COL_PATENTE, patente);
    escribir(hoja, fila, CONFIG.COL_EMPRESA, empresa);
    if (CONFIG.COL_FECHA) escribir(hoja, fila, CONFIG.COL_FECHA, new Date());

    SpreadsheetApp.flush();
    if (id) cache.put(id, String(fila), 21600); // 6 horas
    return { ok: true, fila: fila };
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── BUSCAR ───────────────────────── */

function buscar(texto) {
  const q = normPatente(texto);
  if (q.length < 3) return { ok: false, error: 'Escribe al menos 3 caracteres de la patente' };

  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = CONFIG.HOJAS_BUSQUEDA.length
    ? CONFIG.HOJAS_BUSQUEDA.map(function (n) { return libro.getSheetByName(n); }).filter(Boolean)
    : libro.getSheets();

  // Grupos de columnas conocidos (por letra), indexados por la columna de la patente
  const grupos = [{ nombre: CONFIG.COL_NOMBRE, telefono: CONFIG.COL_TELEFONO, patente: CONFIG.COL_PATENTE, empresa: CONFIG.COL_EMPRESA }]
    .concat(CONFIG.OTROS_GRUPOS || []);
  const fijos = {};
  grupos.forEach(function (g) {
    fijos[colNum(g.patente) - 1] = { nombre: colNum(g.nombre) - 1, telefono: colNum(g.telefono) - 1, empresa: colNum(g.empresa) - 1 };
  });

  const resultados = [];
  hojas.forEach(function (hoja) {
    const datos = hoja.getDataRange().getDisplayValues();
    // Los bloques que se detectan por los títulos mandan; los fijos completan lo que falte.
    const grupoPorCol = Object.assign({}, fijos);
    const detectados = detectarGrupos(datos);
    Object.keys(detectados).forEach(function (p) {
      const d = detectados[p], f = fijos[p] || {};
      grupoPorCol[p] = {
        nombre:   d.nombre   >= 0 ? d.nombre   : (f.nombre   != null ? f.nombre   : -1),
        telefono: d.telefono >= 0 ? d.telefono : (f.telefono != null ? f.telefono : -1),
        empresa:  d.empresa  >= 0 ? d.empresa  : (f.empresa  != null ? f.empresa  : -1)
      };
    });
    for (let r = 0; r < datos.length; r++) {
      const fila = datos[r];
      for (let c = 0; c < fila.length; c++) {
        const bruto = fila[c];
        if (!bruto) continue;
        const n = normPatente(bruto);
        if (!pareceePatente(n)) continue;
        const contiene = n.indexOf(q) !== -1;
        if (!contiene && !unaLetraDistinta(n, q)) continue;

        const g = grupoPorCol[c];
        const reg = g ? {
          nombre:   fila[g.nombre] || '',
          telefono: fila[g.telefono] || '',
          empresa:  fila[g.empresa] || ''
        } : adivinar(fila, c);

        // En algunas filas el teléfono quedó en la columna de empresa y al revés.
        if (!pareceTel(reg.telefono) && pareceTel(reg.empresa)) {
          const t = reg.telefono; reg.telefono = reg.empresa; reg.empresa = t;
        }
        const tels = separarTelefonos(reg.telefono);

        resultados.push({
          patente: n,
          patenteOriginal: String(bruto).trim(),
          nombre: limpiar(reg.nombre),
          telefono: tels[0] || '',
          telefono2: tels[1] || '',
          empresa: limpiar(reg.empresa),
          hoja: hoja.getName(),
          fila: r + 1,
          exacta: n === q
        });
      }
    }
  });

  // Exactas primero; dentro de cada grupo, las más recientes (más abajo) primero
  resultados.sort(function (a, b) {
    if (a.exacta !== b.exacta) return a.exacta ? -1 : 1;
    return b.fila - a.fila;
  });

  return { ok: true, consulta: q, total: resultados.length, resultados: resultados.slice(0, CONFIG.MAX_RESULTADOS) };
}

// Lee los títulos de las primeras filas y arma un grupo por cada columna "PATENTE":
// NOMBRE a la izquierda, TELÉFONO entre nombre y patente, EMPRESA/ÁREA a la derecha.
// (Tolera faltas de ortografía como "EMPESA O ÁEA" o "TELEFONO CELULA".)
function detectarGrupos(datos) {
  const grupos = {};
  for (let r = 0; r < Math.min(5, datos.length); r++) {
    const t = datos[r].map(function (v) { return String(v).toUpperCase(); });
    const es = function (re) { return t.map(function (v, i) { return re.test(v) ? i : -1; }).filter(function (i) { return i >= 0; }); };
    const pats = es(/PATENTE|MATR[IÍ]CULA/), noms = es(/NOMB/), tels = es(/TEL[EÉ]F|CELU/), emps = es(/EMP|[AÁ]REA|[AÁ]EA/);
    if (!pats.length) continue;
    pats.forEach(function (p) {
      const nom = noms.filter(function (i) { return i < p; }).pop();
      if (nom == null) return;
      const sigNom = noms.filter(function (i) { return i > p; })[0];
      const tel = tels.filter(function (i) { return i > nom && i < p; }).pop();
      const emp = emps.filter(function (i) { return i > p && (sigNom == null || i < sigNom); })[0];
      grupos[p] = { nombre: nom, telefono: tel == null ? -1 : tel, empresa: emp == null ? -1 : emp };
    });
    return grupos;
  }
  return grupos;
}

// "998804494/" o "996396880/961396880" → ["998804494"] / ["996396880", "961396880"]
function separarTelefonos(v) {
  return String(v || '').split(/[\/,;]|\by\b|\s{2,}/)
    .map(function (x) { return x.replace(/[^\d+]/g, ''); })
    .filter(function (x) { return x.replace(/\D/g, '').length >= 6; });
}
function pareceTel(v) {
  const s = String(v || '').trim();
  return s.replace(/\D/g, '').length >= 6 && /^[\d\s+()\/.,-]+$/.test(s);
}

// Misma largo y solo 1 carácter distinto (ej. RVWG14 vs RVWG15). Solo para patentes completas.
function unaLetraDistinta(a, b) {
  if (b.length < 5 || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++dif > 1) return false;
  return dif === 1;
}

// Para patentes en columnas que no están configuradas: mira las celdas vecinas.
function adivinar(fila, c) {
  const reg = { nombre: '', telefono: '', empresa: '' };
  const desde = Math.max(0, c - 5), hasta = Math.min(fila.length - 1, c + 5);
  for (let i = c - 1; i >= desde && !reg.nombre; i--) {
    const v = String(fila[i]).trim();
    if (/[a-záéíóúñ]/i.test(v) && !pareceePatente(normPatente(v)) && !esTelefono(v)) reg.nombre = v;
  }
  for (let i = desde; i <= hasta; i++) {
    if (i === c) continue;
    const v = String(fila[i]).trim();
    if (!reg.telefono && esTelefono(v)) reg.telefono = v;
  }
  for (let i = c + 1; i <= hasta && !reg.empresa; i++) {
    const v = String(fila[i]).trim();
    if (v && /[a-záéíóúñ]/i.test(v) && !esTelefono(v)) reg.empresa = v;
  }
  return reg;
}

/* ───────────────────────── AYUDANTES ───────────────────────── */

// Busca el último nombre escrito en la columna de nombres y devuelve la fila siguiente.
function siguienteFila(hoja) {
  const col = colNum(CONFIG.COL_NOMBRE);
  const ultima = hoja.getLastRow();
  if (ultima < 1) return 1;
  const valores = hoja.getRange(1, col, ultima, 1).getValues();
  for (let i = valores.length - 1; i >= 0; i--) {
    if (String(valores[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

function normPatente(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function pareceePatente(n) { return /^[A-Z0-9]{4,8}$/.test(n) && /[A-Z]/.test(n) && /\d/.test(n); }
function esTelefono(v) { const d = String(v).replace(/\D/g, ''); return d.length >= 6 && d.length <= 12 && /^[\d\s+()-]+$/.test(String(v).trim()); }

function escribir(hoja, fila, letra, valor) {
  hoja.getRange(fila, colNum(letra)).setValue(valor);
}

function colNum(letra) {
  let n = 0;
  String(letra).toUpperCase().split('').forEach(function (c) { n = n * 26 + (c.charCodeAt(0) - 64); });
  return n;
}

function limpiar(v) { return String(v || '').trim().replace(/\s+/g, ' '); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
