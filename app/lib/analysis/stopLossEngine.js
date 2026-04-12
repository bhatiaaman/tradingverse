/**
 * Stop Loss (Liquidity) Cluster Engine
 * Identifies high-probability liquidity zones (BSL/SSL) using multi-timeframe analysis and options data.
 * Built for Nifty / Tradingverse
 */

export class StopLossEngine {
    constructor(config = {}) {
        this.proximityTolerance = config.proximityTolerance || 15; // Points range to consider levels matching
        this.clusterMaxRange = config.clusterMaxRange || 50; // Max points breadth for a single clustered zone
        this.roundNumberStep = config.roundNumberStep || 500; // E.g., 22000, 22500
    }

    /**
     * Identifies swing/pivot highs and lows from an array of candles
     */
    extractPivots(candles, leftBars = 5, rightBars = 5, timeframe = "1D") {
        const highs = [];
        const lows = [];

        for (let i = leftBars; i < candles.length - rightBars; i++) {
            let isHigh = true;
            let isLow = true;
            
            const currentHigh = candles[i].high;
            const currentLow = candles[i].low;

            for (let j = i - leftBars; j <= i + rightBars; j++) {
                if (i === j) continue;
                if (candles[j].high >= currentHigh) isHigh = false;
                if (candles[j].low <= currentLow) isLow = false;
            }

            if (isHigh) {
                highs.push({ price: currentHigh, type: "Swing High", timeframe, timestamp: candles[i].timestamp });
            }
            if (isLow) {
                lows.push({ price: currentLow, type: "Swing Low", timeframe, timestamp: candles[i].timestamp });
            }
        }
        
        return { highs, lows };
    }

    /**
     * Finds equal highs and lows
     */
    findEqualLevels(pivots, typePrefix) {
        const equalLevels = [];
        const used = new Set();

        for (let i = 0; i < pivots.length; i++) {
            if (used.has(i)) continue;
            
            let matches = [pivots[i]];
            for (let j = i + 1; j < pivots.length; j++) {
                if (!used.has(j) && Math.abs(pivots[i].price - pivots[j].price) <= this.proximityTolerance) {
                    matches.push(pivots[j]);
                    used.add(j);
                }
            }

            if (matches.length > 1) {
                const avgPrice = matches.reduce((sum, p) => sum + p.price, 0) / matches.length;
                equalLevels.push({
                    price: avgPrice,
                    type: `Equal ${typePrefix}`,
                    timeframe: matches[0].timeframe,
                    count: matches.length,
                    components: matches
                });
            }
        }
        return equalLevels;
    }

