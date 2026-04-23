Automated Trading Execution Plan: Kite API Integration
This document outlines the technical requirements for building a semi-automated trading dashboard that executes orders based on a curated JSON watchlist.

1. Core Logic & Calculations
Risk Management Formula
To maintain a fixed risk of ₹2,100 per trade, the quantity must be calculated dynamically:

Calculation: Quantity = Floor( 2100 / abs( Entry_Price - Stop_Loss ) )

Rounding: Always round down to the nearest integer to ensure the risk stays under or equal to ₹2,100.

Order Type
Type: SL (Stop Loss Limit) or SL-M (Stop Loss Market).

Purpose: To ensure the order only triggers when the Breakout Level is touched.

3. UI Requirements (The Dialogue)
The interface should display the following for the user to review before clicking "Execute":

Sorting: Sort stocks by Conviction (High > Medium-High > Medium).

Display Fields:

Checkbox: User must manually select which stocks to "Activate."

Symbol & Conviction: Clear visual hierarchy.

Direction: Green text for 'LONG', Red text for 'SHORT'.

Calculated Qty: Display the qty so the user knows the capital required.

Action Button: A single "Execute Selected" button to fire the API calls.

4. Pre-Market Workflow (April 23, 2026)
08:45 AM: Authenticate Kite API and generate access_token.

09:05 AM: Load the provided JSON.

09:10 AM: Review the selection. Uncheck any stock that is gapping too far beyond the entry price (more than 0.5% away).

09:14 AM: Click "Execute."