# Goal Description

The objective is to implement "Point and Figure" (P&F) charts within TradingVerse's existing chart environment. Since TradingVerse uses `lightweight-charts` (version 4+), we will utilize its **Custom Series API** to render the X and O columns natively on the canvas. 

P&F charts filter out time and noise, focusing solely on price movements. We need a dynamic engine to convert standard OHLC data into P&F columns based on configurable "Box Size" and "Reversal" settings.

## Proposed Changes

---

### `app/lib/chart/point-and-figure-engine.js` [NEW]
- **P&F Calculation Engine**: A utility to transform raw time-series OHLC data into P&F columns.
  - **Inputs**: `ohlcData` array, `boxSizeType` (ATR or Absolute), `boxSizeValue`, `reversalAmount` (default: 3).
  - **Logic**: Use the High/Low method. If in an X column, look at High to add X's; if it fails to add an X, check Low for a reversal (3 * box size).
  - **Output**: Array of `{ time, open, high, low, close, columnType: 'X' | 'O', startPrice, endPrice }`. To conform to `lightweight-charts`, the item maps to a standard CustomData object with time.

### `app/lib/chart/point-and-figure-renderer.js` [NEW]
- **Custom Series Renderer**: Implement `ICustomSeriesPaneRenderer` and `ICustomSeriesPaneView` interfaces from `lightweight-charts`.
  - Draw intersecting lines forming an "X" for bullish rising columns.
  - Draw circles "O" for bearish falling columns.
  - Use `priceToCoordinate` API to accurately map the box price levels to Y-axis pixels on the chart.
  - Implement dynamic bar spacing so boxes don't overlap when zooming.

### `app/components/ChartHeader.js` or UI Selectors [MODIFY]
- **Chart Type Toggle**: Add a "Point & Figure" option to the chart type selector (Candlesticks, Line, Heikin Ashi, P&F).
- **P&F Settings UI**: When P&F is active, show inputs for the **Box Size** and **Reversal Amount**.

### `app/chart/page.js` & `app/trades/page.js` [MODIFY]
- **Data Hooking**: When P&F is selected, pass the fetched historical OHLC data through the `point-and-figure-engine.js`.
- **Series Rendering**: `chart.addCustomSeries(...)` replacing the standard `addCandlestickSeries()`.

## Open Questions

> [!WARNING]  
> 1. **Timeframe Source**: For intraday P&F, do you want to calculate boxes based on 1-minute timeframe data for maximum precision, or just use the current chart's timeframe (e.g., 5m/15m OHLC)? 
> 2. **Box Size Defaults**: Should we default to a Traditional fixed absolute box size based on the index (e.g., Nifty = 10, BankNifty = 50), or use an ATR percentage?
> 3. Does the P&F chart need to support real-time ticking (updating the last column dynamically on every LTP tick), or is it sufficient to calculate it statically from the completed candlestick data?

## Verification Plan

### Automated/Manual Verification
- Enable P&F mode on `NIFTY` with a `10` Box Size and `3` Reversal.
- Visually verify that X's and O's correspond properly to the underlying price swings.
- Scroll and zoom to verify that the Custom Series Renderer correctly scales coordinates without bleeding or detaching from the axes.
- Apply overlays (like VWAP or SMA) and verify they overlay accurately alongside the P&F time axis.
