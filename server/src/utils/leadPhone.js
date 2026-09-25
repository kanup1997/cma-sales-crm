export const duplicatePhoneMessage='A lead with this phone number already exists.';
export const isDuplicatePhoneError=error=>String(error?.message||error).includes('DUPLICATE_LEAD_PHONE');

export function phoneKey(value){
  let digits=String(value??'').replace(/[^0-9]/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  if(digits.length===12&&digits.startsWith('91'))digits=digits.slice(2);
  else if(digits.length===11&&digits.startsWith('0'))digits=digits.slice(1);
  return digits;
}

// SQLite equivalent of phoneKey; the expression is supplied only by this module.
function keySql(value){return `(WITH RECURSIVE chars(rest,digits) AS (
  SELECT COALESCE(${value},''),''
  UNION ALL SELECT substr(rest,2),digits || CASE WHEN substr(rest,1,1) GLOB '[0-9]' THEN substr(rest,1,1) ELSE '' END FROM chars WHERE rest<>''
), international AS (
  SELECT CASE WHEN substr(digits,1,2)='00' THEN substr(digits,3) ELSE digits END AS digits FROM chars WHERE rest=''
) SELECT CASE WHEN length(digits)=12 AND substr(digits,1,2)='91' THEN substr(digits,3)
  WHEN length(digits)=11 AND substr(digits,1,1)='0' THEN substr(digits,2) ELSE digits END FROM international)`;}

const newKey=keySql('NEW.phone');
export const leadPhoneSchema=[
  // Keep legacy duplicates intact while preventing any additional duplicates.
  `UPDATE leads SET phone_key=${keySql('phone')} WHERE phone_key IS NULL`,
  'CREATE INDEX IF NOT EXISTS idx_leads_phone_key ON leads(phone_key)',
  `CREATE TRIGGER IF NOT EXISTS leads_phone_unique_insert BEFORE INSERT ON leads
   WHEN ${newKey}<>'' AND EXISTS(SELECT 1 FROM leads WHERE phone_key=${newKey})
   BEGIN SELECT RAISE(ABORT,'DUPLICATE_LEAD_PHONE'); END`,
  `CREATE TRIGGER IF NOT EXISTS leads_phone_unique_update BEFORE UPDATE OF phone ON leads
   WHEN ${newKey}<>'' AND ${newKey}<>COALESCE(OLD.phone_key,'') AND EXISTS(SELECT 1 FROM leads WHERE phone_key=${newKey} AND id<>OLD.id)
   BEGIN SELECT RAISE(ABORT,'DUPLICATE_LEAD_PHONE'); END`,
  `CREATE TRIGGER IF NOT EXISTS leads_phone_key_insert AFTER INSERT ON leads
   BEGIN UPDATE leads SET phone_key=${newKey} WHERE id=NEW.id; END`,
  `CREATE TRIGGER IF NOT EXISTS leads_phone_key_update AFTER UPDATE OF phone ON leads
   BEGIN UPDATE leads SET phone_key=${newKey} WHERE id=NEW.id; END`
];
