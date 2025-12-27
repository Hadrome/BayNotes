-- schema.sql 内容
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS folders;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    salt TEXT,
    role TEXT DEFAULT 'user',
    permissions TEXT DEFAULT 'all',
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    folder_id TEXT,
    title TEXT,
    content TEXT,
    is_encrypted INTEGER DEFAULT 0,
    share_id TEXT UNIQUE,
    share_pwd TEXT,
    share_expire_at INTEGER,
    share_burn_after_read INTEGER DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_id TEXT,
    name TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_share ON notes(share_id);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
