// The "missing files" list: songs and versions whose audio file is gone (or was never added), kept so the owner can upload each one later.
// Stored as one JSON list in the D1 table kv (key "missing"). An item is { id, kind: "version" | "song", relId, trackId, title, release, label, oldVersionIds: [...], unhide }.
export async function loadMissing(db) {
  try { const r = await db.prepare("SELECT v FROM kv WHERE k = 'missing'").first(); const l = r ? JSON.parse(r.v) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
export async function saveMissing(db, list) {
  await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('missing', ?)").bind(JSON.stringify(list)).run();
}
