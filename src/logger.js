const { AsyncLocalStorage } = require('async_hooks');
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

// Queries that touch these columns have all of their parameters redacted.
const SENSITIVE_SQL = /password|token/i;

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

function levelFor(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

// res.json hands res.send a serialized string, so parse it to let sanitize see the keys.
function parseBody(body) {
  const text = Buffer.isBuffer(body) ? body.toString() : body;
  if (typeof text !== 'string') return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class Logger {
  // Carries the current request to code that has no access to it, like the database layer.
  requestContext = new AsyncLocalStorage();

  // Express middleware. Install after express.json() so the request body is available.
  httpLogger = (req, res, next) => {
    let responseBody;
    const send = res.send;
    res.send = (body) => {
      responseBody = body;
      return send.call(res, body);
    };

    res.on('finish', () => {
      this.log(levelFor(res.statusCode), 'http', {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        hasAuthHeader: Boolean(req.headers.authorization),
        user: this.userOf(req),
        requestBody: req.body,
        responseBody: parseBody(responseBody),
      });
    });

    this.requestContext.run({ req }, next);
  };

  dbLogger(sql, params) {
    return this.log('info', 'db', {
      user: this.userOf(),
      sql,
      params: SENSITIVE_SQL.test(sql) && params?.length ? params.map(() => REDACTED) : params,
    });
  }

  factoryLogger(requestBody, responseBody, statusCode) {
    return this.log(levelFor(statusCode), 'factory', { user: this.userOf(), statusCode, requestBody, responseBody });
  }

  // `err.statusCode` is only set for errors the app threw on purpose, so those are warnings.
  unhandledErrorLogger(err) {
    return this.log(levelFor(err.statusCode ?? 500), 'exception', { user: this.userOf(), message: err.message, statusCode: err.statusCode, stack: err.stack });
  }

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

  userOf(req = this.requestContext.getStore()?.req) {
    return req?.user ? { id: req.user.id, name: req.user.name, email: req.user.email } : undefined;
  }
}

const logger = new Logger();
module.exports = logger;
module.exports.sanitize = sanitize;
