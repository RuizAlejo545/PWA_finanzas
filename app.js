
/* ---------- 1. Configuración ---------- */
const AMBITOS      = ['Personal', 'Trabajo', 'Negocio'];
const CAT_GASTO    = ['Comida', 'Transporte', 'Gasolina', 'Hogar', 'Salud', 'Ocio', 'Estudio', 'Insumos', 'Otros'];
const CAT_INGRESO  = ['Ventas', 'Domicilios', 'Salario', 'Otros'];
const KEY          = 'gastos.movimientos.v1';
const KEY_BORRADOS = 'gastos.borrados.v1';
const MONTO_MAX    = 999999999999999;   // 15 dígitos: el mismo límite de la base de datos


/* ---------- 2. Utilidades ---------- */
const $ = id => document.getElementById(id);

// Formato de pesos colombianos: $ 12.000
const cop = n => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
}).format(n);

// Fecha de hoy en formato AAAA-MM-DD (hora local)
function hoy() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Evita que el texto escrito por el usuario rompa el HTML
function esc(texto) {
  const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(texto).replace(/[&<>"']/g, c => mapa[c]);
}

// Id único para cada movimiento
function nuevoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function aviso(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.classList.add('v');
  setTimeout(() => a.classList.remove('v'), 1800);
}


/* ---------- 3. Estado y almacenamiento ---------- */
function leerLocal(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave)) || [];
  } catch (e) {
    return [];
  }
}

// Movimientos guardados en el dispositivo (ids siempre como texto)
let datos = leerLocal(KEY).map(m => ({
  ...m,
  id:     String(m.id),
  creado: m.creado || Number(m.id) || 0
}));

// Montos imposibles (por un error al escribir) se descartan: no caben en pantalla ni en la nube
const totalAntes = datos.length;
datos = datos.filter(m => Number.isFinite(m.monto) && m.monto > 0 && m.monto <= MONTO_MAX);
const descartados = totalAntes - datos.length;
if (descartados) guardar();

// Ids eliminados que faltan por borrar en la nube
let borrados = leerLocal(KEY_BORRADOS);

let mes    = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let filtro = 'Todos';
let tipo   = 'gasto';

function guardar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(datos));
  } catch (e) {
    aviso('No se pudo guardar');
  }
}

function guardarBorrados() {
  try {
    localStorage.setItem(KEY_BORRADOS, JSON.stringify(borrados));
  } catch (e) {}
}


