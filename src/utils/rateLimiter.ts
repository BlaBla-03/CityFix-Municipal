interface RateLimitEntry {
  attempts: number;
  lastAttempt: number;
  blockedUntil: number | null;
}

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
const ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds

class RateLimiter {
  private attempts: Map<string, RateLimitEntry> = new Map();

  isBlocked(ip: string): boolean {
    const entry = this.attempts.get(ip);
    if (!entry) return false;
    if (entry.blockedUntil && Date.now() < entry.blockedUntil) {
      return true;
    }
    // Reset if the attempt window has passed
    if (Date.now() - entry.lastAttempt > ATTEMPT_WINDOW) {
      this.attempts.delete(ip);
      return false;
    }
    return false;
  }

  recordAttempt(ip: string): { blocked: boolean; remainingAttempts: number } {
    const now = Date.now();
    const entry = this.attempts.get(ip) || { attempts: 0, lastAttempt: now, blockedUntil: null };
    // Reset if the attempt window has passed
    if (now - entry.lastAttempt > ATTEMPT_WINDOW) {
      entry.attempts = 0;
    }
    entry.attempts++;
    entry.lastAttempt = now;
    if (entry.attempts >= MAX_ATTEMPTS) {
      entry.blockedUntil = now + BLOCK_DURATION;
      this.attempts.set(ip, entry);
      return { blocked: true, remainingAttempts: 0 };
    }
    this.attempts.set(ip, entry);
    return { blocked: false, remainingAttempts: MAX_ATTEMPTS - entry.attempts };
  }

  getRemainingTime(ip: string): number {
    const entry = this.attempts.get(ip);
    if (!entry || !entry.blockedUntil) return 0;
    return Math.max(0, entry.blockedUntil - Date.now());
  }
}

export const rateLimiter = new RateLimiter(); 