import { db } from "./database.js";

const locks = new Map();

function clone(value) {
  return structuredClone(value);
}

export async function readJson(
  file,
  fallback
) {
  const result = await db.query(
    `
      SELECT data
      FROM app_data
      WHERE name = $1
    `,
    [file]
  );

  if (result.rows.length === 0) {
    return clone(fallback);
  }

  return result.rows[0].data;
}

export async function writeJson(
  file,
  data
) {
  await db.query(
    `
      INSERT INTO app_data (
        name,
        data,
        updated_at
      )
      VALUES ($1, $2::jsonb, NOW())

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
}

export async function updateJson(
  file,
  fallback,
  callback
) {
  const previous =
    locks.get(file) ||
    Promise.resolve();

  let result;

  const next = previous.then(
    async () => {
      const client =
        await db.connect();

      try {
        await client.query(
          "BEGIN"
        );

        const query =
          await client.query(
            `
              SELECT data
              FROM app_data
              WHERE name = $1
              FOR UPDATE
            `,
            [file]
          );

        let data;

        if (
          query.rows.length === 0
        ) {
          data = clone(fallback);
        } else {
          data =
            query.rows[0].data;
        }

        result =
          await callback(data);

        await client.query(
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

        await client.query(
          "COMMIT"
        );

      } catch (error) {
        await client.query(
          "ROLLBACK"
        );

        throw error;

      } finally {
        client.release();
      }
    }
  );

  locks.set(
    file,
    next.catch(() => {})
  );

  await next;

  return result;
}