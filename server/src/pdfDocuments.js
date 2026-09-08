import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const assetRoot=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','assets');
const logoPath=path.join(assetRoot,'chocomanualart-logo.webp');
const signaturePath=path.join(assetRoot,'signature.png');
const money=value=>Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const ones=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function smallWords(n){let out='';if(n>=100){out+=`${ones[Math.floor(n/100)]} Hundred `;n%=100;}if(n>=20){out+=`${tens[Math.floor(n/10)]} `;n%=10;}if(n)out+=`${ones[n]} `;return out.trim();}
function amountWords(value){let n=Math.round(Number(value||0));if(!n)return'Zero only/-';const out=[];for(const [unit,label] of [[10000000,'Crore'],[100000,'Lakh'],[1000,'Thousand']])if(n>=unit){out.push(`${smallWords(Math.floor(n/unit))} ${label}`);n%=unit;}if(n)out.push(smallWords(n));return`${out.join(' ')} only/-`;}
function txt(doc,value,x,y,width,{size=7,bold=false,align='left',color='#000',lineGap=0}={}){doc.fillColor(color).font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).text(String(value??''),x,y,{width,align,lineGap});}
function rect(doc,x,y,w,h,width=.55){doc.rect(x,y,w,h).lineWidth(width).strokeColor('#000').stroke();}
function hline(doc,x1,x2,y){doc.moveTo(x1,y).lineTo(x2,y).lineWidth(.45).strokeColor('#000').stroke();}
function vline(doc,x,y1,y2){doc.moveTo(x,y1).lineTo(x,y2).lineWidth(.45).strokeColor('#000').stroke();}

