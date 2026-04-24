# AI-Powered Trade Analysis (Journal Intelligence)

This feature transforms the existing trading journal from a simple logger into an intelligent post-trade analysis system. It will capture the technical "why" behind every trade and provide objective AI-driven feedback.

## Objectives
1. **Bridge the "Plan vs. Reality" Gap**: Automatically compare user commentary with objective market data at trade time.
2. **Automate Discipline Tracking**: Assign adherence scores based on technical rule-following.
3. **Institutional-Grade Auditing**: Provide professional-level feedback using LLM trade reviews.

## Proposed System Architecture

### 1. The Recorder (Technical Snapshotting)
When a trade is completed or logged, the system captures a "Technical Black Box" (JSONB) containing:
- **Structure**: Trend (Bullish/Bearish), EMA alignment, distance from VWAP.
- **Station**: S/R zones being tested, BOS (Break of Structure) status.
- **Pattern**: Candle signals (Engulfing, Pinbars) and volume expansion.
- **Market Vibe**: VIX and Sector sentiment at execution time.

### 2. The Database (Persistent IQ)
- **Column**: `snapshot` (JSONB) added to `journal_trades`.
- **Purpose**: Stores the technical context permanently so past trades can be audited even months later.

### 3. The Auditor (AI Feedback Engine)
A specialized API that feeds:
- `Technical Snapshot`
- `User Commentary`
- `Trade PnL / Outcome`
Into an LLM (GPT-4/similar) with a **"Prop Desk Risk Manager"** persona.

**Example Narrative Check**:
- *User Log*: "Entered on support retest."
- *Reality Check*: "System shows price was actually midway between zones, and RSI was 78 (Overbought)."
- *Audit Result*: "Discipline Warning: Trade was a FOMO chase, not a support retest. Adherence Score: 3/10."

## Implementation Roadmap

### Phase 1: Context Recording
- Upgrade DB schema with `snapshot` column.
- Integrate `IntelligenceManager` calls into the journal's save logic.

### Phase 2: Technical Visualization
- Show "Snapshot Badges" in the journal (e.g., "🎯 At Support", "🚀 Momentum Chase").
- Allow users to view the raw technical context that was present at entry.

### Phase 3: AI Auditing & Charges Integration
- Implement the "Consult AI Coach" button.
- **Brokerage Fetching**: Implement a "Fetch Session Charges" feature that pulls real GST, STT, and Brokerage from the Zerodha API and records them against each trade.
- Display structured feedback (Strengths, Weaknesses, Lessons).
- Calculate "Real Net P&L" (Gross P&L - Total Charges).
