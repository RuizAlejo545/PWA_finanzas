/* ==========================================================
   Mis Gastos - conexión con Supabase (API)
   Todas las funciones devuelven { data, error }
   ========================================================== */
const API = (() => {
  const cfg = window.GASTOS_CONFIG || {};

  const configurado =
    !!cfg.SUPABASE_URL &&
    !!cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('TU-PROYECTO') &&
    !!(window.supabase && window.supabase.createClient);

  const db = configurado
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  // Movimiento local -> fila de la tabla
  const aFila = (m, userId) => ({
    user_id:   userId,
    id:        String(m.id),
    tipo:      m.tipo,
    monto:     m.monto,
    categoria: m.categoria,
    ambito:    m.ambito,
    fecha:     m.fecha,
    nota:      m.nota || '',
    creado:    m.creado || 0
  });

  // Fila de la tabla -> movimiento local.
  // Se valida todo: si una fila viene mal formada se descarta.
  const texto = (valor, max) => String(valor == null ? '' : valor).slice(0, max);

  const aMovimiento = f => {
    if (!f) return null;

    const monto = Number(f.monto);
    const valido =
      (f.tipo === 'gasto' || f.tipo === 'ingreso') &&
      Number.isFinite(monto) && monto > 0 && monto <= 999999999999999 &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha));

    if (!valido) return null;

    return {
      id:        texto(f.id, 64),
      tipo:      f.tipo,
      monto:     monto,
      categoria: texto(f.categoria, 40),
      ambito:    texto(f.ambito, 40),
      fecha:     f.fecha,
      nota:      texto(f.nota, 200),
      creado:    Number(f.creado) || 0,
      sync:      true
    };
  };

  /* ----- Sesión ----- */
  const registrar = (correo, clave) => db.auth.signUp({ email: correo, password: clave });
  const entrar    = (correo, clave) => db.auth.signInWithPassword({ email: correo, password: clave });
  const salir     = () => db.auth.signOut();

  function alCambiarSesion(callback) {
    db.auth.onAuthStateChange((evento, sesion) => callback(sesion));
  }

  /* ----- Datos ----- */
  async function subir(lista, userId) {
    const filas = lista.map(m => aFila(m, userId));
    return db.from('gastos').upsert(filas, { onConflict: 'user_id,id' });
  }

  async function borrar(ids) {
    return db.from('gastos').delete().in('id', ids);
  }

  // Descarga todos los movimientos (de 1000 en 1000)
  async function bajar() {
    const paso = 1000;
    let todo = [];
    let desde = 0;

    while (true) {
      const { data, error } = await db
        .from('gastos')
        .select('*')
        .order('creado')
        .order('id')
        .range(desde, desde + paso - 1);

      if (error) return { data: null, error };

      todo = todo.concat(data);
      if (data.length < paso) break;
      desde += paso;
    }

    return { data: todo.map(aMovimiento).filter(Boolean), error: null };
  }

  // Pide el Excel a la Edge Function "exportar-excel".
  // opciones: { desde, hasta, ambito } (todas opcionales)
  async function exportarExcel(opciones) {
    const { data: s } = await db.auth.getSession();
    const token = s && s.session ? s.session.access_token : null;
    if (!token) return { data: null, error: 'Inicia sesión para exportar a Excel.' };

    const { data, error } = await db.functions.invoke('exportar-excel', {
      body: opciones || {},
      headers: { Authorization: `Bearer ${token}` }
    });

    if (error) {
      let mensaje = 'No se pudo crear el Excel.';
      const respuesta = error.context;

      if (error.name === 'FunctionsFetchError') {
        mensaje = 'No se pudo conectar con el servidor. Revisa tu internet.';
      } else if (respuesta && typeof respuesta.json === 'function') {
        try {
          const cuerpo = await respuesta.json();
          if (cuerpo && cuerpo.error) mensaje = cuerpo.error;
          else if (respuesta.status === 404) mensaje = 'La función "exportar-excel" no está desplegada en Supabase.';
        } catch (e) {}
      }
      return { data: null, error: mensaje };
    }

    if (!(data instanceof Blob)) return { data: null, error: 'Respuesta inesperada del servidor.' };
    return { data, error: null };
  }

  return { configurado, registrar, entrar, salir, alCambiarSesion, subir, borrar, bajar, exportarExcel };
})();