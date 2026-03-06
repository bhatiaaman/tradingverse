export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">TradingVerse</h1>
        <p className="text-gray-400 text-lg">Trade with context. Learn from the best.</p>
        <div className="mt-8 flex gap-4 justify-center">
          <a href="/terminal" className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Terminal</a>
          <a href="/orders" className="px-6 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">Order Intelligence</a>
        </div>
      </div>
    </main>
  )
}
