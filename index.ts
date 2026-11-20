// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import ExcelJS from 'npm:exceljs@4.4.0';

const ORIGENES = (Deno.env.get('ALLOWED_ORIGINS') ??
  'https://ruizalejo545.github.io,http://localhost:8000,http://localhost:8080')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FILAS = 50000;

const COLOR = {
  oscuro:  'FF1B2A41',
  claro:   'FFE2E8F0',
  zebra:   'FFF1F5F9',
  borde:   'FFD5DCE6',
  texto:   'FF0A0F1E',
  suave:   'FF64748B',
  blanco:  'FFFFFFFF',
  gasto:   'FFB4432F',
  ingreso: 'FF2C7A55'
};

const FUENTE = 'Calibri';
const PESOS  = '"$" #,##0;-"$" #,##0';
const FECHA  = 'dd/mm/yyyy';
const PORC   = '0.0%';

const relleno = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

const ordenar = datos => [...datos].sort((a, b) =>
  a.fecha.localeCompare(b.fecha) || (a.creado || 0) - (b.creado || 0));

const etiquetaTipo = tipo => (tipo === 'gasto' ? 'Gasto' : 'Ingreso');

// UTC evita que Excel corra la fecha un día por zona horaria
const aFecha = texto => {
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

const fechaTexto = texto => texto.split('-').reverse().join('/');

const nombreMes = clave => {
  const [a, m] = clave.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, 1))
    .toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const suma = (lista, tipo) =>
  lista.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);

function agrupar(lista, clave) {
  const grupos = {};
  lista.forEach(m => {
    const k = clave(m);
    (grupos[k] = grupos[k] || []).push(m);
  });
  return grupos;
}

const colorBalance = valor => (valor >= 0 ? COLOR.ingreso : COLOR.gasto);

function bloque(ws, fila, titulo, encabezados, filas, formatos, colorear) {
  const titulo_ = ws.getCell(fila, 1);
  titulo_.value = titulo;
  titulo_.font  = { name: FUENTE, size: 13, bold: true, color: { argb: COLOR.oscuro } };
  ws.getRow(fila).height = 22;
  fila++;

  encabezados.forEach((texto, i) => {
    const c = ws.getCell(fila, i + 1);
    c.value     = texto;
    c.font      = { name: FUENTE, bold: true, color: { argb: COLOR.blanco } };
    c.fill      = relleno(COLOR.oscuro);
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right', indent: 1 };
  });
  ws.getRow(fila).height = 20;
  fila++;

  filas.forEach((valores, k) => {
    valores.forEach((valor, i) => {
      const c = ws.getCell(fila, i + 1);
      const color = (colorear && colorear(valores, i)) || COLOR.texto;
      c.value     = valor;
      c.font      = { name: FUENTE, color: { argb: color }, bold: color !== COLOR.texto };
      c.alignment = { horizontal: i === 0 ? 'left' : 'right', indent: 1 };
      c.border    = { bottom: { style: 'thin', color: { argb: COLOR.borde } } };
      if (formatos[i]) c.numFmt = formatos[i];
      if (k % 2 === 1) c.fill = relleno(COLOR.zebra);
    });
    fila++;
  });

  return fila + 1;
}

