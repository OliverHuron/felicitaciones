-- 003_ajustes.sql — ajustes editables desde el panel (clave/valor)

CREATE TABLE IF NOT EXISTS ajustes (
  clave          TEXT PRIMARY KEY,
  valor          TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
