export const normalizeHeader=value=>String(value??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function pickLeadValue(row,names){
  const values=new Map(Object.entries(row||{}).map(([key,value])=>[normalizeHeader(key),value]));
  for(const name of names){const value=values.get(normalizeHeader(name));if(value!==undefined&&value!==null&&String(value).trim()!=='')return String(value).trim();}
  return'';
}

export function normalizePhone(value){
  let digits=String(value??'').replace(/\D/g,'');
  if(digits.length===11&&digits.startsWith('0'))digits=digits.slice(1);
  if(digits.length===12&&digits.startsWith('91'))return`+${digits}`;
  if(digits.length===10)return digits;
  return digits?`+${digits}`:'';
}

export function normalizeEmail(value){return String(value??'').trim().toLowerCase();}

export function parseAmount(value){
  const cleaned=String(value??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
  const amount=cleaned?Number(cleaned[0]):0;return Number.isFinite(amount)&&amount>0?amount:0;
}

export function parseQuantity(value){
  const text=String(value??'').trim();if(!text||/^(n\/?a|na|none|-+)$/i.test(text))return 0;
  const residue=text.replace(/\d+(?:\.\d+)?/g,'').replace(/boxes?|pieces?|pcs?|items?|units?|qty|quantity/gi,'').replace(/[\s,./()-]/g,'');
  if(residue)return 0;
  const number=text.match(/\d+(?:\.\d+)?/);return number?Number(number[0]):0;
}

export function normalizeQuantityRange(value){
  const text=String(value??'').trim();
  const match=text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
  return match?`${match[1]}-${match[2]}`:'';
}

export function standardLeadRow(row){
  const quantityValue=pickLeadValue(row,['Quantity','Qty','Required Quantity']);
  const quantity=parseQuantity(quantityValue);
  const quantityRange=normalizeQuantityRange(quantityValue);
  const perBoxBudget=parseAmount(pickLeadValue(row,['Budget','Per Box Budget','Price','Target Price','Budget Per Box']));
  const explicitEstimated=parseAmount(pickLeadValue(row,['Estimated Value','Lead Value','Total Value']));
  return{
    contactName:pickLeadValue(row,['Name','Contact Name','Full Name','Customer Name','Lead Name','Contact']),
    email:normalizeEmail(pickLeadValue(row,['Email','Email Address','Email ID','E-mail','Mail'])),
    phone:normalizePhone(pickLeadValue(row,['Phone','Phone Number','Mobile','Mobile Number','Contact Number','WhatsApp Number','Whatsapp'])),
    companyName:pickLeadValue(row,['Company','Company Name','Business','Business Name','Organisation','Organization']),
    quantity,
    quantityRange,
    boxSize:pickLeadValue(row,['Box Size','Box','Size','Pack Size']),
    perBoxBudget,
    requirement:pickLeadValue(row,['Message','Requirement','Requirements','Product Requirement','Query','Remarks','Description']),
    date:pickLeadValue(row,['Date','Created Time','Created At','Timestamp','Lead Date','Submission Time']),
    city:pickLeadValue(row,['City','Location']),
    source:pickLeadValue(row,['Source','Lead Source']),
    status:pickLeadValue(row,['Lead Status','Status']),
    nextFollowup:pickLeadValue(row,['Next Follow Up','Next Follow-up','Next Followup','Follow Up Date','Followup Date']),
    notes:pickLeadValue(row,['Notes','Note','Comment']),
    estimatedValue:explicitEstimated||(quantity&&perBoxBudget?quantity*perBoxBudget:0)
  };
}
