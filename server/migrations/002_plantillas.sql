-- 002_plantillas.sql — plantillas de imagen con posición del nombre configurable

CREATE TABLE IF NOT EXISTS plantillas (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  archivo        TEXT NOT NULL,               -- ruta absoluta del archivo de imagen
  ancho          INTEGER NOT NULL DEFAULT 0,
  alto           INTEGER NOT NULL DEFAULT 0,
  activa         BOOLEAN NOT NULL DEFAULT false,
  -- Posición del nombre, relativa al tamaño de la imagen (0..1)
  nombre_x       REAL NOT NULL DEFAULT 0.5,
  nombre_y       REAL NOT NULL DEFAULT 0.7,
  nombre_size    REAL NOT NULL DEFAULT 0.04,
  nombre_color   TEXT NOT NULL DEFAULT '#1b2a6b',
  fuente         TEXT NOT NULL DEFAULT 'NotoSerif-Bold',
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo una plantilla activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plantillas_activa
  ON plantillas (activa) WHERE activa;
