/** Where the backend lives. Kept in its own file so low-level helpers can use it without importing the Redux store. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
