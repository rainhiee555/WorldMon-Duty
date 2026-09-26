import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { db, initDatabase } from "./database.js";

const DATA_DIR =
  path.join(process.cwd(), "data");

const files = [
  "users.json",
  "shifts.json",
  "audit.json",
  "settings.json"
];

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured"
    );
  }

  await initDatabase();

  for (const file of files) {
    const filePath =
      path.join(DATA_DIR, file);

    const text =
      await fs.readFile(
        filePath,
        "utf8"
      );

    const data =
      JSON.parse(text);

    await db.query(
      `
        INSERT INTO app_data (
          name,
          data,
          updated_at
        )
        VALUES (
          $1,
          $2::jsonb,
          NOW()
        )

        ON CONFLICT (name)
        DO UPDATE SET
          data = EXCLUDED.data,
          updated_at = NOW()
      `,
      [
        file,
        JSON.stringify(data)
      ]
    );

    console.log(
      `Migrated: ${file}`
    );
  }

  console.log(
    "Migration completed!"
  );

  await db.end();
}

migrate().catch(
  async (error) => {
    console.error(
      "Migration failed:",
      error
    );

    try {
      await db.end();
    } catch {}

    process.exit(1);
  }
);