// Web Audio API sound alerts — no external library needed

let ctx = null

function getCtx() {
  if (!ctx && typeof window !== 'undefined') {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return ctx
}

function playTone({ freq, duration = 0.12, gain = 0.18, type = 'sine', delay = 0 }) {
  const ac = getCtx()
  if (!ac) return
  const osc = ac.createOscillator()
  const g   = ac.createGain()
  osc.connect(g)
  g.connect(ac.destination)
  osc.type      = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, ac.currentTime + delay)
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + delay + 0.015)
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration)
  osc.start(ac.currentTime + delay)
  osc.stop(ac.currentTime + delay + duration + 0.02)
}

/**
 * Bias flipped to BULLISH — ascending two-tone (hopeful, upward)
 */
export function playBullishFlip() {
  playTone({ freq: 440, duration: 0.14, gain: 0.16 })
  playTone({ freq: 660, duration: 0.18, gain: 0.20, delay: 0.12 })
}

/**
 * Bias flipped to BEARISH — descending two-tone (warning, downward)
 */
export function playBearishFlip() {
  playTone({ freq: 600, duration: 0.14, gain: 0.16 })
  playTone({ freq: 380, duration: 0.20, gain: 0.18, delay: 0.12 })
}

/**
 * High-confidence reversal zone — triple pulse (urgent alert)
 */
export function playReversalAlert() {
  playTone({ freq: 880, duration: 0.09, gain: 0.22, delay: 0.00 })
  playTone({ freq: 880, duration: 0.09, gain: 0.22, delay: 0.14 })
  playTone({ freq: 1100, duration: 0.14, gain: 0.26, delay: 0.28 })
}

/**
 * New warning added — single soft ping
 */
export function playWarningPing() {
  playTone({ freq: 520, duration: 0.25, gain: 0.12, type: 'triangle' })
}

/**
 * Bias unchanged but reversal building (medium confidence) — gentle double tap
 */
export function playReversalBuilding() {
  playTone({ freq: 660, duration: 0.10, gain: 0.12, delay: 0.00 })
  playTone({ freq: 660, duration: 0.10, gain: 0.10, delay: 0.18 })
}

/**
 * Intraday sentiment crossed the 50 neutral line — gentle two-tone
 * UP: ascending (crossing into bullish territory)
 * DOWN: descending (crossing into bearish territory)
 */
export function playSentiment50Cross(direction) {
  if (direction === 'UP') {
    playTone({ freq: 500, duration: 0.16, gain: 0.12, type: 'sine' })
    playTone({ freq: 700, duration: 0.16, gain: 0.12, type: 'sine', delay: 0.14 })
  } else {
    playTone({ freq: 500, duration: 0.16, gain: 0.12, type: 'sine' })
    playTone({ freq: 340, duration: 0.20, gain: 0.12, type: 'sine', delay: 0.14 })
  }
}

/**
 * Order executed (COMPLETE) — loud, distinct three-tone confirmation
 * High gain so it cuts through even with speakers at medium volume
 */
export function playOrderExecuted() {
  playTone({ freq: 523, duration: 0.10, gain: 0.55, type: 'square', delay: 0.00 })  // C5
  playTone({ freq: 659, duration: 0.10, gain: 0.55, type: 'square', delay: 0.12 })  // E5
  playTone({ freq: 784, duration: 0.20, gain: 0.60, type: 'square', delay: 0.24 })  // G5
}