    /**
     * Main analysis method. Combines all levels and forms scored clusters.
     * maxDistancePct: only return clusters within this % of currentPrice (e.g. 0.03 = 3%)
     */
    buildClusters(params) {
        const { currentPrice, data15m = [], data1H = [], data1D = [], optionsData = [], maxDistancePct = null, minDistancePct = 0 } = params;
        
        let allLevels = [];

        // 1. Process Timeframes
        const processTimeframe = (data, tfLabel, pivotLength = 5) => {
            if (!data || data.length === 0) return;
            const { highs, lows } = this.extractPivots(data, pivotLength, pivotLength, tfLabel);
            
            // Add direct pivots
            allLevels.push(...highs.map(h => ({ ...h, side: "BSL" })));
            allLevels.push(...lows.map(l => ({ ...l, side: "SSL" })));

            // Find Equal Highs/Lows
            const equalHighs = this.findEqualLevels(highs, "Highs");
            const equalLows = this.findEqualLevels(lows, "Lows");
            
            allLevels.push(...equalHighs.map(h => ({ ...h, side: "BSL" })));
            allLevels.push(...equalLows.map(l => ({ ...l, side: "SSL" })));
        };

        // Use different lookbacks for different timeframes
        processTimeframe(data1D, "1D", 3);
        processTimeframe(data1H, "1H", 5);
        processTimeframe(data15m, "15m", 8);

        // 2. Options Data (Add massive OI zones as liquidity targets)
        if (optionsData && optionsData.length > 0) {
            const avgCallOI = optionsData.reduce((sum, d) => sum + d.callOI, 0) / optionsData.length || 0;
            const avgPutOI = optionsData.reduce((sum, d) => sum + d.putOI, 0) / optionsData.length || 0;
            
            optionsData.forEach(opt => {
                // If Call OI is significantly higher than average, it's a massive resistance zone (SLs sitting above)
                if (opt.callOI > avgCallOI * 1.5) {
                    allLevels.push({ price: opt.strike, type: "Heavy Call OI", timeframe: "Options", side: "BSL", value: opt.callOI });
                }
                if (opt.putOI > avgPutOI * 1.5) {
                    allLevels.push({ price: opt.strike, type: "Heavy Put OI", timeframe: "Options", side: "SSL", value: opt.putOI });
                }
            });
        }

        // 3. Round Numbers (Psychological Levels)
        if (currentPrice) {
             const baseTarget = Math.floor(currentPrice / this.roundNumberStep) * this.roundNumberStep;
             // Add levels around price
             for(let i = -2; i <= 2; i++) {
                 const level = baseTarget + (i * this.roundNumberStep);
                 allLevels.push({ price: level, type: "Psychological Round Number", timeframe: "General", side: level > currentPrice ? "BSL" : "SSL" });
             }
        }

        // 4. Cluster Formation
        const clusters = this._clusterize(allLevels);

        // 5. Reassign BSL/SSL at cluster level based on current price.
        //    Pivot sides are set at creation time relative to then-current price;
        //    after a large move a former swing low can now be ABOVE current price.
        clusters.forEach(cluster => {
            const mid  = (cluster.range.min + cluster.range.max) / 2;
            const side = mid >= currentPrice ? 'BSL' : 'SSL';
            cluster.side = side;
            cluster.components.forEach(c => { c.side = side; });
        });

        // 6. Score and Sort
        clusters.forEach(cluster => {
             cluster.score = this._calculateScore(cluster);
        });

        // Filter: min score + proximity bounds
        const minDist = currentPrice * minDistancePct;
        return clusters
            .filter(c => c.score >= 15)
            .filter(c => {
                const mid  = (c.range.min + c.range.max) / 2;
                const dist = Math.abs(mid - currentPrice);
                if (dist < minDist) return false;                          // too close — at-price noise
                if (maxDistancePct !== null && dist > currentPrice * maxDistancePct) return false; // too far
                return true;
            })
            .sort((a, b) => b.score - a.score);
    }

    _clusterize(levels) {
        // Sort levels by price to easily group proximity items
        const sorted = [...levels].sort((a, b) => a.price - b.price);
        const clusters = [];
        
        let currentCluster = [];
        
        for (let i = 0; i < sorted.length; i++) {
            const level = sorted[i];
            if (currentCluster.length === 0) {
                currentCluster.push(level);
            } else {
                const clusterMin = currentCluster[0].price;
                const clusterMax = currentCluster[currentCluster.length - 1].price;
                
                // Group if same liquidity side, and level is close enough to cluster
                if (level.side === currentCluster[0].side && 
                    (level.price - clusterMax) <= this.proximityTolerance && 
                    (level.price - clusterMin) <= this.clusterMaxRange) {
                    currentCluster.push(level);
                } else {
                    clusters.push(this._finalizeCluster(currentCluster));
                    currentCluster = [level];
                }
            }
        }
        
        if (currentCluster.length > 0) {
            clusters.push(this._finalizeCluster(currentCluster));
        }
        
        return clusters;
    }

    _finalizeCluster(levels) {
        // Find the absolute highest and lowest prices in this cluster to form a zone box
        return {
            side: levels[0].side,
            range: {
                min: Math.min(...levels.map(l => l.price)),
                max: Math.max(...levels.map(l => l.price))
            },
            components: levels
        };
    }

    _calculateScore(cluster) {
        let score = 0;
        const typesSeen = new Set();
        const timeframesSeen = new Set();
        
        cluster.components.forEach(comp => {
            // Weights based on timeframe importance
            if (comp.timeframe === "1D") score += 30;
            else if (comp.timeframe === "1H") score += 15;
            else if (comp.timeframe === "15m") score += 5;
            else if (comp.timeframe === "Options") score += 20;
            
            // Equal highs/lows are exceptionally powerful
            if (comp.type.includes("Equal")) {
                score += 15 * (comp.count || 2);
            }

            typesSeen.add(comp.type);
            timeframesSeen.add(comp.timeframe);
        });

        // Confluence multipliers
        if (timeframesSeen.has("1D") && timeframesSeen.has("15m")) {
            score += 25; // Massive confluence if 1D level aligns with 15m formation
        }
        
        if (timeframesSeen.has("Options") && typesSeen.size > 2) {
            score += 30; // Options OI aligns with technical levels
        }

        return score;
    }
}
