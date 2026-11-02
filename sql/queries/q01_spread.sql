-- Q01: Bid-ask spread by security
-- Average, minimum and maximum quoted spread per security, in rupees and in basis points of the mid price.
SELECT ticker,
       count(*)                                                                    AS quotes,
       round(avg(ask_price - bid_price), 4)                                        AS avg_spread,
       round(min(ask_price - bid_price), 4)                                        AS min_spread,
       round(max(ask_price - bid_price), 4)                                        AS max_spread,
       round(avg((ask_price - bid_price) / ((ask_price + bid_price) / 2)) * 10000, 2) AS avg_spread_bps
FROM market_quote
GROUP BY ticker
ORDER BY avg_spread_bps DESC;
