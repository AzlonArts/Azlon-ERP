// public/js/app.js  — shared utilities + PDF engine

// ── Toast ──────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `toast ${type === 'error' ? 'error' : ''} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── API helpers ────────────────────────────────────────────────────
async function api(method, url, data) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  };
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  if (res.status === 401) { window.location = '/login'; return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

const GET = (url) => api('GET', url);
const POST = (url, data) => api('POST', url, data);
const PUT = (url, data) => api('PUT', url, data);
const DEL = (url) => api('DELETE', url);

// ── Nav active link ────────────────────────────────────────────────
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === path || (path.startsWith(a.getAttribute('href')) && a.getAttribute('href') !== '/'));
  });
}

// ── Load nav user ──────────────────────────────────────────────────
async function loadNavUser() {
  try {
    const me = await GET('/api/me');
    const el = document.getElementById('navUser');
    if (el) el.innerHTML = `<strong>${me.fullName}</strong> &nbsp;·&nbsp; ${me.role}`;
    return me;
  } catch { return null; }
}

// ── Number helpers ─────────────────────────────────────────────────
function fmtAmt(n) { return (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtQty(n) { return (parseFloat(n) || 0).toLocaleString('en-IN'); }

function formatDateDMY(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function numToWords(n) {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  if (n === 0) return "Zero";
  function three(num) {
    let s = "";
    if (num >= 100) { s += ones[Math.floor(num/100)] + " Hundred "; num %= 100; }
    if (num >= 20) { s += tens[Math.floor(num/10)] + " "; num %= 10; s += ones[num] + " "; }
    else if (num > 0) s += ones[num] + " ";
    return s.trim();
  }
  const scales = [[1e9,"Billion"],[1e6,"Million"],[1e3,"Thousand"],[1,""]];
  let rem = n, out = "";
  for (const [sv,sn] of scales) {
    if (rem >= sv) { const c = Math.floor(rem/sv); rem %= sv; const ch = three(c); if(ch) out += ch + (sn?" "+sn:"") + " "; }
  }
  return out.trim();
}

function amountInWords(amount, currency) {
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  let w = `${currency} ${numToWords(whole)}`;
  w += cents > 0 ? ` and Cents ${numToWords(cents)} Only` : " Only";
  return w;
}

// ── Status badge ───────────────────────────────────────────────────
function statusBadge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

// ─────────────────────────────────────────────────────────────────
// PI PDF ENGINE  (mirrors Python layout — uses pdf-lib from CDN)
// ─────────────────────────────────────────────────────────────────
const COMPANY = {
  name: "Azlon Arts",
  addressLines: ["No. 114, Kamarajapuram North,","Sengunthapuram (PO)","Karur - 639 002 , India"],
  phone: "+91 - 4324 - 274812",
  gstNo: "33AAOFA8940R1ZP",
  bankNameLine: "Central Bank of India, First Floor, 45 / E / 1 & 2",
  bankAddrLine2: "Sengunthapuram Main Road, Karur - 639 002",
  swiftCode: "CBININBBKRU",
  fax: "0091 - 4324 - 232379"
};

async function generatePI(order) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  const font  = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontB = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const MM=2.8346, PW=595.28, PH=841.89, MARGIN=15*MM, CW=PW-2*MARGIN;
  const LW=0.7, PAD=1.5*MM, ROW_H=4.6*MM, TH_H=10*MM, FOOT_R=16*MM;

  const COLW={marks:0.16,pack:0.16,desc:0.34,qty:0.13,rate:0.10,amt:0.11};
  let cx=MARGIN;
  const xM=cx; cx+=COLW.marks*CW;
  const xP=cx; cx+=COLW.pack*CW;
  const xD=cx; cx+=COLW.desc*CW;
  const xQ=cx; cx+=COLW.qty*CW;
  const xR=cx; cx+=COLW.rate*CW;
  const xA=cx; cx+=COLW.amt*CW;
  const xE=MARGIN+CW;
  const cols=[xM,xP,xD,xQ,xR,xA,xE];

  let page, y, pn=1, rowTop;

  const inkColor = rgb(0.086,0.196,0.239);

  function wrap(s,f,sz,mw){
    if(!s)return[""];
    const ws=s.split(" "); const ls=[]; let cur="";
    for(const w of ws){
      const tr=(cur+" "+w).trim();
      if(f.widthOfTextAtSize(tr,sz)<=mw)cur=tr;
      else{if(cur)ls.push(cur);cur=w;}
    }
    if(cur)ls.push(cur);
    return ls.length?ls:[""];
  }

  function txt(x,yy,s,opts={}){
    const f=opts.font||font, sz=opts.size||10, al=opts.align||'left';
    let dx=x;
    if(al==='center') dx=x-f.widthOfTextAtSize(s,sz)/2;
    else if(al==='right') dx=x-f.widthOfTextAtSize(s,sz);
    page.drawText(s,{x:dx,y:yy,size:sz,font:f,color:inkColor});
  }

  function hl(x1,x2,yy,w=LW){page.drawLine({start:{x:x1,y:yy},end:{x:x2,y:yy},thickness:w,color:rgb(0,0,0)});}
  function vl(xx,y1,y2,w=LW){page.drawLine({start:{x:xx,y:y1},end:{x:xx,y:y2},thickness:w,color:rgb(0,0,0)});}
  function bx(x1,y1,x2,y2,w=LW){page.drawRectangle({x:x1,y:Math.min(y1,y2),width:x2-x1,height:Math.abs(y2-y1),borderColor:rgb(0,0,0),borderWidth:w});}

  function newPg(){page=pdfDoc.addPage([PW,PH]);}

  function drawTitle(cont){
    txt(PW/2,y,"Proforma Invoice",{font:fontB,size:16,align:'center'});
    y-=6*MM;
    if(cont){txt(xE,y,`Continuation Sheet/Page No……${pn}`,{size:9,align:'right'});y-=5*MM;}
    else y-=1*MM;
  }

  function drawHeader(cont){
    const lx=MARGIN, rx=MARGIN+CW*0.5, bt=y;
    y-=5.5*MM;
    txt(lx+PAD,y,"Exporter");
    txt(rx+PAD,y,"Invoice No:",{font:fontB});
    txt(rx+32*MM,y,order.invoice_no||"");
    const al=[COMPANY.name,...COMPANY.addressLines];
    const rl=[["Dated :",formatDateDMY(order.invoice_date)],["Order No:",order.order_no||""],["E - Mail Dated:",formatDateDMY(order.email_dated)]];
    y-=5*MM;
    al.forEach((l,i)=>{
      txt(lx+PAD,y,l);
      if(i<rl.length){txt(rx+PAD,y,rl[i][0],{font:fontB});txt(rx+32*MM,y,rl[i][1]||"");}
      y-=5*MM;
    });
    txt(lx+PAD,y,`Phone No: ${COMPANY.phone}`);
    txt(rx+PAD,y,"Other Reference(s)",{font:fontB});
    y-=4*MM;
    const d1=y; hl(lx,xE,d1); y-=5.5*MM;

    if(!cont){
      txt(lx+PAD,y,"Consignee"); txt(rx+PAD,y,"Buyer (if other than consignee)"); y-=5.5*MM;
      let cy=y;
      (order.consignee_text||"").split('\n').filter(Boolean).forEach(l=>{txt(lx+PAD,cy,l.trim());cy-=5*MM;});
      let by=y;
      const bl=(order.buyer_text||"").split('\n').filter(Boolean);
      (bl.length?bl:["-"]).forEach(l=>{txt(rx+PAD,by,l.trim());by-=5*MM;});
      y=Math.min(cy,by)-1*MM;
      const d2=y; hl(lx,xE,d2); y-=5.5*MM;
      txt(rx+PAD,y,"Country of Origin"); txt(rx+38*MM,y,"Country of Final Destination"); y-=5*MM;
      txt(rx+PAD,y,"India"); txt(rx+38*MM,y,order.country_destination||""); y-=4*MM;
      const d3=y; hl(lx,xE,d3); y-=5.5*MM;
      txt(rx+PAD,y,"Terms of Delivery and Payment",{font:fontB}); y-=5*MM;
      txt(lx+PAD,y,"Pre-Carriage by"); txt(lx+34*MM,y,"Place of Receipt"); y-=5*MM;
      txt(lx+34*MM,y,order.port_loading||"Any Indian Port"); txt(rx+PAD,y,order.delivery_terms||"FOB By Sea"); y-=5*MM;
      txt(lx+PAD,y,"Flight/Vessel No   Port of Loading"); txt(rx+PAD,y,order.payment_terms||""); y-=5*MM;
      txt(lx+34*MM,y,order.port_loading||"Any Indian Port"); y-=4*MM;
      const d4=y; hl(lx,xE,d4); y-=5.5*MM;
      txt(lx+PAD,y,"Port of Discharge"); txt(lx+34*MM,y,"Final Destination"); y-=5*MM;
      txt(lx+PAD,y,order.port_discharge||""); txt(lx+34*MM,y,order.final_destination||""); y-=4*MM;
    } else { y-=2*MM; }

    const bb=y;
    bx(lx,bt,xE,bb);
    vl(rx,bb,cont?d1:bt);
    y-=4*MM;
  }

  function drawTableHeader(){
    const ty=y;
    const hdrs=[[xM,xP,"Marks & Container No."],[xP,xD,"No. & Kind of Packing"],[xD,xQ,"Description of Goods"],[xQ,xR,"Quantity in Pcs/Sets"],[xR,xA,"Rate"],[xA,xE,"Amount"]];
    const ys=y-3.2*MM;
    hdrs.forEach(([x1,x2,h])=>{
      const cw=x2-x1;
      const ls=wrap(h,fontB,8.5,cw-2*PAD);
      let yy=ys;
      ls.forEach(l=>{txt(x1+cw/2,yy,l,{font:fontB,size:8.5,align:'center'});yy-=3.5*MM;});
    });
    y-=TH_H;
    const by=y; bx(MARGIN,ty,xE,by); cols.slice(1,-1).forEach(xx=>vl(xx,by,ty));
    rowTop=ty;
  }

  function startPage(cont=false){
    newPg(); y=PH-MARGIN;
    drawTitle(cont); drawHeader(cont); drawTableHeader(); rowTop=y;
  }

  function hasSpace(h){return (y-h)>=(FOOT_R+MARGIN);}

  function closeTable(){
    cols.slice(1,-1).forEach(xx=>vl(xx,y,rowTop));
    vl(MARGIN,y,rowTop); vl(xE,y,rowTop);
  }

  function measureItem(it){
    const dl=wrap(it.description,font,10,COLW.desc*CW-2*PAD);
    const pl=wrap(it.packing_detail,font,9.5,COLW.desc*CW-2*PAD);
    const hl2=(it.hs_codes||"").split(',').filter(Boolean);
    return (dl.length+pl.length+hl2.length+1)*ROW_H+3*MM;
  }

  function drawItem(it){
    const dl=wrap(it.description,font,10,COLW.desc*CW-2*PAD);
    const pl=wrap(it.packing_detail,font,9.5,COLW.desc*CW-2*PAD);
    const hl2=(it.hs_codes||"").split(',').map(s=>s.trim()).filter(Boolean);
    const sy=y;
    txt(xD+PAD,y,dl[0]||"");
    const q=parseFloat(it.quantity)||0, r=parseFloat(it.rate)||0;
    txt(xR-PAD,y,q.toLocaleString(),{align:'right'});
    txt(xA-PAD,y,r.toFixed(2),{align:'right'});
    const amt=q*r;
    txt(xE-PAD,y,fmtAmt(amt),{align:'right'});
    y-=ROW_H;
    dl.slice(1).forEach(l=>{txt(xD+PAD,y,l);y-=ROW_H;});
    txt(xQ+PAD,sy-ROW_H,it.unit_label||"Pcs",{size:9.5});
    pl.forEach(l=>{txt(xD+PAD,y,l,{size:9.5});y-=ROW_H;});
    hl2.forEach(h=>{txt(xD+PAD,y,`HS Code : ${h}`,{size:9.5});y-=ROW_H;});
    y-=2*MM;
    return amt;
  }

  function drawBF(rq,ra){
    y-=4*MM;
    txt(xD+PAD,y,"B / F …");
    txt(xR-PAD,y,rq.toLocaleString(),{align:'right'});
    txt(xE-PAD,y,fmtAmt(ra),{align:'right'});
    y-=ROW_H;
  }

  function drawGrpHead(name){
    y-=2*MM; txt(xD+PAD,y,name); y-=7*MM;
  }

  function drawPageSub(pq,pa){
    closeTable(); y-=5*MM;
    hl(xQ,xE,y+4*MM);
    txt(xR-PAD,y,pq.toLocaleString(),{align:'right'});
    txt(xE-PAD,y,fmtAmt(pa),{align:'right'});
    y-=6*MM;
    txt(xE,y,`Contd … ${pn+1}`,{size:9,align:'right'});
  }

  // ── Flatten groups/items ──
  const flat=[];
  (order.groups||[]).forEach(g=>{
    flat.push(['group',g.name]);
    (g.items||[]).forEach(it=>flat.push(['item',it]));
  });

  startPage(false);
  let rq=0,ra=0,pq=0,pa=0;
  let i=0;
  while(i<flat.length){
    const [kind,payload]=flat[i];
    if(kind==='group'){
      let nih=0;
      if(i+1<flat.length&&flat[i+1][0]==='item') nih=measureItem(flat[i+1][1]);
      if(!hasSpace(9*MM+nih)){drawPageSub(pq,pa);rq+=pq;ra+=pa;pq=0;pa=0;pn++;startPage(true);drawBF(rq,ra);}
      drawGrpHead(payload); i++;
    } else {
      const bh=measureItem(payload);
      if(!hasSpace(bh)){drawPageSub(pq,pa);rq+=pq;ra+=pa;pq=0;pa=0;pn++;startPage(true);drawBF(rq,ra);}
      const amt=drawItem(payload); pq+=parseFloat(payload.quantity)||0; pa+=amt; i++;
    }
  }
  rq+=pq; ra+=pa;

  // Final totals
  closeTable(); y-=5*MM;
  hl(xQ,xE,y+4*MM);
  txt(xR-PAD,y,rq.toLocaleString(),{font:fontB,align:'right'});
  txt(xE-PAD,y,fmtAmt(ra),{font:fontB,align:'right'});
  y-=9*MM;

  txt(MARGIN,y,`FOB in ${amountInWords(ra,order.currency||"Euro")}`);
  y-=7*MM;
  if(order.qty_variation_note){txt(MARGIN,y,order.qty_variation_note);y-=7*MM;}
  if(order.delivery_note){txt(MARGIN,y,`Delivery :  ${order.delivery_note}`);y-=8*MM;}

  if(!hasSpace(45*MM)){newPg();y=PH-MARGIN-10*MM;}

  const lx=MARGIN,rx=MARGIN+CW*0.55;
  txt(lx,y,"Port of Shipment :",{font:fontB}); txt(lx+30*MM,y,order.port_loading||"Any Indian Port");
  txt(rx,y,"Port of Discharge :",{font:fontB}); txt(rx+30*MM,y,order.port_discharge||""); y-=6*MM;
  txt(lx,y,"Partial Shipment :",{font:fontB}); txt(lx+30*MM,y,order.partial_shipment||"Allowed");
  txt(rx,y,"Transhipment :",{font:fontB}); txt(rx+30*MM,y,order.transhipment||"Allowed"); y-=8*MM;
  txt(lx,y,"Payment :",{font:fontB}); txt(lx+22*MM,y,order.payment_method||""); y-=6*MM;
  txt(lx,y,"Our Bankers :",{font:fontB}); txt(lx+22*MM,y,COMPANY.bankNameLine); y-=5*MM;
  txt(lx+22*MM,y,COMPANY.bankAddrLine2); y-=6*MM;
  txt(lx,y,"Swift Code :",{font:fontB}); txt(lx+22*MM,y,COMPANY.swiftCode); y-=6*MM;
  txt(lx,y,"Fax Number :",{font:fontB}); txt(lx+22*MM,y,COMPANY.fax);

  const bytes=await pdfDoc.save();
  const blob=new Blob([bytes],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`PI_${(order.invoice_no||order.order_no||'draft').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Proforma Invoice PDF downloaded.');
}
