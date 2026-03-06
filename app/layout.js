import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '../lib/theme-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'TradingVerse — Trade with context. Learn from the best.',
  description: 'Financial education, trading intelligence, and AI-powered tools for Indian retail traders.',
}

const envLabel = process.env.NEXT_PUBLIC_ENV_LABEL

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        {envLabel && (
          <footer style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid #e5e7eb', marginTop: '2rem' }}>
            <span style={{
              backgroundColor: envLabel === 'Staging' ? '#facc15' : '#22c55e',
              color: '#000',
              padding: '4px 8px',
              borderRadius: '4px',
              fontWeight: 'bold',
            }}>
              {envLabel} Environment
            </span>
          </footer>
        )}
      </body>
    </html>
  )
}
