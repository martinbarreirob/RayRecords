/** Tamaño legible de un fichero: «842 B», «12,4 kB», «1,3 MB». */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const text = value.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${text} ${units[unit]}`;
}

/** Los extractos del banco son CSV: se acepta por extensión o por tipo (algunos navegadores no informan del tipo). */
export function isCsvFile(file: { name: string; type: string }): boolean {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv';
}

/** Mensaje de por qué un fichero no sirve, o `null` si se puede usar. */
export function fileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!isCsvFile(file))
    return `«${file.name}» no es un CSV. Descarga el extracto del banco en formato CSV.`;
  if (file.size === 0) return `«${file.name}» está vacío.`;
  return null;
}
