const requests = { total: 0, GET: 0, PUT: 0, POST: 0, DELETE: 0 };

function recordRequest(method) {
  requests.total++;
  // Other methods (OPTIONS, HEAD, ...) only count toward the total.
  if (method in requests) {
    requests[method]++;
  }
}

module.exports = { requests, recordRequest };
