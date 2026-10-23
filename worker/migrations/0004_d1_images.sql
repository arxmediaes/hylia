CREATE TABLE IF NOT EXISTS image_objects (
  key TEXT PRIMARY KEY NOT NULL,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL CHECK (length(data) <= 1048576),
  created_at INTEGER NOT NULL
);
