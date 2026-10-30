-- 04_config_seed.sql : starting surveillance thresholds (tunable by the Compliance role later)
INSERT INTO surveillance_config (param_name, param_value, description) VALUES
 ('spread_multiple',        2.0, 'Flag a security whose average spread exceeds this multiple of the market average'),
 ('volume_spike_multiple',  3.0, 'Flag interval volume above this multiple of the normal average volume'),
 ('large_order_multiple',   3.0, 'Flag an order larger than this multiple of the average order size for its security'),
 ('spoof_min_cancels',      3.0, 'Minimum number of large cancelled limit orders before a strategy is flagged for spoofing'),
 ('spoof_max_seconds',     10.0, 'An order cancelled within this many seconds of submission counts as quickly cancelled'),
 ('price_move_pct',         2.0, 'Flag a security whose price moves more than this percentage in a day'),
 ('cancel_rate_threshold',  0.5, 'Flag a security or strategy whose share of cancelled orders exceeds this fraction'),
 ('turnover_multiple',      5.0, 'Flag a strategy whose daily traded value exceeds this multiple of its assigned capital');