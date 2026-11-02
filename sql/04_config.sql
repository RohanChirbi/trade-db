-- 04_config.sql : starting surveillance thresholds (tunable by the Compliance role from the app)
INSERT INTO surveillance_config (param_name, param_value, description) VALUES
 ('spread_multiple',        1.35, 'Flag a security-day whose average spread exceeds this multiple of that security''s overall average spread'),
 ('volume_spike_multiple', 12.0, 'Flag an hour whose traded volume exceeds this multiple of the security''s average hourly volume'),
 ('large_order_multiple',   5.0, 'Flag an order larger than this multiple of the average order size for its security'),
 ('spoof_min_cancels',      3.0, 'Minimum number of large, quickly cancelled limit orders in one day before a strategy is flagged for spoofing'),
 ('spoof_max_seconds',     10.0, 'An order cancelled within this many seconds of submission counts as quickly cancelled'),
 ('price_move_pct',         2.0, 'Flag a security whose price moves more than this percentage in a day'),
 ('cancel_rate_threshold',  0.5, 'Flag a security-day whose share of cancelled orders exceeds this fraction'),
 ('turnover_pct',          10.0, 'Flag a strategy whose daily traded value exceeds this percentage of its assigned capital');
