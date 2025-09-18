import { initDatabase } from './db';

// Initialize database on module load
if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL) {
  initDatabase().catch((error) => {
    console.warn('Database initialization failed:', error.message);
    // Don't throw error during build time
  });
}
