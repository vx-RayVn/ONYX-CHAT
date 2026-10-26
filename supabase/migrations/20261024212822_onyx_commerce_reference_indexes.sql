create index billing_orders_product_idx on private.billing_orders(sku);
create index server_promotions_order_idx on private.server_promotions(order_id);
create index server_promotions_product_idx on private.server_promotions(sku);
