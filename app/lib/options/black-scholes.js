// ─── Black-Scholes Options Math ───────────────────────────────────────────────
// Pure JS — no external library. All computations server-safe (no browser APIs).
//
// Constants for Indian markets:
//   r = 6.5%  — RBI repo rate (risk-free rate)
//   q = 1.5%  — NIFTY dividend yield (standard assumption)
//
// All times (T, t) are in years (e.g. 7 days = 7/365).

const R_DEFAULT = 0.065;  // risk-free rate
const Q_DEFAULT = 0.015;  // dividend yield

// ── Normal distribution helpers ───────────────────────────────────────────────
// Abramowitz & Stegun approximation — max error 7.5×10⁻⁸
function normCDF(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t  = 1 / (1 + p * ax);
  const y  = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return 0.5 * (1 + sign * y);
}

function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ── d1/d2 ─────────────────────────────────────────────────────────────────────
function _d1d2(S, K, T, r, q, sigma) {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return { d1, d2, sqrtT };
}

// ── Black-Scholes option price ────────────────────────────────────────────────
function bsPrice(S, K, T, r, q, sigma, isCall) {
  if (T <= 0) return Math.max(0, isCall ? S - K : K - S);
  const { d1, d2 } = _d1d2(S, K, T, r, q, sigma);
  if (isCall) {
    return S * Math.exp(-q * T) * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  }
  return K * Math.exp(-r * T) * normCDF(-d2) - S * Math.exp(-q * T) * normCDF(-d1);
}

// ── Vega (shared between IV solver and Greeks) ────────────────────────────────
function bsVega(S, K, T, r, q, sigma) {
  if (T <= 0) return 0;
  const { d1, sqrtT } = _d1d2(S, K, T, r, q, sigma);
  return S * Math.exp(-q * T) * normPDF(d1) * sqrtT;
}

// ── IV solver — Newton-Raphson with bisection fallback ────────────────────────
// Returns implied volatility as a decimal (e.g. 0.142 = 14.2%), or null if unsolvable.
export function computeIV(marketPrice, S, K, T, r = R_DEFAULT, q = Q_DEFAULT, isCall = true) {
  if (!T || T <= 0 || !marketPrice || marketPrice <= 0 || !S || !K) return null;

  // Intrinsic value check — option can't be worth less than intrinsic
  const intrinsic = Math.max(0, isCall ? S - K : K - S);
  if (marketPrice < intrinsic * 0.999) return null;

  // Initial guess: Brenner-Subrahmanyam approximation
  let sigma = Math.sqrt(2 * Math.PI / T) * (marketPrice / S);
  sigma = Math.max(0.01, Math.min(sigma, 5.0));

  // Newton-Raphson (up to 100 iterations)
  for (let i = 0; i < 100; i++) {
    const price = bsPrice(S, K, T, r, q, sigma, isCall);
    const vega  = bsVega(S, K, T, r, q, sigma);
    const diff  = price - marketPrice;
    if (Math.abs(diff) < 0.0001) break;
    if (vega < 1e-10) { sigma = null; break; }
    sigma -= diff / vega;
    if (sigma <= 0) { sigma = 0.001; break; }
    if (sigma > 10) { sigma = 10; break; }
  }

  // Bisection fallback if NR produced nonsense
  if (!sigma || sigma < 0.001 || sigma > 5) {
    let lo = 0.001, hi = 5.0;
    for (let i = 0; i < 100; i++) {
      const mid   = (lo + hi) / 2;
      const price = bsPrice(S, K, T, r, q, mid, isCall);
      if (price > marketPrice) hi = mid; else lo = mid;
      if (hi - lo < 0.0001) { sigma = mid; break; }
    }
  }

  return (sigma > 0.001 && sigma < 5) ? sigma : null;
}

// ── Greeks ────────────────────────────────────────────────────────────────────
// Returns { delta, gamma, theta, vega, probITM, probOTM, d1, d2 }
// theta is per calendar day (divided by 365)
// vega  is per 1% change in IV (divided by 100)
export function computeGreeks(S, K, T, r = R_DEFAULT, q = Q_DEFAULT, sigma, isCall = true) {
  if (!sigma || sigma <= 0 || T <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, probITM: 0, probOTM: 1 };
  }

  const { d1, d2, sqrtT } = _d1d2(S, K, T, r, q, sigma);
  const expQT = Math.exp(-q * T);
  const expRT = Math.exp(-r * T);

  const delta  = isCall
    ? expQT * normCDF(d1)
    : -expQT * normCDF(-d1);

  const gamma  = expQT * normPDF(d1) / (S * sigma * sqrtT);

  // Theta (per year) — convert to per calendar day
  const thetaYear = isCall
    ? (-S * expQT * normPDF(d1) * sigma / (2 * sqrtT))
      - r * K * expRT * normCDF(d2)
      + q * S * expQT * normCDF(d1)
    : (-S * expQT * normPDF(d1) * sigma / (2 * sqrtT))
      + r * K * expRT * normCDF(-d2)
      - q * S * expQT * normCDF(-d1);
  const theta = thetaYear / 365;

  const vega   = S * expQT * normPDF(d1) * sqrtT / 100; // per 1% vol

  // Risk-neutral probability of finishing ITM (uses d2, not d1)
  const probITM = isCall ? normCDF(d2) : normCDF(-d2);

  return { delta, gamma, theta, vega, probITM, probOTM: 1 - probITM, d1, d2 };
}

