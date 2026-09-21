-- Finish formula percentages for Sanne Vos Bluestone automatic pricing.
-- Source: "Prijsberekening_nieuwe prijzen_2024_Bel CHD.xlsx", tab "B - vos CHD",
-- column K (finish factor) per finish code, converted to a percentage
-- (factor 1.28 → 28). Values are the most common factor per code in that sheet.
--
-- Only rows that still have no percentage are filled, so values entered later
-- in Management → Finishes survive a re-run of this migration.
-- Finishes that do not occur in the sheet are intentionally left null:
-- ALPE, C, E, EL, EPE, ER, FEFP, FELP, FEP, SL, TFT, TL, VFK, VFR, VK, VLK, VLR, VPE.

with sheet_percentages(abbreviation, formula_percentage) as (
  values
    ('A', 11), ('AF', 38), ('AFK', 63), ('AFP', 59),
    ('AFPE', 56), ('AFR', 55), ('AK', 36), ('AL', 33),
    ('ALK', 58), ('ALP', 54), ('ALR', 50), ('AP', 32),
    ('AR', 28), ('AT', 33), ('B', 18), ('BF', 41),
    ('BFK', 66), ('BFP', 62), ('BFR', 58), ('BK', 43),
    ('BL', 38), ('BLK', 63), ('BLP', 59), ('BLPE', 51),
    ('BLR', 55), ('BP', 39), ('BR', 35), ('EF', 51),
    ('EP', 46), ('F', 23), ('FP', 44), ('FK', 48),
    ('FR', 40), ('FE', 36), ('FEF', 63), ('FEFK', 88),
    ('FEFR', 80), ('FEK', 69), ('FEL', 48), ('FELK', 73),
    ('FELR', 65), ('FER', 59), ('K', 28), ('KR', 45),
    ('L', 11), ('LK', 36), ('LR', 28), ('P', 24),
    ('PE', 28), ('PEF', 48), ('PEL', 36), ('R', 20),
    ('T', 55), ('TF', 75), ('TK', 78), ('TPE', 80),
    ('TR', 72), ('TT', 73), ('V', 38), ('VF', 58),
    ('VL', 46), ('VP', 59), ('VR', 55), ('VT', 56)
)
update finish_options as fo
set formula_percentage = sp.formula_percentage
from sheet_percentages as sp
where upper(fo.abbreviation) = sp.abbreviation
  and fo.formula_percentage is null;

-- Regular has no code and adds no surcharge.
update finish_options
set formula_percentage = 0
where lower(name) = 'regular'
  and abbreviation is null
  and formula_percentage is null;
