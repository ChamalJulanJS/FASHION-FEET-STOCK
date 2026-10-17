const fs = require('fs');

const filesToPatch = [
  'd:/fashionfeet pos/f_app_extracted/out/_next/static/chunks/0-n22kk7q-ka0.js',
  'd:/fashionfeet pos/app_extracted/out/_next/static/chunks/0-n22kk7q-ka0.js',
  'd:/fashionfeet pos/pos_src/out/_next/static/chunks/0-n22kk7q-ka0.js'
];

const oldK = 'async function k(e,t,r){let s=(0,a.createClient)(),{data:n}=await s.from("stock_levels").select("quantity, product_variants (cost_price)").eq("location_id",r),i=n?.reduce((e,t)=>{let a=t.product_variants,r=Array.isArray(a)?a[0]?.cost_price:a?.cost_price;return e+t.quantity*Number(r||0)},0)||0,o=s.from("sales").select("id, total, tax, created_at, payment_method, status, sale_items (quantity, cost_price)").eq("location_id",r);e&&(o=o.gte("created_at",e)),t&&(o=o.lte("created_at",t+"T23:59:59"));let{data:l}=await o,c=(l||[]).filter(e=>"voided"!==e.status),d=new Date,u=6e4*d.getTimezoneOffset(),m=new Date(new Date(d.getTime()+u+198e5).setHours(0,0,0,0)),h=c.filter(e=>new Date(e.created_at)>=m)||[],x=h.filter(e=>"cash"===e.payment_method).reduce((e,t)=>e+Number(t.total),0),g=h.filter(e=>"card"===e.payment_method).reduce((e,t)=>e+Number(t.total),0),f=h.filter(e=>!["cash","card"].includes(e.payment_method||"")).reduce((e,t)=>e+Number(t.total),0),b=s.from("expenses").select("amount, category").eq("location_id",r);e&&(b=b.gte("date",e)),t&&(b=b.lte("date",t));let{data:p}=await b,w=s.from("supplier_invoices").select("total_amount, paid_amount").eq("location_id",r).eq("status","unpaid");e&&(w=w.gte("created_at",e)),t&&(w=w.lte("created_at",t+"T23:59:59"));let{data:y}=await w,j=c.reduce((e,t)=>e+Number(t.total),0)||0,N=c.reduce((e,t)=>e+Number(t.tax||0),0)||0,v=j-N,C=c.reduce((e,t)=>e+(t.sale_items?.reduce((e,t)=>e+t.quantity*Number(t.cost_price),0)||0),0)||0,T=v-C,k=p?.reduce((e,t)=>{let a=t.category||"Other";return e[a]=(e[a]||0)+Number(t.amount),e},{})||{},S=Object.values(k).reduce((e,t)=>e+t,0),M=y?.reduce((e,t)=>e+(Number(t.total_amount)-Number(t.paid_amount||0)),0)||0,D=c.filter(e=>"cash"===e.payment_method).reduce((e,t)=>e+Number(t.total),0)||0,P=c.filter(e=>"card"===e.payment_method).reduce((e,t)=>e+Number(t.total),0)||0,F=i+0+D+P;return{totalGrossSales:j,totalTaxCollected:N,cleanRevenue:v,cogs:C,grossProfit:T,grossMarginPct:v>0?T/v*100:0,expenseBreakdown:k,operatingExpenses:S,netProfit:T-S,stockValue:i,accountsPayable:M,cashInHand:D,mainBank:P,totalAssets:F,equity:F-M,todayCash:x,todayCard:g,todayOther:f}}';

