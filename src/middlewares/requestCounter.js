const metrics = require('../metrics.js');

// Counts every incoming request by HTTP method, plus a running total.
function requestCounter(req, res, next) {
  metrics.recordRequest(req.method);
  next();
}

module.exports = requestCounter;
