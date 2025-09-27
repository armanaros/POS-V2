// Lightweight logger that silences debug/info logs in production
const isProd = process.env.NODE_ENV === 'production';
const logger = {
  debug: (...args) => { if (!isProd) console.debug(...args); },
  info: (...args) => { if (!isProd) console.info(...args); },
  log: (...args) => { if (!isProd) console.log(...args); },
  warn: (...args) => { console.warn(...args); },
  error: (...args) => { console.error(...args); }
};

export default logger;
