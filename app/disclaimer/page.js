import Link from 'next/link'
import Nav from '../components/Nav'

export const metadata = {
  title: 'Disclaimer — TradingVerse',
  description: 'Legal disclaimer and terms of use for TradingVerse. All information is for educational purposes only and not financial advice.',
}

function Section({ title, children }) {
  return (
    <section className="pb-8 border-b border-slate-200 dark:border-white/8 last:border-0 last:pb-0">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{title}</h2>
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-7">
        {children}
      </div>
    </section>
  )
}

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-white">
      <Nav />

      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded-full">Legal</span>
          </div>
          <h1 className="text-4xl font-black mb-4">Disclaimer</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Last updated: March 2026. By accessing tradingverse.in or any of its features, you have read, understood, and agree to be legally bound by the terms below.
          </p>
        </div>

        {/* Highlight box */}
        <div className="mb-10 p-5 rounded-2xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/10">
          <p className="text-amber-800 dark:text-amber-300 text-sm font-semibold leading-7">
            TradingVerse is an informational and educational platform. Nothing on this site constitutes financial advice, investment recommendations, or solicitation to buy or sell any securities. All trading and investment decisions are solely your own responsibility.
          </p>
        </div>

        <div className="space-y-8">

          <Section title="General Disclaimer">
            <p>
              tradingverse.in has taken due care in the compilation of data, tools, and analysis features on its platform. The views, analysis, and information expressed or generated on tradingverse.in are for informational purposes only and are not that of a registered financial advisor, broker, or investment manager.
            </p>
            <p>
              tradingverse.in advises users to check with SEBI-registered experts or certified financial planners before taking any investment decision. tradingverse.in does not guarantee the accuracy, adequacy, or completeness of any information and is not responsible for any errors, omissions, or for the results obtained from the use of such information.
            </p>
            <p>
              tradingverse.in expressly states that it has no financial liability whatsoever to any user on account of the use of information provided on its website.
            </p>
          </Section>

          <Section title="AI Tools Disclaimer">
            <p>
              TradingVerse uses AI-powered tools including Chart Analyser, Connect the Dots (Strategic View), Market Commentary, Scenario Synthesis, and Behavioural Agents. These tools are for informational and educational purposes only and must not be considered as investment advice.
            </p>
            <p>
              AI-generated analysis is based on pattern recognition, publicly available data, and probabilistic modelling. It may not be accurate, complete, or up-to-date. Market conditions change rapidly and AI models have knowledge cutoffs that may not reflect the latest developments.
            </p>
            <p>
              You should not rely solely on AI-generated analysis to make investment decisions. tradingverse.in is not responsible for any losses or damages arising from the use of its AI tools. All investment decisions should be made with the help of a qualified and registered financial advisor.
            </p>
          </Section>

          <Section title="Trading Terminal & Order Execution">
            <p>
              TradingVerse provides a trading terminal that connects to your Zerodha Kite account via the official Kite API. tradingverse.in acts as a front-end interface only and does not execute trades on its own infrastructure. All orders are placed through your broker (Zerodha) and are subject to their terms, conditions, and regulations.
            </p>
            <p>
              tradingverse.in is not responsible for order execution failures, API downtime, slippage, or any other issues arising from broker-side systems. You are solely responsible for verifying all orders before and after placement.
            </p>
          </Section>

          <Section title="Futures & Options (F&O) Trading">
            <p>
              F&O trading is a high-risk activity and is not suitable for all investors. You should be fully aware of the risks involved before you start trading derivatives. You may lose more than your initial investment. Leverage amplifies both gains and losses.
            </p>
            <p>
              tradingverse.in is not responsible for any losses or damages arising from your F&O trading activity using information, analysis, or tools available on this platform. We strongly recommend that you consult with a qualified financial advisor and understand the full risk profile before trading in futures and options.
            </p>
            <p>
              Any F&O-related data, option chain analysis, or scenario modelling on TradingVerse is purely for informational and educational purposes and does not constitute a trading call or recommendation.
            </p>
          </Section>

          <Section title="Market Data & Charts">
            <p>
              Market data, prices, charts, and related information displayed on tradingverse.in are sourced from third-party providers including Zerodha Kite API and Yahoo Finance. This data may be delayed, incomplete, or temporarily unavailable. tradingverse.in does not warrant the accuracy or timeliness of any market data.
            </p>
            <p>
              Historical performance of any instrument shown on this platform is not indicative of future results. Chart patterns, technical indicators, and AI analysis are probabilistic tools — not guarantees of future price movement.
            </p>
          </Section>

          <Section title="User-Saved Content">
            <p>
              TradingVerse allows users to save chart analyses, strategic view reports, and trade notes locally. This content is stored in your browser's local storage and is not shared with other users. tradingverse.in accepts no responsibility for the accuracy of user-saved content or any actions taken based on it.
            </p>
          </Section>

          <Section title="No Financial Advice">
            <p>
              tradingverse.in and its owners, employees, and associates are not licensed to provide investment advice. No material on tradingverse.in — whether generated by AI, written by the platform, or submitted by users — should be taken as investment advice, directly or indirectly.
            </p>
            <p>
              Past performance is not indicative of future returns. Any predictions, scenarios, or probability-based analysis on this platform may prove to be incorrect. Users are expected to refer to other investment resources and consult qualified advisors to verify information independently.
            </p>
            <p>
              You, and not tradingverse.in, assume the entire cost and risk of any trading you choose to undertake. You are solely responsible for making your own investment decisions.
            </p>
          </Section>

          <Section title="Third-Party Links & Services">
            <p>
              tradingverse.in may contain links to third-party websites, data sources, or services. These linked sites are not under our control and we are not responsible for their content, accuracy, or availability. The inclusion of any link does not imply endorsement by tradingverse.in.
            </p>
          </Section>

          <Section title="Jurisdiction">
            <p>
              tradingverse.in is intended for users in the territory of India and is subject to Indian law. We consider ourselves subject to the jurisdiction of the courts of India. Although access is not denied to users outside India, tradingverse.in shall have no legal liabilities whatsoever under the laws of any jurisdiction other than India.
            </p>
            <p>
              We reserve the right to make changes to this disclaimer and our terms at any time. Continued use of the platform constitutes acceptance of any such changes.
            </p>
          </Section>

        </div>

        {/* Footer links */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-white/8 flex items-center justify-between">
          <Link href="/" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-semibold transition-colors">
            ← Home
          </Link>
          <p className="text-xs text-slate-400 dark:text-slate-600">© 2026 TradingVerse. All rights reserved.</p>
        </div>

      </div>
    </div>
  )
}
