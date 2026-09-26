import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

const locks = new Map();

async function ensureFile(file, fallback) {
  await fs.mkdir(DATA_DIR, {
    recursive: true
  });

  const filePath = path.join(DATA_DIR, file);

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(
      filePath,
      JSON.stringify(fallback, null, 2),
      "utf8"
    );
  }

  return filePath;
}

export async function readJson(file, fallback) {
  const filePath = await ensureFile(
    file,
    fallback
  );

  try {
    const text = await fs.readFile(
      filePath,
      "utf8"
    );

    return JSON.parse(text);
  } catch {
    return structuredClone(fallback);
  }
}

export async function writeJson(file, data) {
  const filePath = await ensureFile(
    file,
    data
  );

  const previous =
    locks.get(file) || Promise.resolve();

  const next = previous.then(async () => {
    const tempPath = `${filePath}.tmp`;

    await fs.writeFile(
      tempPath,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    await fs.rename(
      tempPath,
      filePath
    );
  });

  locks.set(
    file,
    next.catch(() => {})
  );

  await next;
}

export async function updateJson(
  file,
  fallback,
  callback
) {
  const previous =
    locks.get(file) || Promise.resolve();

  let result;

  const next = previous.then(async () => {
    const filePath =
      await ensureFile(file, fallback);

    let data;

    try {
      data = JSON.parse(
        await fs.readFile(
          filePath,
          "utf8"
        )
      );
    } catch {
      data = structuredClone(fallback);
    }

    result = await callback(data);

    const tempPath = `${filePath}.tmp`;

    await fs.writeFile(
      tempPath,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    await fs.rename(
      tempPath,
      filePath
    );
  });

  locks.set(
    file,
    next.catch(() => {})
  );

  await next;

  return result;
}