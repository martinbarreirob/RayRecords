/**
 * Category for transfers between own accounts (`traspaso`). Transactions in this category count as
 * neither expense nor income in `GET /api/expenses/summary`. It lives apart from the Zod schemas so
 * the web app can use it without pulling Zod into its bundle.
 */
export const TRANSFER_CATEGORY = 'traspaso';
