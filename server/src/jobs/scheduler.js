'use strict';

const cron = require('node-cron');
const config = require('../config');
const { ejecutar } = require('./cumpleanos');

function iniciar() {
  if (!cron.validate(config.cronCumpleanos)) {
    console.error(`[scheduler] CRON_CUMPLEANOS inválido: "${config.cronCumpleanos}" — el job NO quedó programado`);
    return;
  }
  cron.schedule(
    config.cronCumpleanos,
    () => {
      console.log('[scheduler] disparando job de cumpleaños');
      ejecutar().catch((err) => console.error('[scheduler] error en job:', err.message));
    },
    { timezone: config.tz }
  );
  console.log(`[scheduler] job de cumpleaños programado (${config.cronCumpleanos}, ${config.tz})`);
}

module.exports = { iniciar };