const newK = 'async function k(e,t,r){let s=(0,a.createClient)(),{data:n}=await s.from("stock_levels").select("quantity, product_variants (cost_price)").eq("location_id",r),i=n?.reduce((e,t)=>{let a=t.product_variants,r=Array.isArray(a)?a[0]?.cost_price:a?.cost_price;return e+t.quantity*Number(r||0)},0)||0,o=s.from("sales").select("id, total, tax, created_at, payment_method, status, sale_items (quantity, cost_price)").eq("location_id",r);e&&(o=o.gte("created_at",e)),t&&(o=o.lte("created_at",t+"T23:59:59"));let{data:l}=await o,c=(l||[]).filter(e=>"voided"!==e.status),d=new Date,u=6e4*d.getTimezoneOffset(),m=new Date(new Date(d.getTime()+u+198e5).setHours(0,0,0,0)),h=c.filter(e=>new Date(e.created_at)>=m)||[],x=h.filter(e=>"cash"===e.payment_method).reduce((e,t)=>e+Number(t.total),0),g=h.filter(e=>"card"===e.payment_method).reduce((e,t)=>e+Number(t.total),0),f=h.filter(e=>!["cash","card"].includes(e.payment_method||"")).reduce((e,t)=>e+Number(t.total),0),b=s.from("expenses").select("amount, category").eq("location_id",r);e&&(b=b.gte("date",e)),t&&(b=b.lte("date",t));let{data:p}=await b,w=s.from("supplier_invoices").select("total_amount, paid_amount").eq("location_id",r).eq("status","unpaid");e&&(w=w.gte("created_at",e)),t&&(w=w.lte("created_at",t+"T23:59:59"));let{data:y}=await w,R_q=s.from("returns").select("id, refund_amount, refund_method, status, created_at, return_items(quantity, is_damaged, product_variants(cost_price))").eq("location_id",r).eq("status","completed");e&&(R_q=R_q.gte("created_at",e)),t&&(R_q=R_q.lte("created_at",t+"T23:59:59"));let{data:R_d}=await R_q,R_list=R_d||[],R_cash=R_list.filter(e=>"cash"===e.refund_method).reduce((e,t)=>e+Number(t.refund_amount||0),0),R_retCogs=R_list.reduce((e,t)=>e+(t.return_items?.filter(x=>!x.is_damaged).reduce((sum,ri)=>{let pv=ri.product_variants,cp=Array.isArray(pv)?pv[0]?.cost_price:pv?.cost_price;return sum+Number(ri.quantity)*Number(cp||0)},0)||0),0),R_today=R_list.filter(e=>new Date(e.created_at)>=m)||[],R_todayCash=R_today.filter(e=>"cash"===e.refund_method).reduce((e,t)=>e+Number(t.refund_amount||0),0),x_net=Math.max(0,x-R_todayCash),j=c.reduce((e,t)=>e+Number(t.total),0)||0,N=c.reduce((e,t)=>e+Number(t.tax||0),0)||0,v=Math.max(0,j-N-R_cash),C_raw=c.reduce((e,t)=>e+(t.sale_items?.reduce((e,t)=>e+t.quantity*Number(t.cost_price),0)||0),0)||0,C=Math.max(0,C_raw-R_retCogs),T=v-C,k=p?.reduce((e,t)=>{let a=t.category||"Other";return e[a]=(e[a]||0)+Number(t.amount),e},{})||{},S=Object.values(k).reduce((e,t)=>e+t,0),M=y?.reduce((e,t)=>e+(Number(t.total_amount)-Number(t.paid_amount||0)),0)||0,D=Math.max(0,(c.filter(e=>"cash"===e.payment_method).reduce((e,t)=>e+Number(t.total),0)||0)-R_cash),P=c.filter(e=>"card"===e.payment_method).reduce((e,t)=>e+Number(t.total),0)||0,F=i+0+D+P;return{totalGrossSales:j,totalTaxCollected:N,totalReturns:R_cash,cleanRevenue:v,cogs:C,grossProfit:T,grossMarginPct:v>0?T/v*100:0,expenseBreakdown:k,operatingExpenses:S,netProfit:T-S,stockValue:i,accountsPayable:M,cashInHand:D,mainBank:P,totalAssets:F,equity:F-M,todayCash:x_net,todayCard:g,todayOther:f}}';