function hojaResumen(libro, datos, info) {
  const ws = libro.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 30 }, { width: 26 }, { width: 26 }, { width: 26 }];

  ws.mergeCells('A1:D1');
  const titulo = ws.getCell('A1');
  titulo.value = 'Mis Gastos · Resumen';
  titulo.font  = { name: FUENTE, size: 18, bold: true, color: { argb: COLOR.oscuro } };
  ws.getRow(1).height = 32;

  ws.mergeCells('A2:D2');
  const sub = ws.getCell('A2');
  const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
  sub.value = `${info} · ${datos.length} movimientos · Generado el ${hoy}`;
  sub.font  = { name: FUENTE, italic: true, color: { argb: COLOR.suave } };

  let fila = 4;
  const ingresos = suma(datos, 'ingreso');
  const gastos   = suma(datos, 'gasto');

  fila = bloque(ws, fila, 'Totales', ['Concepto', 'Monto'], [
    ['Ingresos', ingresos],
    ['Gastos',   gastos],
    ['Balance',  ingresos - gastos]
  ], [null, PESOS], (v, i) => {
    if (i !== 1) return null;
    if (v[0] === 'Ingresos') return COLOR.ingreso;
    if (v[0] === 'Gastos')   return COLOR.gasto;
    return colorBalance(v[1]);
  });

  const meses = agrupar(datos, m => m.fecha.slice(0, 7));
  const filasMes = Object.keys(meses).sort().reverse().map(clave => {
    const i = suma(meses[clave], 'ingreso');
    const g = suma(meses[clave], 'gasto');
    return [nombreMes(clave), i, g, i - g];
  });

  fila = bloque(ws, fila, 'Por mes', ['Mes', 'Ingresos', 'Gastos', 'Balance'], filasMes,
    [null, PESOS, PESOS, PESOS],
    (v, i) => (i === 3 ? colorBalance(v[3]) : null));

  const soloGastos = datos.filter(m => m.tipo === 'gasto');
  const categorias = agrupar(soloGastos, m => m.categoria);
  const filasCat = Object.keys(categorias)
    .map(c => [c, suma(categorias[c], 'gasto')])
    .sort((a, b) => b[1] - a[1])
    .map(([c, total]) => [c, total, gastos ? total / gastos : 0]);

  if (filasCat.length) {
    fila = bloque(ws, fila, 'Gastos por categoría', ['Categoría', 'Total', '% del gasto'], filasCat,
      [null, PESOS, PORC]);
  }

  const ambitos = agrupar(datos, m => m.ambito);
  const filasAmbito = Object.keys(ambitos).sort().map(a => {
    const i = suma(ambitos[a], 'ingreso');
    const g = suma(ambitos[a], 'gasto');
    return [a, i, g, i - g];
  });

  bloque(ws, fila, 'Por ámbito', ['Ámbito', 'Ingresos', 'Gastos', 'Balance'], filasAmbito,
    [null, PESOS, PESOS, PESOS],
    (v, i) => (i === 3 ? colorBalance(v[3]) : null));
}

function hojaMovimientos(libro, datos) {
  const ws = libro.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'Fecha',     key: 'fecha',     width: 13 },
    { header: 'Tipo',      key: 'tipo',      width: 11 },
    { header: 'Categoría', key: 'categoria', width: 16 },
    { header: 'Ámbito',    key: 'ambito',    width: 13 },
    { header: 'Nota',      key: 'nota',      width: 36 },
    { header: 'Monto',     key: 'monto',     width: 26 }
  ];

  const encabezado = ws.getRow(1);
  encabezado.height = 24;
  encabezado.eachCell(c => {
    c.font      = { name: FUENTE, bold: true, color: { argb: COLOR.blanco } };
    c.fill      = relleno(COLOR.oscuro);
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  ordenar(datos).forEach((m, k) => {
    const fila = ws.addRow({
      fecha:     aFecha(m.fecha),
      tipo:      etiquetaTipo(m.tipo),
      categoria: m.categoria,
      ambito:    m.ambito,
      nota:      String(m.nota || ''),
      monto:     m.monto
    });

    const color = m.tipo === 'gasto' ? COLOR.gasto : COLOR.ingreso;

    fila.eachCell(c => {
      c.font   = { name: FUENTE, color: { argb: COLOR.texto } };
      c.border = { bottom: { style: 'thin', color: { argb: COLOR.borde } } };
      if (k % 2 === 1) c.fill = relleno(COLOR.zebra);
    });

    fila.getCell('fecha').numFmt    = FECHA;
    fila.getCell('fecha').alignment = { horizontal: 'center' };
    fila.getCell('tipo').alignment  = { horizontal: 'center' };
    fila.getCell('tipo').font       = { name: FUENTE, bold: true, color: { argb: color } };
    fila.getCell('monto').numFmt    = PESOS;
    fila.getCell('monto').font      = { name: FUENTE, bold: true, color: { argb: color } };
  });

  if (datos.length) ws.autoFilter = { from: 'A1', to: `F${datos.length + 1}` };

  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function crearExcel(datos, info) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Mis Gastos';
  libro.created = new Date();

  hojaResumen(libro, datos, info);
  hojaMovimientos(libro, datos);
  return libro;
}

function describirFiltro({ desde, hasta, ambito }) {
  let periodo = 'Período: todo el historial';
  if (desde || hasta) {
    periodo = `Período: ${desde ? fechaTexto(desde) : 'inicio'} – ${hasta ? fechaTexto(hasta) : 'hoy'}`;
  }
  return `${periodo} · Ámbito: ${ambito || 'Todos'}`;
}

function cabecerasCors(origen) {
  const cabeceras = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Disposition',
    'Access-Control-Max-Age': '86400'
  };
  if (origen && ORIGENES.includes(origen)) {
    cabeceras['Access-Control-Allow-Origin'] = origen;
  }
  return cabeceras;
}

