import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../utils/ApiError";
import { MAX_MEDIA_BYTES } from "../utils/whatsappTemplates";

const ALLOWED_MIMETYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype) || /\.(csv|xlsx)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV or XLSX files are allowed"));
    }
  },
});

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_BYTES, files: 1 },
});

/** One file in the `file` field of a chat message; size / type problems reach the user as plain 400s. */
export function uploadChatMedia(req: Request, res: Response, next: NextFunction): void {
  mediaUpload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(ApiError.badRequest(`That file is too large. The limit is ${MAX_MEDIA_BYTES / (1024 * 1024)} MB`));
    }
    return next(ApiError.badRequest("Couldn't read that file. Try attaching it again."));
  });
}