/* ---------- 4. Dibujar la pantalla ---------- */
function render() {
  const ym = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`;

  $('mesTitulo').textContent = mes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  // Movimientos del mes y del ámbito seleccionado
  const filtrados = datos
    .filter(m => m.fecha.startsWith(ym) && (filtro === 'Todos' || m.ambito === filtro))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));

  renderTotales(filtrados);
  renderAmbitos();
  renderCategorias(filtrados);
  renderLista(filtrados);
}

function renderTotales(lista) {
  const ingresos = lista.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const gastos   = lista.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);

  $('totIng').textContent = cop(ingresos);
  $('totGas').textContent = cop(gastos);
  $('balance').textContent = cop(ingresos - gastos);
}

function renderAmbitos() {
  $('ambitos').innerHTML = ['Todos', ...AMBITOS]
    .map(a => `<button aria-pressed="${a === filtro}" data-a="${a}">${a}</button>`)
    .join('');
}

function renderCategorias(lista) {
  const gastos = lista.filter(m => m.tipo === 'gasto');
  const total  = gastos.reduce((s, m) => s + m.monto, 0);

  // Sumar por categoría
  const porCategoria = {};
  gastos.forEach(m => {
    porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + m.monto;
  });

  const filas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

  if (!filas.length) {
    $('cats').innerHTML = '<div class="sin-datos">Aún no hay gastos este mes.</div>';
    return;
  }

  $('cats').innerHTML = filas.map(([cat, valor]) => `
    <div class="cat">
      <div class="t"><span>${esc(cat)}</span><span>${cop(valor)}</span></div>
      <div class="barra"><i data-ancho="${Math.round(valor / total * 100)}"></i></div>
    </div>
  `).join('');

  // El ancho se pone desde JS (la política de seguridad no permite estilos en línea)
  $('cats').querySelectorAll('.barra i').forEach(barra => {
    barra.style.width = barra.dataset.ancho + '%';
  });
}

function renderLista(lista) {
  if (!lista.length) {
    $('lista').innerHTML = '<div class="vacio">Sin movimientos. Toca “Agregar” para registrar el primero.</div>';
    return;
  }

  let html = '';
  let ultimaFecha = '';

  for (const m of lista) {
    // Título de día cuando cambia la fecha
    if (m.fecha !== ultimaFecha) {
      ultimaFecha = m.fecha;
      const texto = new Date(m.fecha + 'T12:00:00')
        .toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
      html += `<div class="dia">${texto}</div>`;
    }

    const esGasto = m.tipo === 'gasto';
    html += `
      <div class="item">
        <div class="info">
          <b>${esc(m.categoria)}</b>
          <span>${esc(m.ambito)}${m.nota ? ' · ' + esc(m.nota) : ''}</span>
        </div>
        <div class="monto ${esGasto ? 'g' : 'i'}">${esGasto ? '−' : '+'}${cop(m.monto)}</div>
        <button class="borrar" data-id="${m.id}" aria-label="Eliminar">✕</button>
      </div>
    `;
  }

  $('lista').innerHTML = html;
}


/* ---------- 5. Formulario ---------- */
function llenarSelects() {
  const categorias = tipo === 'gasto' ? CAT_GASTO : CAT_INGRESO;

  $('categoria').innerHTML = categorias.map(c => `<option>${c}</option>`).join('');
  $('ambito').innerHTML    = AMBITOS.map(a => `<option>${a}</option>`).join('');

  if (filtro !== 'Todos') $('ambito').value = filtro;
}

function setTipo(nuevo) {
  tipo = nuevo;
  $('tGasto').setAttribute('aria-pressed', nuevo === 'gasto');
  $('tIngreso').setAttribute('aria-pressed', nuevo === 'ingreso');
  llenarSelects();
}

function abrirFormulario() {
  $('form').reset();
  setTipo('gasto');
  $('fecha').value = hoy();
  $('dlg').showModal();
  setTimeout(() => $('monto').focus(), 50);
}

function guardarMovimiento(e) {
  e.preventDefault();

  const monto = Number($('monto').value.replace(/\D/g, ''));
  if (!monto) {
    aviso('Escribe un monto');
    return;
  }
  if (monto > MONTO_MAX) {
    aviso('El monto máximo es $999.999.999.999.999');
    return;
  }

  datos.push({
    id:        nuevoId(),
    tipo:      tipo,
    monto:     monto,
    categoria: $('categoria').value,
    ambito:    $('ambito').value,
    fecha:     $('fecha').value,
    nota:      $('nota').value.trim(),
    creado:    Date.now(),
    sync:      false
  });
  guardar();

  // Ir al mes del movimiento guardado
  const f = new Date($('fecha').value + 'T12:00:00');
  mes = new Date(f.getFullYear(), f.getMonth(), 1);

  $('dlg').close();
  render();
  aviso('Guardado');
  sincronizar();
}

function eliminarMovimiento(e) {
  const boton = e.target.closest('.borrar');
  if (!boton) return;

  if (confirm('¿Eliminar este movimiento?')) {
    const id = boton.dataset.id;
    const movimiento = datos.find(m => m.id === id);

    // Si ya estaba en la nube, hay que borrarlo allá también
    if (movimiento && movimiento.sync) {
      borrados.push(id);
      guardarBorrados();
    }

    datos = datos.filter(m => m.id !== id);
    guardar();
    render();
    sincronizar();
  }
}

// Mientras se escribe el monto, se agregan los puntos de miles
function formatearMonto(e) {
  const numeros = e.target.value.replace(/\D/g, '').slice(0, 15);
  e.target.value = numeros ? new Intl.NumberFormat('es-CO').format(Number(numeros)) : '';
}


/* ---------- 6. Exportar (Excel desde el servidor y CSV) ---------- */
function descargar(blob, nombre) {
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

// Convierte la opción elegida en un rango de fechas (según el mes que se está viendo)
function rangoPeriodo(periodo) {
  const anio = mes.getFullYear();
  const m    = mes.getMonth();
  const dos  = n => String(n).padStart(2, '0');

  if (periodo === 'mes') {
    const ultimo = new Date(anio, m + 1, 0).getDate();
    return { desde: `${anio}-${dos(m + 1)}-01`, hasta: `${anio}-${dos(m + 1)}-${dos(ultimo)}` };
  }
  if (periodo === 'anio') {
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
  }
  return {};
}

function abrirExcel() {
  if (!API.configurado || !usuario) {
    aviso('Inicia sesión para exportar a Excel');
    $('dlgCuenta').showModal();
    return;
  }

  $('exAmbito').innerHTML = ['Todos', ...AMBITOS].map(a => `<option>${a}</option>`).join('');
  $('exAmbito').value = filtro;
  $('exPeriodo').value = 'todo';
  $('exError').textContent = '';
  $('dlgExcel').showModal();
}

async function generarExcel() {
  const error  = $('exError');
  const boton  = $('exGenerar');
  error.textContent = '';

  if (!navigator.onLine) {
    error.textContent = 'Sin conexión. El CSV sí funciona sin internet.';
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Generando…';

  try {
    // El servidor lee de la nube: primero se sube lo que falte
    await sincronizar();
    if (datos.some(m => !m.sync)) {
      error.textContent = 'Hay movimientos sin sincronizar. Intenta de nuevo en un momento.';
      return;
    }

    const opciones = rangoPeriodo($('exPeriodo').value);
    const ambito   = $('exAmbito').value;
    if (ambito !== 'Todos') opciones.ambito = ambito;

    const r = await API.exportarExcel(opciones);
    if (r.error) {
      error.textContent = r.error;
      return;
    }

    descargar(r.data, `gastos_${hoy()}.xlsx`);
    $('dlgExcel').close();
    aviso('Excel descargado');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Descargar';
  }
}

function exportarCSV() {
  if (!datos.length) {
    aviso('No hay datos');
    return;
  }

  const csv = Exportar.crearCSV(datos);
  descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `gastos_${hoy()}.csv`);
}


/* ---------- 7. Eventos ---------- */
$('nuevo').onclick    = abrirFormulario;
$('cancelar').onclick = () => $('dlg').close();
$('tGasto').onclick   = () => setTipo('gasto');
$('tIngreso').onclick = () => setTipo('ingreso');
$('excel').onclick    = abrirExcel;
$('exGenerar').onclick = generarExcel;
$('exCancelar').onclick = () => $('dlgExcel').close();
$('csv').onclick      = exportarCSV;

$('monto').addEventListener('input', formatearMonto);
$('form').addEventListener('submit', guardarMovimiento);
$('lista').addEventListener('click', eliminarMovimiento);

$('ambitos').addEventListener('click', e => {
  const boton = e.target.closest('button');
  if (boton) {
    filtro = boton.dataset.a;
    render();
  }
});

$('ant').onclick = () => {
  mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
  render();
};

$('sig').onclick = () => {
  mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
  render();
};


/* ---------- 8. Cuenta y sincronización (Supabase) ---------- */
let usuario       = null;
let sincronizando = false;

function mostrarEstado(texto) {
  $('estado').textContent = texto;
}

function actualizarCuenta() {
  $('cuenta').textContent  = usuario ? 'Cuenta' : 'Iniciar sesión';
  $('cuentaEntrar').hidden = !!usuario;
  $('cuentaSesion').hidden = !usuario;
  $('cuentaCorreo').textContent = usuario ? usuario.email : '';

  if (!API.configurado) mostrarEstado('');
  else if (!usuario)    mostrarEstado('Solo en este dispositivo');
}

function traducirError(mensaje) {
  if (/invalid login/i.test(mensaje))      return 'Correo o contraseña incorrectos.';
  if (/already registered/i.test(mensaje)) return 'Ese correo ya tiene una cuenta. Usa “Entrar”.';
  if (/email not confirmed/i.test(mensaje)) return 'Confirma tu correo antes de entrar.';
  return mensaje;
}

async function sincronizar() {
  if (!API.configurado || !usuario || sincronizando) return;

  if (!navigator.onLine) {
    mostrarEstado('Sin conexión: se sincronizará después');
    return;
  }

  sincronizando = true;
  mostrarEstado('Sincronizando…');

  try {
    // 1. Borrar en la nube lo que se eliminó aquí
    if (borrados.length) {
      const r = await API.borrar(borrados);
      if (r.error) throw r.error;
      borrados = [];
      guardarBorrados();
    }

    // 2. Subir los movimientos nuevos o pendientes
    const pendientes = datos.filter(m => !m.sync);
    if (pendientes.length) {
      const r = await API.subir(pendientes, usuario.id);
      if (r.error) throw r.error;
      pendientes.forEach(m => { m.sync = true; });
      guardar();
    }

    // 3. Bajar todo lo que hay en la nube
    const r = await API.bajar();
    if (r.error) throw r.error;

    const enNube      = r.data.filter(m => !borrados.includes(m.id));
    const idsEnNube   = new Set(enNube.map(m => m.id));
    const sinSubir    = datos.filter(m => !m.sync && !idsEnNube.has(m.id));

    datos = [...enNube, ...sinSubir];
    guardar();
    render();
    mostrarEstado('Sincronizado');
  } catch (e) {
    mostrarEstado('No se pudo sincronizar');
  } finally {
    sincronizando = false;
  }
}

async function entrarCuenta(crear) {
  const correo = $('correo').value.trim();
  const clave  = $('clave').value;
  const error  = $('cuentaError');
  error.textContent = '';

  if (!correo || clave.length < 8) {
    error.textContent = 'Escribe un correo y una contraseña de al menos 8 caracteres.';
    return;
  }

  const r = crear ? await API.registrar(correo, clave) : await API.entrar(correo, clave);

  if (r.error) {
    error.textContent = traducirError(r.error.message);
    return;
  }

  // Si Supabase pide confirmar el correo, todavía no hay sesión
  if (crear && !r.data.session) {
    error.textContent = 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.';
    return;
  }

  $('clave').value = '';
  $('dlgCuenta').close();
}

async function salirCuenta() {
  await sincronizar();

  const hayPendientes = datos.some(m => !m.sync);
  if (hayPendientes && !confirm('Hay movimientos sin sincronizar que se perderán. ¿Salir de todas formas?')) {
    return;
  }

  await API.salir();

  // Se limpian los datos locales para que no se mezclen con otra cuenta
  datos = [];
  borrados = [];
  guardar();
  guardarBorrados();

  $('dlgCuenta').close();
  render();
  aviso('Sesión cerrada');
}

$('cuenta').onclick          = () => $('dlgCuenta').showModal();
$('btnCerrarCuenta').onclick = () => $('dlgCuenta').close();
$('btnEntrar').onclick       = () => entrarCuenta(false);
$('btnCrear').onclick        = () => entrarCuenta(true);
$('btnSync').onclick         = sincronizar;
$('btnSalir').onclick        = salirCuenta;

if (API.configurado) {
  $('cuenta').hidden = false;

  API.alCambiarSesion(sesion => {
    usuario = sesion ? sesion.user : null;
    actualizarCuenta();
    if (usuario) setTimeout(sincronizar, 0);
  });

  window.addEventListener('online', sincronizar);
}


/* ---------- 9. Instalación como app (PWA) ---------- */
let promptInstalar;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  promptInstalar = e;
  $('instalar').hidden = false;
});

$('instalar').onclick = async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  $('instalar').hidden = true;
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}


/* ---------- 10. Iniciar ---------- */
actualizarCuenta();
render();
if (descartados) aviso(`Se quitó ${descartados} movimiento con monto inválido`);