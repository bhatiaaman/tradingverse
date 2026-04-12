import Nav from '../../components/Nav'
import WeeklyWatchlist from '../WeeklyWatchlist'

export const metadata = {
  title: 'Weekly Watchlist - TradingVerse',
}

export default function WeeklyWatchlistPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />
      {/* Container */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <WeeklyWatchlist />
      </div>
    </div>
  )
}