// ── Probability of reaching price X at a specific future time t ───────────────
// Answers: "What's the probability Nifty is above/below X in t days?"
// direction: 'above' | 'below'
export function probAtTime(S, X, tDays, r = R_DEFAULT, q = Q_DEFAULT, sigma, direction = 'above') {
  if (!sigma || tDays <= 0 || !X || X <= 0) return null;
  const t    = tDays / 365;
  const sqrtT = Math.sqrt(t);
  const d     = (Math.log(S / X) + (r - q - 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  return direction === 'above' ? normCDF(d) : normCDF(-d);
}

// ── Probability of touching a level at ANY point before expiry ────────────────
// Uses the reflection principle for geometric Brownian motion.
// Works for both up-barriers (X > S) and down-barriers (X < S).
export function probTouch(S, X, T, r = R_DEFAULT, q = Q_DEFAULT, sigma) {
  if (!sigma || T <= 0 || !X || X <= 0 || X === S) return null;
  const nu   = r - q - 0.5 * sigma * sigma;   // risk-neutral drift
  const lnRatio = Math.log(X / S);             // negative for down-barrier
  const sqrtT   = Math.sqrt(T);
  const z1 = (lnRatio - nu * T) / (sigma * sqrtT);
  const z2 = (lnRatio + nu * T) / (sigma * sqrtT);
  const exp = Math.pow(X / S, 2 * nu / (sigma * sigma));
  const p   = normCDF(z1) + exp * normCDF(z2);
  return Math.min(1, Math.max(0, p));
}

// ── Expected move by expiry ───────────────────────────────────────────────────
// Returns 1σ expected range (68% confidence interval at expiry).
export function expectedMove(S, T, sigma) {
  if (!sigma || T <= 0) return null;
  const sqrtT  = Math.sqrt(T);
  const pct    = sigma * sqrtT;
  return {
    pct,                          // as decimal, e.g. 0.018 = 1.8%
    points:  Math.round(S * pct), // in index points
    upper:   S * Math.exp( sigma * sqrtT),
    lower:   S * Math.exp(-sigma * sqrtT),
  };
}

// ── Historical Volatility (HV) from daily closes ──────────────────────────────
// Returns annualised HV as a decimal (e.g. 0.142 = 14.2%).
export function computeHV(closes, days = 30) {
  if (!closes || closes.length < days + 1) return null;
  const recent  = closes.slice(-(days + 1));
  const returns = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] > 0) returns.push(Math.log(recent[i] / recent[i - 1]));
  }
  if (returns.length < 5) return null;
  const mean     = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * 252);
}

// ── Lognormal PDF — for distribution chart ────────────────────────────────────
// Returns probability density at price x given log-normal distribution at time T.
export function lognormalPDF(x, S, T, r = R_DEFAULT, q = Q_DEFAULT, sigma) {
  if (!sigma || T <= 0 || x <= 0) return 0;
  const mu   = Math.log(S) + (r - q - 0.5 * sigma * sigma) * T;
  const sigT = sigma * Math.sqrt(T);
  return Math.exp(-0.5 * ((Math.log(x) - mu) / sigT) ** 2) / (x * sigT * Math.sqrt(2 * Math.PI));
}

// ── Time to expiry in years ───────────────────────────────────────────────────
// expiryDate: 'YYYY-MM-DD' string
export function timeToExpiry(expiryDateStr) {
  const expiry  = new Date(expiryDateStr);
  const nowIST  = new Date(Date.now() + 5.5 * 3600 * 1000); // UTC → IST
  expiry.setHours(15, 30, 0, 0);  // Options expire at 3:30 PM IST
  const msLeft  = expiry.getTime() - nowIST.getTime();
  return Math.max(0, msLeft / (365 * 24 * 3600 * 1000));
}
