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

// A user counts as active if they made an authenticated request within this window.
const ACTIVE_USER_WINDOW_MS = 5 * 60 * 1000;
const lastSeen = new Map();

function recordUserSeen(userId) {
  lastSeen.set(userId, Date.now());
}

function getActiveUserCount() {
  const cutoff = Date.now() - ACTIVE_USER_WINDOW_MS;
  // Prune expired entries here so the map doesn't grow forever.
  for (const [userId, seen] of lastSeen) {
    if (seen < cutoff) {
      lastSeen.delete(userId);
    }
  }
  return lastSeen.size;
}

module.exports = { requests, recordRequest, endpointLatency, recordEndpointLatency, recordUserSeen, getActiveUserCount };
