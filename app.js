import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_USER_ID, LOGIN_DOMAIN } from "./firebase-config.js";
const $=id=>document.getElementById(id),configured=firebaseConfig.apiKey!=="PASTE_API_KEY"&&firebaseConfig.projectId!=="YOUR_PROJECT_ID";
const ADMIN_EMAIL=`${ADMIN_USER_ID}@${LOGIN_DOMAIN}`.toLowerCase(),PS=5;
let auth,db,user,stopListen=null,rows=[],audits=[],stock=[],debts=[],pays=[],people=[],page=0,payDebt=null;
const pad=n=>String(n).padStart(2,"0"),num=v=>Number(v||0),sum=(a,f)=>a.reduce((s,x)=>s+f(x),0),L=n=>num(n).toFixed(1)+" L";
const localInput=(d=new Date())=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16),today=()=>localInput().slice(0,10);
const dmy=s=>s?s.split("-").reverse().join("-"):"",hm=i=>{const d=new Date(i);return pad(d.getHours())+":"+pad(d.getMinutes())},hrs=m=>Math.floor(num(m)/60)+" ঘণ্টা "+(num(m)%60)+" মিনিট",ts=r=>r.createdAt?.toMillis?.()||Date.now();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function msg(id,s,cls="err"){const e=$(id);e.className=cls;e.textContent=s}
function err(e){const m={"auth/invalid-credential":"User ID বা Password সঠিক নয়।","auth/email-already-in-use":"এই User ID আগে থেকেই আছে।","auth/weak-password":"Password কমপক্ষে ৬ অক্ষরের দিন।","auth/requires-recent-login":"নিরাপত্তার জন্য logout করে আবার login করে চেষ্টা করুন।","permission-denied":"অনুমতি নেই (Firestore Rules)।"};return m[e.code]||`${e.code||"Error"}: ${e.message||e}`}
const mail=id=>`${id.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
// ---- navigation
function go(p){document.querySelectorAll("[data-page]").forEach(s=>s.classList.toggle("hidden",s.dataset.page!==p));document.querySelectorAll("[data-go]").forEach(b=>b.classList.toggle("on",b.dataset.go===p&&!b.classList.contains("sec")));scrollTo(0,0)}
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
// ---- auth
$("loginBtn").onclick=async()=>{if(!configured)return;const id=$("email").value;if(!/^[a-z0-9_.-]{2,30}$/i.test(id.trim()))return msg("authMsg","User ID বা Password সঠিক নয়।");try{msg("authMsg","");await signInWithEmailAndPassword(auth,mail(id),$("password").value)}catch(e){msg("authMsg",err(e))}};
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn").click()});
$("logoutBtn").onclick=()=>signOut(auth);
$("pwBtn").onclick=async()=>{try{await updatePassword(auth.currentUser,$("newPw").value);$("newPw").value="";msg("pwMsg","Password বদলানো হয়েছে।","ok")}catch(e){msg("pwMsg",err(e))}};
// ---- PG run
function resetForm(){$("runForm").reset();$("date").value=today();$("startAt").value=localInput();$("endAt").value=localInput(new Date(Date.now()+37*60000));$("moduleCount").value=0;durCalc()}
function durCalc(){const m=Math.round((new Date($("endAt").value)-new Date($("startAt").value))/60000);$("durBox").textContent="মোট সময়: "+(m>0?hrs(m):"—")}
["startAt","endAt"].forEach(i=>$(i).addEventListener("input",durCalc));
$("runForm").onsubmit=async e=>{e.preventDefault();if(!user)return;const a=new Date($("startAt").value),b=new Date($("endAt").value),fuel=Number($("fuelUsed").value);if(!Number.isFinite(+a)||!Number.isFinite(+b)||b<=a)return msg("runMsg","PG Stop অবশ্যই PG Start-এর পরে দিন।");if(!Number.isFinite(fuel)||fuel<0)return msg("runMsg","Fuel 0 বা তার বেশি দিন।");
try{await addDoc(collection(db,"pgRuns"),{ownerUid:user.uid,date:$("date").value,siteCode:$("siteCode").value.trim().toUpperCase(),startAt:a.toISOString(),endAt:b.toISOString(),durationMinutes:Math.round((b-a)/60000),siteDown:$("siteDown").value==="yes",fuelUsed:fuel,event:$("event").value.trim(),moduleCount:num($("moduleCount").value),remark:$("remark").value.trim(),status:"pending",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});resetForm();msg("runMsg","");$("okDialog").showModal()}catch(x){msg("runMsg",err(x))}};
$("okMore").onclick=()=>{$("okDialog").close();go("run")};$("okHist").onclick=()=>{$("okDialog").close();go("hist")};
async function confirmRun(id){if(!confirm("Site, সময় ও Fuel যাচাই করেছেন?"))return;try{await runTransaction(db,async tx=>{const ref=doc(db,"pgRuns",id),s=await tx.get(ref);if(!s.exists()||s.data().ownerUid!==user.uid)throw Error("Entry পাওয়া যায়নি।");if(s.data().status!=="pending")throw Error("ইতিমধ্যে confirm হয়েছে।");tx.update(ref,{status:"confirmed",confirmedAt:serverTimestamp(),updatedAt:serverTimestamp()});tx.set(doc(collection(db,"auditEvents")),{ownerUid:user.uid,runId:id,action:"confirm",oldFuelUsed:s.data().fuelUsed,newFuelUsed:s.data().fuelUsed,reason:"User confirmed entry",createdAt:serverTimestamp()})})}catch(e){alert(err(e))}}
function adjDelta(){const d=num($("adjustFuel").value)-num($("adjOld").value);$("adjDelta").textContent="সমন্বয়: "+(d>0?"+":"")+d.toFixed(2)+" L"}
$("adjustFuel").addEventListener("input",adjDelta);
function openAdjust(r){$("adjustRunId").value=r.id;$("adjOld").value=num(r.fuelUsed).toFixed(2);$("adjustFuel").value=num(r.fuelUsed).toFixed(2);$("adjustReason").value="";msg("adjustMsg","");adjDelta();$("adjustDialog").showModal()}
$("adjustCancel").onclick=()=>$("adjustDialog").close();
$("adjustSave").onclick=async()=>{const id=$("adjustRunId").value,n=Number($("adjustFuel").value),reason=$("adjustReason").value.trim();if(!Number.isFinite(n)||n<0)return msg("adjustMsg","Fuel 0 বা তার বেশি দিন।");if(!reason)return msg("adjustMsg","সংশোধনের কারণ আবশ্যক।");
try{await runTransaction(db,async tx=>{const ref=doc(db,"pgRuns",id),s=await tx.get(ref);if(!s.exists()||s.data().ownerUid!==user.uid)throw Error("Entry পাওয়া যায়নি।");const o=num(s.data().fuelUsed);tx.set(doc(collection(db,"auditEvents")),{ownerUid:user.uid,runId:id,action:"fuel_adjustment",oldFuelUsed:o,newFuelUsed:n,deltaLiters:Number((n-o).toFixed(2)),reason,createdAt:serverTimestamp()});tx.update(ref,{fuelUsed:n,updatedAt:serverTimestamp(),lastAdjustmentReason:reason})});$("adjustDialog").close()}catch(e){msg("adjustMsg",err(e))}};
// ---- stock
function stockCalc(){const inn=sum(stock.filter(s=>s.type==="in"),s=>num(s.liters)),out=sum(stock.filter(s=>s.type==="out"),s=>num(s.liters)),used=sum(rows.filter(r=>r.status==="confirmed"),r=>num(r.fuelUsed)),
took=sum(debts.filter(d=>d.direction==="took"),d=>num(d.liters)),gave=sum(debts.filter(d=>d.direction==="gave"),d=>num(d.liters)),
pg=sum(pays.filter(p=>p.direction==="gave"),p=>num(p.liters)),pt=sum(pays.filter(p=>p.direction==="took"),p=>num(p.liters)),received=inn+took+pg;
return{bal:inn+took+pg-out-used-gave-pt,received,inn,used}}
$("stDate").value=today();$("dbDate").value=today();
$("stockForm").onsubmit=async e=>{e.preventDefault();const l=Number($("stLiters").value);if(!(l>0))return msg("stMsg","পরিমাণ 0-র বেশি দিন।");try{await addDoc(collection(db,"fuelStock"),{ownerUid:user.uid,type:$("stType").value,date:$("stDate").value,liters:l,note:$("stNote").value.trim(),createdAt:serverTimestamp()});$("stockForm").reset();$("stDate").value=today();msg("stMsg","সংরক্ষিত হয়েছে।","ok")}catch(x){msg("stMsg",err(x))}};
// ---- debts
const rem=d=>Math.max(0,num(d.liters)-num(d.repaid));
$("debtForm").onsubmit=async e=>{e.preventDefault();const l=Number($("dbLiters").value);if(!(l>0))return msg("dbMsg","পরিমাণ 0-র বেশি দিন।");try{await addDoc(collection(db,"debts"),{ownerUid:user.uid,direction:$("dbDir").value,person:$("dbPerson").value.trim(),date:$("dbDate").value,liters:l,note:$("dbNote").value.trim(),repaid:0,status:"open",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});$("debtForm").reset();$("dbDate").value=today();msg("dbMsg","সংরক্ষিত হয়েছে।","ok")}catch(x){msg("dbMsg",err(x))}};
function openRepay(d){payDebt=d;$("rpInfo").textContent=`${d.person} · বাকি ${rem(d).toFixed(2)} L`;$("rpAmt").value=rem(d).toFixed(2);msg("rpMsg","");$("repayDialog").showModal()}
$("rpCancel").onclick=()=>$("repayDialog").close();
$("rpSave").onclick=async()=>{const a=Number($("rpAmt").value),d=payDebt;if(!d||!(a>0))return msg("rpMsg","সঠিক পরিমাণ দিন।");try{await runTransaction(db,async tx=>{const ref=doc(db,"debts",d.id),s=await tx.get(ref);if(!s.exists()||s.data().ownerUid!==user.uid)throw Error("পাওয়া যায়নি।");const x=s.data(),nr=Number((num(x.repaid)+a).toFixed(2));if(nr>num(x.liters)+0.0001)throw Error("বাকির চেয়ে বেশি দেওয়া যাবে না।");tx.update(ref,{repaid:nr,status:nr>=num(x.liters)-0.0001?"settled":"open",updatedAt:serverTimestamp()});tx.set(doc(collection(db,"debtPayments")),{ownerUid:user.uid,debtId:d.id,direction:x.direction,liters:a,date:today(),createdAt:serverTimestamp()})});$("repayDialog").close()}catch(e){msg("rpMsg",err(e))}};
// ---- admin: users
$("userForm").onsubmit=async e=>{e.preventDefault();const id=$("uId").value.trim().toLowerCase(),pw=$("uPw").value;if(!/^[a-z0-9_.-]{3,20}$/.test(id))return msg("uMsg","User ID: ৩-২০ অক্ষর, শুধু a-z 0-9 _ . -");if(pw.length<6)return msg("uMsg","Password কমপক্ষে ৬ অক্ষর।");
try{await setDoc(doc(db,"allowedUsers",mail(id)),{userId:id,name:$("uNm").value.trim(),active:true,createdAt:serverTimestamp()});
const a2=getAuth(initializeApp(firebaseConfig,"adm"+Date.now()));await createUserWithEmailAndPassword(a2,mail(id),pw);await signOut(a2);$("userForm").reset();msg("uMsg",`তৈরি হয়েছে। ${id} এখন এই User ID ও Password দিয়ে লগইন করতে পারবে।`,"ok")}catch(x){msg("uMsg",err(x))}};
// ---- render
const tag=r=>`<span class="tag ${r.status==="confirmed"?"":"p"}">${r.status==="confirmed"?"Confirmed":"Pending"}</span>`;
const tr=(r,act)=>`<tr><td>${dmy(r.date)}</td><td>${esc(r.siteCode)}</td><td>${hm(r.startAt)} - ${hm(r.endAt)}</td><td>${num(r.fuelUsed).toFixed(1)}</td><td>${tag(r)}</td>${act?`<td style="white-space:nowrap">${r.status==="pending"?`<button class="btn sec" data-c="${r.id}">Confirm</button> `:""}<button class="btn sec" data-a="${r.id}">Adjust</button></td>`:""}</tr>`;
function render(){const t=today(),done=rows.filter(r=>r.status==="confirmed"),td=rows.filter(r=>r.date===t),mn=done.filter(r=>(r.date||"").startsWith(t.slice(0,7)));
$("mToday").textContent=td.length+" টি";$("mFuel").textContent=L(sum(td,r=>num(r.fuelUsed)));$("mTime").textContent=hrs(sum(td,r=>num(r.durationMinutes)));
$("mMonth").textContent=new Date().toLocaleDateString("bn-BD",{month:"long",year:"numeric"});$("sTime").textContent=hrs(sum(mn,r=>num(r.durationMinutes)));$("sFuel").textContent=L(sum(mn,r=>num(r.fuelUsed)));$("sVis").textContent=mn.length+" টি";
$("recent").innerHTML=rows.slice(0,3).map(r=>tr(r)).join("")||'<tr><td colspan="5" class="muted">এখনো কোনো PG Run নেই।</td></tr>';
const sites=[...new Set(rows.map(r=>r.siteCode))].sort(),cur=$("fSite").value;$("fSite").innerHTML='<option value="">সব সাইট</option>'+sites.map(s=>`<option ${s===cur?"selected":""}>${esc(s)}</option>`).join("");renderHist();renderStock();renderDebts()}
function renderHist(){const s=$("fSite").value,q=$("fQ").value.trim().toLowerCase(),f=$("fFrom").value,to=$("fTo").value;
const A=rows.filter(r=>(!s||r.siteCode===s)&&(!q||(r.siteCode+" "+(r.remark||"")).toLowerCase().includes(q))&&(!f||r.date>=f)&&(!to||r.date<=to)),n=Math.max(1,Math.ceil(A.length/PS));page=Math.min(page,n-1);
$("histBody").innerHTML=A.slice(page*PS,page*PS+PS).map(r=>tr(r,true)).join("")||'<tr><td colspan="6" class="muted">কিছু পাওয়া যায়নি।</td></tr>';$("pInfo").textContent=`${page+1} / ${n}`;$("pPrev").disabled=page===0;$("pNext").disabled=page>=n-1;
$("histBody").querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>confirmRun(b.dataset.c));$("histBody").querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>openAdjust(rows.find(r=>r.id===b.dataset.a)))}
["fSite","fQ","fFrom","fTo"].forEach(i=>$(i).addEventListener("input",()=>{page=0;renderHist()}));$("pPrev").onclick=()=>{page--;renderHist()};$("pNext").onclick=()=>{page++;renderHist()};
function renderStock(){const c=stockCalc(),pct=c.received>0?Math.max(0,Math.min(100,c.bal/c.received*100)):0;
$("dStock").textContent=L(c.bal);$("dBar").style.width=pct+"%";$("dStockSub").textContent=`মোট প্রাপ্তি ${L(c.received)} · PG-তে ব্যবহার ${L(c.used)}`;
$("stBal").textContent=L(c.bal);$("stIn").textContent=L(c.received);$("stUsed").textContent=L(c.used);
$("stBody").innerHTML=stock.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")||ts(b)-ts(a)).map(s=>`<tr><td>${dmy(s.date)}</td><td>${s.type==="in"?"জমা":"বের"}</td><td>${s.type==="in"?"+":"−"}${num(s.liters).toFixed(2)} L</td><td>${esc(s.note)}</td></tr>`).join("")||'<tr><td colspan="4" class="muted">এখনো কোনো এন্ট্রি নেই। প্রথমে বর্তমান স্টক "জমা" হিসেবে যোগ করুন।</td></tr>'}
function renderDebts(){const open=debts.filter(d=>d.status!=="settled");$("dbRecv").textContent=L(sum(open.filter(d=>d.direction==="gave"),rem));$("dbPay").textContent=L(sum(open.filter(d=>d.direction==="took"),rem));$("dRecv").textContent=$("dbRecv").textContent;$("dRecv").nextSibling;$("dPay").textContent=$("dbPay").textContent;
$("dbList").innerHTML=debts.slice().sort((a,b)=>(a.status==="settled")-(b.status==="settled")||(b.date||"").localeCompare(a.date||"")).map(d=>{const p=num(d.liters)>0?num(d.repaid)/num(d.liters)*100:0;return `<div class="log" style="display:block"><div class="row" style="justify-content:space-between"><b>${esc(d.person)}</b><span class="tag ${d.status==="settled"?"":"p"}">${d.status==="settled"?"পরিশোধিত":"বাকি"}</span></div><div class="muted">${dmy(d.date)} · ${d.direction==="gave"?"ধার দিয়েছি (পাবো)":"ধার নিয়েছি (দেব)"} · ${num(d.liters).toFixed(2)} L · বাকি ${rem(d).toFixed(2)} L</div><div class="bar"><i style="width:${p}%"></i></div>${esc(d.note)?`<div class="muted">${esc(d.note)}</div>`:""}${d.status==="settled"?"":`<button class="btn sec" data-p="${d.id}">পরিশোধ</button>`}</div>`}).join("")||'<div class="muted">এখনো কিছু নেই।</div>';
$("dbList").querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>openRepay(debts.find(d=>d.id===b.dataset.p)))}
function renderLog(){$("logList").innerHTML=audits.map(a=>{const c=a.action==="confirm",t=a.createdAt?.toDate?.(),d=t?`${pad(t.getDate())}-${pad(t.getMonth()+1)}-${t.getFullYear()} ${pad(t.getHours())}:${pad(t.getMinutes())}`:"",run=rows.find(r=>r.id===a.runId);
return `<div class="log"><div class="dot ${c?"c":""}">${c?"✓":"±"}</div><div><b>${c?"PG Run Confirm":"Fuel Adjustment"}</b> <span class="muted">${d}</span><div class="muted">${run?esc(run.siteCode)+" · ":""}${c?num(a.newFuelUsed)+" L":`${a.oldFuelUsed} L → ${a.newFuelUsed} L (${a.deltaLiters>0?"+":""}${a.deltaLiters})`}</div>${c?"":`<div class="muted">কারণ: ${esc(a.reason)}</div>`}</div></div>`}).join("")||'<div class="muted">এখনো কোনো লগ নেই।</div>'}
function renderUsers(){$("uList").innerHTML=people.map(p=>`<div class="sumrow"><span><b>${esc(p.userId)}</b> <span class="muted">${esc(p.name)}</span></span><button class="btn sec" data-u="${esc(p.id)}" data-on="${p.active?1:0}">${p.active?"বন্ধ করুন":"চালু করুন"}</button></div>`).join("")||'<div class="muted">কোনো ইউজার নেই।</div>';
$("uList").querySelectorAll("[data-u]").forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,"allowedUsers",b.dataset.u),{active:b.dataset.on!=="1"})}catch(e){msg("uMsg",err(e))}})}
// ---- start
resetForm();
function sub(name,u,set,after){return onSnapshot(query(collection(db,name),where("ownerUid","==",u.uid),limit(500)),s=>{set(s.docs.map(d=>({id:d.id,...d.data()})));after()},e=>console.error(name,e))}
if(!configured)msg("authMsg","firebase-config.js-এ Firebase config বসান।");
else{const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
onAuthStateChanged(auth,async u=>{if(stopListen){stopListen();stopListen=null}
if(!u){user=null;$("authCard").classList.remove("hidden");$("appArea").classList.add("hidden");rows=audits=stock=debts=pays=people=[];return}
const em=(u.email||"").toLowerCase(),isAdm=em===ADMIN_EMAIL;let ok=isAdm;
if(!ok){try{const s=await getDoc(doc(db,"allowedUsers",em));ok=s.exists()&&s.data().active===true}catch(e){ok=false}}
if(!ok){await signOut(auth);msg("authMsg","এই account-এর অনুমতি নেই বা বন্ধ করা আছে।");return}
user=u;$("authCard").classList.add("hidden");$("appArea").classList.remove("hidden");document.querySelectorAll(".adm").forEach(b=>b.classList.toggle("hidden",!isAdm));
const nm=em.split("@")[0];$("uName").textContent=nm;$("pName").textContent=nm;$("userEmail").textContent=nm;$("pUid").textContent=u.uid;go("dash");
const un=[sub("pgRuns",u,a=>{rows=a.sort((x,y)=>(y.date||"").localeCompare(x.date||"")||ts(y)-ts(x))},()=>{render();renderLog()}),
sub("auditEvents",u,a=>{audits=a.sort((x,y)=>ts(y)-ts(x))},renderLog),sub("fuelStock",u,a=>{stock=a},render),sub("debts",u,a=>{debts=a},render),sub("debtPayments",u,a=>{pays=a},render)];
if(isAdm)un.push(onSnapshot(collection(db,"allowedUsers"),s=>{people=s.docs.map(d=>({id:d.id,...d.data()}));renderUsers()},e=>console.error(e)));
stopListen=()=>un.forEach(f=>f())})}
