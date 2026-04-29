'use strict';

class RateLimiter {
  constructor(windowMs, max) {
    this._window = windowMs;
    this._max = max;
    this._counts = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const entry = this._counts.get(key);

    if (!entry || now > entry.resetAt) {
      this._counts.set(key, { count: 1, resetAt: now + this._window });
      return true;
    }

    console.log('Ip:' + key + ' Count:' + entry.count);

    if (entry.count >= this._max) {
      return false;
    }

    entry.count++;
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [k, e] of this._counts) {
      if (now > e.resetAt) {
        this._counts.delete(k);
      }
    }
  }
}

module.exports = RateLimiter;
