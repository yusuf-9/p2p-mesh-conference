// Extend Request interface to include JWT auth data
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      adminId?: string;
      apiKeyId?: string;
      superAdminId?: string;
    }
  }
}

// This is needed to make the file a module
export {};