-- Fix isRtbAdver backfill: value lives inside rawJson.targetList[] (targetCode='is_rtb_adver', value='已推广'/'未推广')
UPDATE "KoxNote" n
SET "isRtbAdver" = (
  SELECT (e.elems ->> 'targetValue') = '已推广'
  FROM jsonb_array_elements(n."rawJson"::jsonb -> 'targetList') AS e(elems)
  WHERE e.elems ->> 'targetCode' = 'is_rtb_adver'
  LIMIT 1
)
WHERE n."rawJson" IS NOT NULL;
