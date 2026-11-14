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

  // Fila de la tabla -> movimiento local
  const aMovimiento = f => ({
    id:        f.id,
    tipo:      f.tipo,
    monto:     Number(f.monto),
    categoria: f.categoria,
    ambito:    f.ambito,
    fecha:     f.fecha,
    nota:      f.nota || '',
    creado:    Number(f.creado) || 0,
    sync:      true
  });

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

    return { data: todo.map(aMovimiento), error: null };
  }

  return { configurado, registrar, entrar, salir, alCambiarSesion, subir, borrar, bajar };
})();