export async function sendDocumentPdf(res,{type,number,date,po,seller}){
  const doc=new PDFDocument({size:'A4',margin:0,info:{Title:`${type} ${number}`,Author:seller.name}});
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${type==='PURCHASE ORDER'?'PO':'Tax-Invoice'}-${number}.pdf"`);doc.pipe(res);
  const X=34,Y=41,W=527;
  const title=type==='PURCHASE ORDER'?'Purchase Order':'Tax Invoice';txt(doc,title,X,Y-11,W,{size:8,bold:true,align:'center'});

  // Header follows the supplied invoice: logo/address left, statutory data right.
  let logo=null;if(fs.existsSync(logoPath))logo=await sharp(logoPath).png().toBuffer();
  if(logo)doc.image(logo,73,49,{fit:[115,36]});else txt(doc,seller.name,73,54,150,{size:14,bold:true});
  txt(doc,seller.address.toUpperCase(),73,90,230,{size:8,bold:true});txt(doc,`Ph: ${seller.phone}`,73,114,210,{size:8,bold:true});
  const metaX=342,metaY=51,labelW=79,row=12;const metadata=[['Date',new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(date))],[type==='PURCHASE ORDER'?'PO No.':'Bill No.',number],['GSTIN',seller.gstin],['PAN',seller.pan],['Email',seller.email],['Website',seller.website],['Place of Supply',po.place_of_supply||'-']];metadata.forEach((entry,i)=>{txt(doc,entry[0],metaX,metaY+i*row,labelW,{size:8,bold:true});txt(doc,entry[1],metaX+labelW,metaY+i*row,135,{size:8,bold:i<4});});
  const headerBottom=143;hline(doc,X,X+W,headerBottom);

  // Bill-to and ship-to blocks.
  const c=po.customer,mid=X+W/2,partyTop=headerBottom,partyBottom=partyTop+120;vline(doc,mid,partyTop,partyBottom);
  txt(doc,'Bill To:',73,partyTop+15,210,{size:8,bold:true});txt(doc,'Ship To:',342,partyTop+15,200,{size:8,bold:true});
  txt(doc,(c.billName||'-').toUpperCase(),73,partyTop+31,210,{size:9,bold:true});txt(doc,(c.shipName||'-').toUpperCase(),342,partyTop+31,200,{size:9,bold:true});
  const addressY=partyTop+46,billAddress=(c.billAddress||'-').toUpperCase(),shipAddress=(c.shipAddress||'-').toUpperCase();
  txt(doc,billAddress,73,addressY,215,{size:8,bold:true});txt(doc,shipAddress,342,addressY,205,{size:8,bold:true});
  doc.font('Helvetica-Bold').fontSize(8);const billContactY=addressY+doc.heightOfString(billAddress,{width:215,lineGap:0})+5,shipContactY=addressY+doc.heightOfString(shipAddress,{width:205,lineGap:0})+5;
  txt(doc,`Contact: ${c.billContact||'-'}\nMobile: ${c.billContactPhone||c.mobile||'-'}\nGST: ${c.gstin||'-'}`,73,billContactY,215,{size:8,bold:true});txt(doc,`Contact: ${c.shipContact||'-'}\nMobile: ${c.shipContactPhone||'-'}\nGST: ${c.shipGstin||'-'}`,342,shipContactY,205,{size:8,bold:true});hline(doc,X,X+W,partyBottom);

  // Compact bordered item grid. Only render rows that contain items.
  const widths=[38,205,66,55,68,95],columns=['S No.','Description','HSN Code','Quantity','Price @ INR/p','Amount (INR)'];let colX=X;const itemTop=partyBottom,rowH=20,headH=20;columns.forEach((name,i)=>{rect(doc,colX,itemTop,widths[i],headH);txt(doc,name,colX+3,itemTop+5,widths[i]-6,{size:8,bold:true,align:i>=3?'right':'left'});colX+=widths[i];});
  let y=itemTop+headH;const visibleRows=Math.max(1,po.items.length);for(let i=0;i<visibleRows;i++){const item=po.items[i];colX=X;const values=item?[i+1,item.description,item.hsn,item.quantity,money(item.rate),money(item.quantity*item.rate)]:['','','','','',''];values.forEach((value,n)=>{rect(doc,colX,y,widths[n],rowH);txt(doc,value,colX+3,y+5,widths[n]-6,{size:8,bold:false,align:n>=3?'right':'left'});colX+=widths[n];});y+=rowH;}
  // Full-width accounting rows.
  const amountWidth=widths.at(-1),labelRight=X+W-amountWidth,amountX=labelRight,totalW=W;const accounting=[];accounting.push(['Sub Total',money(po.subtotal)]);if(po.tax_type==='CGST_SGST'){accounting.push([`CGST (@${po.gst_rate/2}%)`,money(po.tax_amount/2)],[`SGST (@${po.gst_rate/2}%)`,money(po.tax_amount/2)]);}else accounting.push([`IGST (@${po.gst_rate}%)`,money(po.tax_amount)]);accounting.push(['Total',money(po.total)],['Advance Amount',po.advance_amount?money(po.advance_amount):'-'],['Pending Amounts',po.pending_amount?money(po.pending_amount):'-']);accounting.forEach(([label,value])=>{rect(doc,X,y,totalW,rowH);vline(doc,labelRight,y,y+rowH);txt(doc,label,X+5,y+5,labelRight-X-10,{size:8,bold:true,align:'center'});txt(doc,value,amountX+3,y+5,amountWidth-6,{size:8,bold:label==='Total',align:'right'});y+=rowH;});

  // Bank details immediately follow the table; signature/stamp is aligned at right.
  const bankTop=y;hline(doc,X,X+W,bankTop);txt(doc,'Bank Details',X+3,bankTop+6,300,{size:9,bold:true});txt(doc,`UPI - ${seller.upi}\n1. Cheque / Draft to be drawn in favour of "${seller.name}".\n2. Details in case of NEFT transfer: Favouring - ${seller.name}\nBank Name : ${seller.bank}\nBank Branch & Address: ${seller.branch||'-'}\nBank A/c No.: ${seller.account}\nRTGS/NEFT/IFSC Code: ${seller.ifsc}\n3. All disputes subject to Delhi Jurisdiction.\n4. Payment terms - 100% advance payment`,X+3,bankTop+19,360,{size:9,bold:false,lineGap:2});
  txt(doc,`For ${seller.name}`,400,bankTop+15,140,{size:9,bold:true,align:'center'});if(fs.existsSync(signaturePath))doc.image(signaturePath,420,bankTop+36,{fit:[100,68],align:'center'});txt(doc,'Authorised Signatory',400,bankTop+108,140,{size:9,bold:true,align:'center'});
  const documentBottom=bankTop+140;rect(doc,X,Y,W,documentBottom-Y,.8);
  doc.end();
}
