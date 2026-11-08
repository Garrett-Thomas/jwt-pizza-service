const metrics = require('../metrics.js');

// Measures how long each request takes, from arrival until the response has been sent.
function latencyTracker(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    metrics.recordEndpointLatency(ms);
  });
  next();
}

module.exports = latencyTracker;
