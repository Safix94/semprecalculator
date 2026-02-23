-- Convert stored dimensions from millimeters to centimeters.
-- Run once: existing values are in mm; divide by 10 so they represent cm.
update rfqs
set
  length = length / 10,
  width = width / 10,
  height = height / 10,
  thickness = thickness / 10;
