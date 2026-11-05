/**
 * Categoría de los traspasos entre cuentas propias. Los movimientos con esta categoría no cuentan
 * como gasto ni como ingreso en `GET /api/expenses/summary`. Vive aparte de los esquemas Zod para que
 * la web pueda usarla sin arrastrar Zod al bundle.
 */
export const TRANSFER_CATEGORY = 'traspaso';