function responderJson(cuerpo, estado, cabeceras) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cabeceras, 'Content-Type': 'application/json' }
  });
}

function fechaReal(texto) {
  return FECHA_VALIDA.test(texto) && !Number.isNaN(Date.parse(texto));
}

Deno.serve(async (req) => {
  const origen    = req.headers.get('Origin');
  const cabeceras = cabecerasCors(origen);

  if (origen && !ORIGENES.includes(origen)) {
    return responderJson({ error: 'Origen no permitido' }, 403, cabeceras);
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cabeceras });
  }

  if (req.method !== 'POST') {
    return responderJson({ error: 'Método no permitido' }, 405, cabeceras);
  }

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return responderJson({ error: 'Inicia sesión para exportar' }, 401, cabeceras);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? '',
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      }
    );

    const { data: sesion, error: errorSesion } = await supabase.auth.getUser(token);
    if (errorSesion || !sesion || !sesion.user) {
      return responderJson({ error: 'Tu sesión expiró. Vuelve a iniciar sesión' }, 401, cabeceras);
    }

    let cuerpo = {};
    try {
      cuerpo = await req.json();
    } catch (_) {
      cuerpo = {};
    }

    const { desde, hasta, ambito } = cuerpo ?? {};

    if (desde && (typeof desde !== 'string' || !fechaReal(desde))) {
      return responderJson({ error: 'Fecha "desde" inválida' }, 400, cabeceras);
    }
    if (hasta && (typeof hasta !== 'string' || !fechaReal(hasta))) {
      return responderJson({ error: 'Fecha "hasta" inválida' }, 400, cabeceras);
    }
    if (desde && hasta && desde > hasta) {
      return responderJson({ error: 'La fecha inicial es posterior a la final' }, 400, cabeceras);
    }
    if (ambito && (typeof ambito !== 'string' || ambito.length > 40)) {
      return responderJson({ error: 'Ámbito inválido' }, 400, cabeceras);
    }

    const paso = 1000;
    let filas = [];
    let inicio = 0;

    while (true) {
      let consulta = supabase
        .from('gastos')
        .select('id,tipo,monto,categoria,ambito,fecha,nota,creado')
        .order('fecha')
        .order('creado')
        .order('id')
        .range(inicio, inicio + paso - 1);

      if (desde)  consulta = consulta.gte('fecha', desde);
      if (hasta)  consulta = consulta.lte('fecha', hasta);
      if (ambito) consulta = consulta.eq('ambito', ambito);

      const { data, error } = await consulta;
      if (error) {
        console.error('Error leyendo gastos:', error.message);
        return responderJson({ error: 'No se pudieron leer los movimientos' }, 500, cabeceras);
      }

      filas = filas.concat(data);
      if (data.length < paso) break;

      inicio += paso;
      if (filas.length >= MAX_FILAS) {
        return responderJson({ error: 'Son demasiados movimientos. Elige un período más corto' }, 413, cabeceras);
      }
    }

    const movimientos = filas
      .map(f => ({ ...f, monto: Number(f.monto), creado: Number(f.creado) || 0 }))
      .filter(m => (m.tipo === 'gasto' || m.tipo === 'ingreso') && Number.isFinite(m.monto) && fechaReal(m.fecha));

    if (!movimientos.length) {
      return responderJson({ error: 'No hay movimientos en ese período' }, 404, cabeceras);
    }

    const libro  = crearExcel(movimientos, describirFiltro({ desde, hasta, ambito }));
    const buffer = await libro.xlsx.writeBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        ...cabeceras,
        // octet-stream hace que supabase-js entregue el archivo como Blob
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="gastos.xlsx"'
      }
    });
  } catch (error) {
    console.error('Error inesperado:', error && error.message);
    return responderJson({ error: 'Error inesperado al crear el Excel' }, 500, cabeceras);
  }
});