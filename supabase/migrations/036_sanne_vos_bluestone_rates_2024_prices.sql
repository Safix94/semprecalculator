-- Sanne Vos Bluestone m² rates: use the 2024 price list without discount.
--
-- Confirmed by Karsten on 2026-09-22: Sanne's sheet ("B - vos CHD") still
-- prices every row from column I (m² price 2024). The 04/2026 +3 % column (J)
-- exists in the sheet but is not wired into the final price. Migration 032
-- seeded the 04/2026 prices with a 3 % discount (e.g. 205 → 198.85), which
-- came within 0.1 % of her numbers but not exactly. This restores column I.

with rates(shape_kind, thickness_cm, surface_type, base_price_per_m2_eur) as (
  values
    ('straight', 2::numeric, 'sanded', 91::numeric),
    ('straight', 3::numeric, 'sanded', 134::numeric),
    ('straight', 4::numeric, 'sanded', 199::numeric),
    ('straight', 5::numeric, 'sanded', 199::numeric),
    ('straight', 5::numeric, 'saw_cut', 161::numeric),
    ('round', 2::numeric, 'sanded', 149::numeric),
    ('round', 3::numeric, 'sanded', 207::numeric),
    ('round', 4::numeric, 'sanded', 288::numeric),
    ('round', 5::numeric, 'sanded', 288::numeric)
)
update public.supplier_special_pricing_bluestone_rates as r
set base_price_per_m2_eur = rates.base_price_per_m2_eur,
    discount_percentage = 0,
    updated_at = now()
from rates
join public.suppliers s on lower(s.name) = lower('Sanne Vos')
join public.materials m on lower(m.name) = lower('Bluestone')
where r.supplier_id = s.id
  and r.material_id = m.id
  and r.shape_kind = rates.shape_kind
  and r.thickness_cm = rates.thickness_cm
  and r.surface_type = rates.surface_type
  and r.is_supported;
