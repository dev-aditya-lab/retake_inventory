import multer from "multer";

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
