const metrics = require('../metrics.js');

// Marks the authenticated user (if any) as recently active. Must run after setAuthUser.
function activeUserTracker(req, res, next) {
  if (req.user) {
    metrics.recordUserSeen(req.user.id);
  }
  next();
}

module.exports = activeUserTracker;
