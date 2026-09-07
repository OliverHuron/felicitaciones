-- 001_initial.sql — esquema base de siaf-felicitaciones

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  usuario       TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profesores (
  id               SERIAL PRIMARY KEY,
  nombre           TEXT NOT NULL,
  apellidos        TEXT NOT NULL DEFAULT '',
  fecha_nacimiento DATE NOT NULL,
  telefono         TEXT,
  correo           TEXT,
  activo           BOOLEAN NOT NULL DEFAULT true,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Búsqueda por (mes, día) de cumpleaños entre profesores activos.
CREATE INDEX IF NOT EXISTS idx_profesores_cumple
  ON profesores ((EXTRACT(MONTH FROM fecha_nacimiento)), (EXTRACT(DAY FROM fecha_nacimiento)))
  WHERE activo;

-- Bitácora de envíos. El UNIQUE (profesor, canal, fecha_local) hace que el job
-- sea idempotente: si el proceso se reinicia el mismo día no vuelve a felicitar.
CREATE TABLE IF NOT EXISTS envios_log (
  id          SERIAL PRIMARY KEY,
  profesor_id INTEGER NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  canal       TEXT NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  estado      TEXT NOT NULL CHECK (estado IN ('ok', 'error', 'omitido')),
  detalle     TEXT,
  fecha_local DATE NOT NULL,
  enviado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profesor_id, canal, fecha_local)
);

CREATE INDEX IF NOT EXISTS idx_envios_log_fecha ON envios_log (fecha_local DESC);
