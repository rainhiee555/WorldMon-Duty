import pg from "pg";

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

db.on("error", (error) => {
  console.error(
    "PostgreSQL connection error:",
    error
  );
});

export async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      name TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log(
    "PostgreSQL database ready"
  );
}