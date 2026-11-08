const requests = { total: 0, GET: 0, PUT: 0, POST: 0, DELETE: 0 };

function recordRequest(method) {
  requests.total++;
  // Other methods (OPTIONS, HEAD, ...) only count toward the total.
  if (method in requests) {
    requests[method]++;
  }
}

// Running sum/count/max since the last flush, so each interval reports its own average.
const endpointLatency = { sum: 0, count: 0, max: 0 };

function recordEndpointLatency(ms) {
  endpointLatency.sum += ms;
  endpointLatency.count++;
  endpointLatency.max = Math.max(endpointLatency.max, ms);
}

module.exports = { requests, recordRequest, endpointLatency, recordEndpointLatency };
