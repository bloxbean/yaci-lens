import{d as pt,t as ct,a as c,e as ht,b as L,f as _,s as R}from"../chunks/Dh0_e2y0.js";import{p as ut,f as B,g as s,c as h,a as _t,b as Et,e as mt,t as T,u as vt,h as G,s as i,$ as bt,n as O,r as o,o as f}from"../chunks/Cb9M24YY.js";import{s as Q,r as X,i as j}from"../chunks/BYWVQOtR.js";import{e as J}from"../chunks/yut9rvC-.js";import{I as Z,h as Rt,r as ft,s as yt}from"../chunks/BrkJLcQB.js";import{b as gt}from"../chunks/Bmy5aEMn.js";import{b as xt}from"../chunks/BZRXLeep.js";import{g as St}from"../chunks/qfCWtNCO.js";import{P as wt}from"../chunks/Bltz7rBn.js";import{P as V}from"../chunks/7Y00f7DD.js";import{t as F}from"../chunks/1jSaFLVj.js";import{d as u,L as K,n as Ot}from"../chunks/BOyKDd4G.js";import{P as Lt}from"../chunks/d0Vw46DY.js";import{D as Tt}from"../chunks/C06U4Gqt.js";var At=new Set(["$$slots","$$events","$$legacy"]);function It(y,g){let E=X(g,At);const m={name:"upload",size:24,node:[["path",{d:"M12 3v12"}],["path",{d:"m17 8-5-5-5 5"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}]]};Z(y,Q(()=>E,{get icon(){return m}}))}var Dt=new Set(["$$slots","$$events","$$legacy"]);function Mt(y,g){let E=X(g,Dt);const m={name:"hard-drive",size:24,node:[["path",{d:"M10 16h.01"}],["path",{d:"M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}],["path",{d:"M21.946 12.013H2.054"}],["path",{d:"M6 16h.01"}]]};Z(y,Q(()=>E,{get icon(){return m}}))}const $t=[{id:"network",name:"Network pulse",description:"Transactions, fees, smart-contract share and block size over the last 90 days.",widgets:[{title:"Transactions yesterday",width:1,viz:{type:"stat"},sql:`SELECT txs, script_txs, fees_ada
FROM {daily}
WHERE date = {tip_date}`},{title:"Smart-contract share",width:1,viz:{type:"area",format:"percent"},sql:`SELECT date, script_txs / txs AS script_share
FROM {daily}
WHERE date > {tip_date} - 90
ORDER BY date`},{title:"Fees per day",width:1,viz:{type:"bar",format:"ada"},sql:`SELECT date, fees_ada
FROM {daily}
WHERE date > {tip_date} - 90
ORDER BY date`},{title:"Transactions per day",width:3,viz:{type:"stacked"},sql:`SELECT date, script_txs AS smart_contract, txs - script_txs AS other
FROM {daily}
WHERE date > {tip_date} - 90
ORDER BY date`},{title:"Average block size (bytes)",width:2,viz:{type:"line"},sql:`SELECT date, avg_block_bytes
FROM {daily}
WHERE date > {tip_date} - 90
ORDER BY date`},{title:"Mints and burns, last 30 days",width:1,viz:{type:"split"},sql:`SELECT 'Mint events' AS kind, sum(mint_events) AS events FROM {daily} WHERE date > {tip_date} - 30
UNION ALL
SELECT 'Burn events', sum(burn_events) FROM {daily} WHERE date > {tip_date} - 30`}]},{id:"defi",name:"DeFi watch",description:"Which dApps and scripts are busiest and what they cost.",widgets:[{title:"Busiest dApps, last 30 days",width:2,viz:{type:"barlist"},sql:`SELECT n.project, sum(d.txs) AS txs
FROM {script_daily} d JOIN {script_names} n USING (script_hash)
WHERE d.date > {tip_date} - 30
GROUP BY 1 ORDER BY txs DESC LIMIT 15`},{title:"Plutus versions, last 30 days",width:1,viz:{type:"split"},sql:`SELECT 'Plutus V' || script_type AS version, sum(txs) AS executions
FROM {script_daily}
WHERE date > {tip_date} - 30 AND script_type IS NOT NULL
GROUP BY 1 ORDER BY 1`},{title:"Fees of smart-contract transactions per day",width:1,viz:{type:"bar",format:"ada"},sql:`SELECT date, fees_ada * script_txs / txs AS script_fees_ada
FROM {daily}
WHERE date > {tip_date} - 90
ORDER BY date`,note:"Estimated: the day's fees in proportion to its smart-contract transactions."},{title:"Most expensive scripts (CPU steps per tx), last 30 days",width:2,viz:{type:"table"},sql:`SELECT coalesce(n.label, left(d.script_hash, 12)) AS script, round(sum(d.steps) / sum(d.txs) / 1e6, 1) AS m_steps_per_tx, sum(d.txs) AS txs
FROM {script_daily} d LEFT JOIN {script_names} n USING (script_hash)
WHERE d.date > {tip_date} - 30
GROUP BY 1 HAVING sum(d.txs) >= 100
ORDER BY 2 DESC LIMIT 15`},{title:"Minswap vs SundaeSwap vs WingRiders (weekly)",width:3,viz:{type:"line"},sql:`SELECT date_trunc('week', d.date) AS week,
  sum(d.txs) FILTER (WHERE n.project = 'Minswap') AS minswap,
  sum(d.txs) FILTER (WHERE n.project = 'SundaeSwap') AS sundaeswap,
  sum(d.txs) FILTER (WHERE n.project = 'WingRiders') AS wingriders
FROM {script_daily} d JOIN {script_names} n USING (script_hash)
WHERE d.date > {tip_date} - 365
GROUP BY 1 ORDER BY 1`}]},{id:"governance",name:"Governance",description:"DRep power, participation and how proposals fare.",widgets:[{title:"Vote-delegated stake (ADA)",width:2,viz:{type:"stacked",format:"ada"},sql:`SELECT epoch, drep_power_ada AS registered_dreps, abstain_ada AS always_abstain, no_confidence_ada AS no_confidence
FROM {drep_epochs}
ORDER BY epoch`},{title:"Proposals by status",width:1,viz:{type:"split"},sql:`SELECT status, count(*) AS proposals
FROM {governance}
GROUP BY 1 ORDER BY 2 DESC`},{title:"Biggest DReps",width:1,viz:{type:"barlist",format:"ada"},sql:`SELECT coalesce(m.given_name, left(d.drep_id, 16)) AS drep, d.voting_power_ada
FROM {dreps} d LEFT JOIN {drep_meta} m USING (drep_hash)
WHERE d.drep_id IS NOT NULL
ORDER BY 2 DESC LIMIT 15`},{title:"Votes per epoch by role",width:2,viz:{type:"stacked"},sql:`SELECT epoch,
  count(*) FILTER (WHERE voter_type LIKE 'DREP%') AS dreps,
  count(*) FILTER (WHERE voter_type LIKE 'STAKING%') AS spos,
  count(*) FILTER (WHERE voter_type LIKE 'CONST%') AS committee
FROM {votes}
GROUP BY 1 ORDER BY 1`},{title:"Treasury withdrawals requested (ADA)",width:3,viz:{type:"table"},sql:`SELECT g.proposed_epoch AS epoch, coalesce(a.title, left(g.tx_hash, 12)) AS proposal, g.status, g.drep_yes, g.drep_no
FROM {governance} g LEFT JOIN {action_meta} a USING (tx_hash, idx)
WHERE g.type = 'TREASURY_WITHDRAWALS_ACTION'
ORDER BY g.proposed_epoch DESC LIMIT 30`}]},{id:"live",name:"Yesterday, from the lake",description:"Live queries on the newest day of raw tables (one partition each).",widgets:[{title:"Biggest transactions by output, newest day",width:2,viz:{type:"table"},sql:`SELECT tx_hash, sum(quantity) FILTER (WHERE asset_unit = 'lovelace') / 1e6 AS output_ada, count(DISTINCT output_index) AS outputs
FROM address_utxo
WHERE date = {tip_date}
GROUP BY 1 ORDER BY 2 DESC LIMIT 15`},{title:"Transactions per hour (UTC)",width:1,viz:{type:"bar"},sql:`SELECT hour(block_time) AS hour, count(*) AS txs
FROM transaction
WHERE date = {tip_date}
GROUP BY 1 ORDER BY 1`},{title:"Metadata labels used",width:1,viz:{type:"barlist"},sql:`SELECT label, count(*) AS txs
FROM transaction_metadata
WHERE date = {tip_date}
GROUP BY 1 ORDER BY 2 DESC LIMIT 12`},{title:"Blocks per pool, newest day",width:2,viz:{type:"barlist"},sql:`SELECT coalesce(p.ticker, left(b.slot_leader, 12)) AS pool, count(*) AS blocks
FROM block b LEFT JOIN {pool_meta} p ON p.pool_hash = b.slot_leader
WHERE b.date = {tip_date}
GROUP BY 1 ORDER BY 2 DESC LIMIT 20`}]}];var kt=_('<button class="y-btn h-9"><!>Import</button> <button class="y-btn h-9"><!>Export all</button> <input type="file" accept="application/json,.json" class="hidden"/>',1),Ct=_('<span class="block truncate text-xs text-muted"> </span>'),Bt=_('<li><a class="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 hover:border-brand/40 hover:bg-surface-2/60"><!> <span class="min-w-0 flex-1"><span class="block truncate font-medium"> </span> <!></span> <span class="shrink-0 text-xs text-faint"> </span></a></li>'),Ft=_('<ul class="flex flex-col gap-1.5"></ul>'),Ht=_('<p class="text-sm text-muted">None yet. Create one, or start from a template.</p>'),Yt=_('<form class="mb-4 flex gap-2"><input class="y-input h-10 flex-1" placeholder="New dashboard name"/> <button class="y-btn y-btn-primary h-10"><!>Create</button></form> <!>',1),Wt=_('<button class="flex flex-col items-start gap-1.5 rounded-xl border border-line p-4 text-left transition hover:border-brand/40 hover:bg-surface-2/60"><span class="font-display font-semibold"> </span> <span class="text-xs text-muted"> </span> <span class="mt-1 text-[11px] text-faint"> </span></button>'),Nt=_('<div class="grid gap-3 sm:grid-cols-2"></div>'),Ut=_(`<!> <div class="mb-6 flex items-start gap-2.5 rounded-xl border border-blue/30 bg-blue/10 px-4 py-3 text-sm"><!> <span>Dashboards live only in this browser (IndexedDB): their names, SQL and chart settings, never the data, which is queried again each time. Nothing is
		uploaded. Use <b>Export</b> or a dashboard's <b>Share link</b> to move them to another browser; clearing site data deletes them.</span></div> <section class="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"><!> <!></section>`,1);function se(y,g){ut(g,!0),u.load();let E=Et(""),m;async function H(a){const d=await u.create(a?.name??(s(E).trim()||"My dashboard"),a?.description??"",(a?.widgets??[]).map(t=>({...t,id:Ot()})));G(E,""),St(`#/dashboards/${d.id}${a?"":"?edit=1"}`)}function tt(a,d){const t=document.createElement("a");t.href=URL.createObjectURL(new Blob([a],{type:"application/json"})),t.download=d,t.click(),setTimeout(()=>URL.revokeObjectURL(t.href),1e3)}async function et(a){const d=a.currentTarget.files?.[0];if(a.currentTarget.value="",!!d){if(d.size>2e6)return F.show("That file is too large for a dashboard export.","error",4e3);try{const t=await u.importJson(await d.text());F.show(`Imported ${t} dashboard${t>1?"s":""}.`,"ok",3e3)}catch(t){F.show(`Couldn't import: ${t.message}`,"error",5e3)}}}var Y=Ut();Rt("1mkan62",a=>{mt(()=>{bt.title="Dashboard lab · Yaci Lens"})});var W=B(Y);wt(W,{kind:"Analytics",title:"Dashboard lab",icon:t=>{K(t,{class:"h-5 w-5"})},actions:t=>{var l=kt(),e=B(l),p=h(e);It(p,{class:"h-4 w-4"}),O(),o(e);var n=i(e,2),x=h(n);Tt(x,{class:"h-4 w-4"}),O(),o(n);var v=i(n,2);xt(v,S=>m=S,()=>m),T(()=>n.disabled=!u.list.length),L("click",e,()=>m.click()),L("click",n,()=>tt(u.exportJson(),"yaci-lens-dashboards.json")),L("change",v,et),c(t,l)},children:(t,l)=>{O();var e=ct("Build your own dashboards from SQL: each widget is a query over the published data, drawn as a number, chart, ranked list or table.");c(t,e)},$$slots:{icon:!0,actions:!0,default:!0}});var A=i(W,2),at=h(A);Mt(at,{class:"mt-0.5 h-4 w-4 shrink-0 text-blue"}),O(2),o(A);var N=i(A,2),U=h(N);{let a=vt(()=>u.loaded?`${u.list.length} in this browser`:"Loading…");V(U,{title:"Your dashboards",get sub(){return s(a)},children:(d,t)=>{var l=Yt(),e=B(l),p=h(e);ft(p);var n=i(p,2),x=h(n);Lt(x,{class:"h-4 w-4"}),O(),o(n),o(e);var v=i(e,2);{var S=r=>{var w=Ft();J(w,21,()=>u.list,D=>D.id,(D,b)=>{var M=Bt(),$=h(M),z=h($);K(z,{class:"h-4 w-4 shrink-0 text-brand"});var k=i(z,2),q=h(k),rt=f(q,!0),it=i(q,2);{var ot=C=>{var P=Ct(),lt=f(P,!0);T(()=>R(lt,s(b).description)),c(C,P)};j(it,C=>{s(b).description&&C(ot)})}o(k);var dt=i(k,2),nt=f(dt);o($),o(M),T(()=>{yt($,"href",`#/dashboards/${s(b).id??""}`),R(rt,s(b).name),R(nt,`${s(b).widgets.length??""} widget${s(b).widgets.length===1?"":"s"}`)}),c(D,M)}),o(w),c(r,w)},I=r=>{var w=Ht();c(r,w)};j(v,r=>{u.list.length?r(S):u.loaded&&r(I,1)})}ht("submit",e,r=>(r.preventDefault(),H())),gt(p,()=>s(E),r=>G(E,r)),c(d,l)},$$slots:{default:!0}})}var st=i(U,2);V(st,{title:"Start from a template",sub:"A copy is added to your dashboards; change anything",children:(a,d)=>{var t=Nt();J(t,21,()=>$t,l=>l.id,(l,e)=>{var p=Wt(),n=h(p),x=f(n,!0),v=i(n,2),S=f(v,!0),I=i(v,2),r=f(I);o(p),T(()=>{R(x,s(e).name),R(S,s(e).description),R(r,`${s(e).widgets.length??""} widgets`)}),L("click",p,()=>H(s(e))),c(l,p)}),o(t),c(a,t)},$$slots:{default:!0}}),o(N),c(y,Y),_t()}pt(["click","change"]);export{se as component};
