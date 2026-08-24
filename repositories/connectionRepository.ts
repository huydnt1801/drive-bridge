import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataFilePath } from "@/lib/env";
import type { DriveConnection } from "@/types/drive";

interface Store { version: 1; connections: DriveConnection[] }
const EMPTY: Store = { version: 1, connections: [] };
let writeQueue: Promise<void> = Promise.resolve();

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(path.resolve(dataFilePath()), "utf8")) as Store;
    if (parsed.version !== 1 || !Array.isArray(parsed.connections)) throw new Error("Unsupported data file format");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY;
    throw new Error(`Cannot read Driver Bridge data file: ${(error as Error).message}`);
  }
}

async function mutate(mutator: (store: Store) => void): Promise<void> {
  const operation = writeQueue.then(async () => {
    const file = path.resolve(dataFilePath());
    const store = await readStore();
    mutator(store);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, file);
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export const connectionRepository = {
  list: async () => (await readStore()).connections,
  get: async (id: string) => (await readStore()).connections.find((item) => item.id === id),
  add: async (connection: DriveConnection) => mutate((store) => { store.connections.push(connection); }),
  remove: async (id: string) => mutate((store) => { store.connections = store.connections.filter((item) => item.id !== id); }),
};
