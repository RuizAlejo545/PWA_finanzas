const Exportar = (() => {
  const ordenar = datos => [...datos].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || (a.creado || 0) - (b.creado || 0));

  const etiquetaTipo = tipo => (tipo === 'gasto' ? 'Gasto' : 'Ingreso');

  const fechaTexto = texto => texto.split('-').reverse().join('/');

  function crearCSV(datos) {
    const encabezado = ['Fecha', 'Tipo', 'Categoría', 'Ámbito', 'Nota', 'Monto'];

    // Evita que Excel trate celdas que empiezan con símbolos o tabuladores como fórmulas
    const texto = valor => {
      let t = String(valor == null ? '' : valor);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };

    const filas = ordenar(datos).map(m => [
      texto(fechaTexto(m.fecha)),
      texto(etiquetaTipo(m.tipo)),
      texto(m.categoria),
      texto(m.ambito),
      texto(m.nota),
      String(m.monto)
    ]);

    // BOM + punto y coma para que Excel en español respete tildes y columnas
    return '\ufeff' + [encabezado.map(texto), ...filas].map(f => f.join(';')).join('\r\n');
  }

  return { crearCSV };
})();

if (typeof module !== 'undefined') module.exports = Exportar;