const oldTableTax = '(0,t.jsxs)(r.TableRow,{children:[(0,t.jsx)(r.TableCell,{className:"text-sm text-muted-foreground pl-8",children:"Tax Component"}),(0,t.jsxs)(r.TableCell,{className:"text-right text-sm text-muted-foreground",children:["-(Rs. ",m.totalTaxCollected.toLocaleString(),")"]}),F(m.totalTaxCollected,x?.totalTaxCollected)]}),';
const newTableTax = '(0,t.jsxs)(r.TableRow,{children:[(0,t.jsx)(r.TableCell,{className:"text-sm text-muted-foreground pl-8",children:"Tax Component"}),(0,t.jsxs)(r.TableCell,{className:"text-right text-sm text-muted-foreground",children:["-(Rs. ",m.totalTaxCollected.toLocaleString(),")"]}),F(m.totalTaxCollected,x?.totalTaxCollected)]}),m.totalReturns>0&&(0,t.jsxs)(r.TableRow,{children:[(0,t.jsx)(r.TableCell,{className:"text-sm text-muted-foreground pl-8",children:"Customer Refunds"}),(0,t.jsxs)(r.TableCell,{className:"text-right text-sm text-muted-foreground",children:["-(Rs. ",m.totalReturns.toLocaleString(),")"]}),F(m.totalReturns,x?.totalReturns)]}),';

const oldExcel = '["Tax Component",-m.totalTaxCollected],["Net Revenue",m.cleanRevenue],';
const newExcel = '["Tax Component",-m.totalTaxCollected],...(m.totalReturns>0?[["Customer Refunds",-m.totalReturns]]:[]),["Net Revenue",m.cleanRevenue],';

const oldWCall = 'totalTaxCollected:m.totalTaxCollected,cleanRevenue:m.cleanRevenue,';
const newWCall = 'totalTaxCollected:m.totalTaxCollected,totalReturns:m.totalReturns,cleanRevenue:m.cleanRevenue,';

const oldWParams = 'totalGrossSales:s,totalTaxCollected:n,cleanRevenue:i,';
const newWParams = 'totalGrossSales:s,totalTaxCollected:n,totalReturns:R_ret,cleanRevenue:i,';

const oldWPrintTax = '(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{className:"p-2 border-b border-slate-200 text-slate-500",children:"Accrued Tax Liability"}),(0,t.jsxs)("td",{className:"p-2 border-b border-slate-200 text-right text-slate-500",children:["(Rs. ",n.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2}),")"]})]}),';
const newWPrintTax = '(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{className:"p-2 border-b border-slate-200 text-slate-500",children:"Accrued Tax Liability"}),(0,t.jsxs)("td",{className:"p-2 border-b border-slate-200 text-right text-slate-500",children:["(Rs. ",n.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2}),")"]})]}),R_ret>0?(0,t.jsxs)("tr",{children:[(0,t.jsx)("td",{className:"p-2 border-b border-slate-200 text-slate-500",children:"Customer Refunds"}),(0,t.jsxs)("td",{className:"p-2 border-b border-slate-200 text-right text-slate-500",children:["(Rs. ",R_ret.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2}),")"]})]}):null,';

for (const file of filesToPatch) {
  if (!fs.existsSync(file)) {
    console.log(`Skipping (not found): ${file}`);
    continue;
  }
  let c = fs.readFileSync(file, 'utf8');
  if (!c.includes(oldK)) {
    console.log(`Already patched or oldK not found: ${file}`);
    continue;
  }

  // Backup
  fs.writeFileSync(file + '.bak', c, 'utf8');

  c = c.replace(oldK, newK);
  c = c.replace(oldTableTax, newTableTax);
  c = c.replace(oldExcel, newExcel);
  c = c.replace(oldWCall, newWCall);
  c = c.replace(oldWParams, newWParams);
  c = c.replace(oldWPrintTax, newWPrintTax);

  fs.writeFileSync(file, c, 'utf8');
  console.log(`Successfully patched: ${file}`);
}
