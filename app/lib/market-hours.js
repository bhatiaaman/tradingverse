// NSE market hours: Mon–Fri, 9:15 AM – 3:30 PM IST
export function isMarketHours() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const day = ist.getUTCDay() // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false
  const total = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return total >= 555 && total <= 930 // 9:15 = 555 min, 15:30 = 930 min
}
