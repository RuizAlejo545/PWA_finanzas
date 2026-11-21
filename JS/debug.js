// Consola en pantalla para ver logs y errores en el móvil sin DevTools
(() => {
  const MAX_LINEAS = 200;
  const CLAVE = 'gastos.debug';

  const lineas = [];
  let boton = null;
  let panel = null;
  let lista = null;

  function aTexto(valor) {
    if (valor && typeof valor === 'object' && 'message' in valor) {
      return valor.message + (valor.code ? ` [${valor.code}]` : '');
    }
    if (valor && typeof valor === 'object') {
      try {
        return JSON.stringify(valor);
      } catch (e) {
        return String(valor);
      }
    }
    return String(valor);
  }

  function agregar(nivel, argumentos) {
    let mensaje = argumentos.map(aTexto).join(' ');
    if (mensaje.length > 500) mensaje = mensaje.slice(0, 500) + '…';

    lineas.push({
      nivel,
      mensaje,
      hora: new Date().toLocaleTimeString('es-CO', { hour12: false })
    });
    if (lineas.length > MAX_LINEAS) lineas.shift();
    if (lista) dibujar();
  }

  ['log', 'info', 'warn', 'error'].forEach(nivel => {
    const original = console[nivel].bind(console);
    console[nivel] = (...argumentos) => {
      agregar(nivel, argumentos);
      original(...argumentos);
    };
  });

  window.addEventListener('error', e => {
    const donde = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '';
    agregar('error', [e.message + donde]);
  });

  window.addEventListener('unhandledrejection', e => {
    agregar('error', ['Promesa rechazada:', e.reason]);
  });

  function dibujar() {
    lista.textContent = '';
    lineas.forEach(l => {
      const fila = document.createElement('div');
      fila.className = `dbg-linea dbg-${l.nivel}`;
      fila.textContent = `${l.hora}  ${l.mensaje}`;
      lista.appendChild(fila);
    });
    lista.scrollTop = lista.scrollHeight;
  }

  function crearBoton(texto, alHacerClic) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.addEventListener('click', alHacerClic);
    return b;
  }

  function crearPanel() {
    boton = crearBoton('Consola', () => panel.classList.toggle('abierto'));
    boton.className = 'dbg-boton';

    panel = document.createElement('div');
    panel.className = 'dbg-panel';

    const barra = document.createElement('div');
    barra.className = 'dbg-barra';

    const titulo = document.createElement('span');
    titulo.textContent = 'Consola';

    const copiar = crearBoton('Copiar', async () => {
      const todo = lineas.map(l => `${l.hora} [${l.nivel}] ${l.mensaje}`).join('\n');
      try {
        await navigator.clipboard.writeText(todo);
        copiar.textContent = 'Copiado';
      } catch (e) {
        copiar.textContent = 'No se pudo';
      }
      setTimeout(() => { copiar.textContent = 'Copiar'; }, 1200);
    });

    const limpiar = crearBoton('Limpiar', () => {
      lineas.length = 0;
      dibujar();
    });
    const cerrar = crearBoton('Cerrar', () => panel.classList.remove('abierto'));

    barra.append(titulo, copiar, limpiar, cerrar);

    lista = document.createElement('div');
    lista.className = 'dbg-lista';

    panel.append(barra, lista);
    document.body.append(boton, panel);
    dibujar();
  }

  function quitarPanel() {
    if (boton) boton.remove();
    if (panel) panel.remove();
    boton = panel = lista = null;
  }

  function leerActivo() {
    try {
      return localStorage.getItem(CLAVE) === '1';
    } catch (e) {
      return false;
    }
  }

  function guardarActivo(activo) {
    try {
      if (activo) localStorage.setItem(CLAVE, '1');
      else localStorage.removeItem(CLAVE);
    } catch (e) {}
  }

  function alternar() {
    if (panel) {
      quitarPanel();
      guardarActivo(false);
    } else {
      crearPanel();
      panel.classList.add('abierto');
      guardarActivo(true);
      console.log('Consola de depuración activada');
    }
  }

  const parametro = new URLSearchParams(location.search).get('debug');
  if (parametro === '1') guardarActivo(true);
  if (parametro === '0') guardarActivo(false);

  if (leerActivo()) crearPanel();

  // Cinco toques rápidos en el título del mes activan o desactivan la consola
  const tituloMes = document.getElementById('mesTitulo');
  if (tituloMes) {
    let toques = 0;
    let temporizador;

    tituloMes.addEventListener('click', () => {
      toques++;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => { toques = 0; }, 1500);

      if (toques >= 5) {
        toques = 0;
        alternar();
      }
    });
  }
})();