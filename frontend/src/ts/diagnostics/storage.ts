import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { DiagnosticSession } from "./types";

const DB_NAME = "typing-diagnostics-db";
const DB_VERSION = 1;
const MAX_STORED_SESSIONS = 500;

type DiagnosticsDB = DBSchema & {
  sessions: {
    key: string;
    value: DiagnosticSession;
    indexes: { "by-timestamp": number };
  };
};

let dbPromise: Promise<IDBPDatabase<DiagnosticsDB>> | undefined;

async function getDb(): Promise<IDBPDatabase<DiagnosticsDB>> {
  dbPromise ??= openDB<DiagnosticsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const sessions = db.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("by-timestamp", "timestamp");
    },
  });
  return dbPromise;
}

async function pruneOldSessions(
  db: IDBPDatabase<DiagnosticsDB>,
): Promise<void> {
  const count = await db.count("sessions");
  let remaining = count - MAX_STORED_SESSIONS;
  if (remaining <= 0) return;

  const transaction = db.transaction("sessions", "readwrite");
  let cursor = await transaction.store.index("by-timestamp").openCursor();
  while (cursor !== null && remaining > 0) {
    await cursor.delete();
    remaining--;
    cursor = await cursor.continue();
  }
  await transaction.done;
}

export async function storeDiagnosticSession(
  session: DiagnosticSession,
): Promise<void> {
  const db = await getDb();
  await db.put("sessions", session);
  await pruneOldSessions(db);
}

export async function getDiagnosticSessions(): Promise<DiagnosticSession[]> {
  const db = await getDb();
  return db.getAllFromIndex("sessions", "by-timestamp");
}
