// Client-safe: shared by the upload form and the server-side validator.
export const MAX_DOCX_BYTES = 4 * 1024 * 1024;
export const MAX_COVER_BYTES = 2 * 1024 * 1024;
// Vercel caps request bodies at ~4.5 MB.
export const MAX_TOTAL_BYTES = 4.4 * 1024 * 1024;

export const DOCX_TOO_LARGE = "The .docx file must be 4 MB or smaller.";
export const COVER_TOO_LARGE = "The cover image must be 2 MB or smaller.";
export const TOTAL_TOO_LARGE = "Upload too large: docx and cover together must be under 4.4 MB.";
