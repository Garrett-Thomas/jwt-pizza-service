const config = require('./config.js');

const REDACTED = '*****';

// Object keys whose values are never logged.
const SENSITIVE_KEY = /password|token|jwt|secret|api[-_]?key|authorization|credential/i;

// Secrets that can show up inside free text such as SQL, header values and non-JSON bodies.
const SENSITIVE_PATTERNS = [
  [/Bearer\s+[\w.~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  [/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, REDACTED],
  [/(password\s*=\s*)'[^']*'/gi, `$1'${REDACTED}'`],
];

function sanitize(value) {
  if (typeof value === 'string') {
    return SENSITIVE_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : sanitize(val)]));
  }
  return value;
}

class Logger {
  log(level, type, data) {
    const entry = sanitize(data);
    return this.send({
      streams: [
        {
          stream: { component: config.logging?.source ?? 'jwt-pizza-service', level, type },
          // Loki wants nanoseconds since the epoch, as a string.
          values: [[(BigInt(Date.now()) * 1000000n).toString(), JSON.stringify(entry)]],
        },
      ],
    });
  }

  // Never throws or rejects, so a Grafana outage can't break a request.
  send(event) {
    // Only send when Grafana is configured, and never from tests.
    if (!config.logging || process.env.NODE_ENV === 'test') {
      return Promise.resolve();
    }
    const { endpointUrl, accountId, apiKey } = config.logging;
    const credentials = Buffer.from(`${accountId}:${apiKey}`).toString('base64');
    return fetch(endpointUrl, {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
    })
      .then((res) => {
        if (!res.ok) console.log('Failed to send log to Grafana', res.status);
      })
      .catch((err) => console.log('Failed to send log to Grafana', err.message));
  }
}

const logger = new Logger();
module.exports = logger;
module.exports.sanitize = sanitize;
