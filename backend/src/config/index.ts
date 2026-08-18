import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'dim_ballooning_super_secret_jwt_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  pdfServiceUrl: process.env.PDF_SERVICE_URL || 'http://127.0.0.1:8001',
  checkThresholdPercent: Number(process.env.CHECK_THRESHOLD_PERCENT || 10),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  reportsDir: process.env.REPORTS_DIR || 'reports'
};
