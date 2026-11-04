// BIG ALIEN GIFT CARD — Supabase-connected client.
const $ = id => document.getElementById(id);
const client = window.supabase?.createClient(
  window.BIG_ALIEN_SUPABASE_URL,
  window.BIG_ALIEN_SUPABASE_PUBLISHABLE_KEY
);
let currentUser = null;
let currentProfile = null;
let cardCache = [];
const supportUrl = "https://wa.me/2347025136166";

function showMessage(id, msg, isError=false) {
  const el=$(id); if(!el)return;
  el.textContent=msg; el.style.color=isError?"#ff9c9c":"#4bd7d0";
}
function showView(name) {
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  const target=$(name+"View"); if(target) target.classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
  if(name==="account") renderAccount();
  if(name==="admin") renderAdmin();
}
function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function requireClient() {
  if(!client) throw new Error("Supabase did not load. Check your internet connection and config.js.");
}
async function loadSession() {
  await requireClient();
  const {data:{session},error}=await client.auth.getSession();
  if(error) throw error;
  currentUser=session?.user||null;
  if(currentUser) await loadProfile();
  updateAccountButton();
}
async function loadProfile() {
  const {data,error}=await client.from("profiles").select("id,full_name,role").eq("id",currentUser.id).single();
  if(error) throw error;
  currentProfile=data;
}
function updateAccountButton() {
  const b=$("accountBtn"); if(b)b.textContent=currentUser?"My account":"Log in";
}
async function loadCards() {
  const {data,error}=await client.from("gift_cards").select("id,brand,category,region,rate_ngn_per_usd,is_active").eq("is_active",true).order("brand");
  if(error) throw error;
  cardCache=data||[];
  renderCards();
  populateBrandSelects();
}
function renderCards() {
  const grid=$("cardGrid"); if(!grid)return;
  const q=($("cardSearch")?.value||"").toLowerCase().trim();
  const active=document.querySelector(".chip.active")?.dataset.category||"All";
  const list=cardCache.filter(c=>(active==="All"||c.category===active)&&c.brand.toLowerCase().includes(q));
  grid.innerHTML=list.map(c=>`<article class="gift-card"><div class="card-logo">${escapeHtml(c.brand.slice(0,2).toUpperCase())}</div><h3>${escapeHtml(c.brand)}</h3><p>${escapeHtml(c.category)} · ${escapeHtml(c.region)}</p><div class="card-bottom"><span>Request a quote</span><button type="button" data-card="${c.id}">Select</button></div></article>`).join("")||"<p>No active gift cards found yet.</p>";
}
function populateBrandSelects() {
  ["rateBrand","tradeBrand"].forEach(id=>{
    const el=$(id); if(!el)return;
    el.innerHTML=cardCache.map(c=>`<option value="${c.id}">${escapeHtml(c.brand)} — ${escapeHtml(c.region)}</option>`).join("");
  });
  calculateEstimate();
}
function calculateEstimate() {
  if(!$("rateBrand"))return;
  const card=cardCache.find(c=>c.id===$("rateBrand").value);
  const amount=Number($("rateAmount").value)||0;
  const rate=Number(card?.rate_ngn_per_usd)||0;
  $("estimateValue").textContent="₦"+Math.round(amount*rate).toLocaleString("en-NG");
  $("estimateHint").textContent=card?`Indicative rate: ₦${rate.toLocaleString("en-NG")} per ${$("rateCurrency")?.value||"USD"}. Final offer requires review.`:"No rate configured for this card.";
}
async function renderAccount() {
  if(!currentUser)return showView("auth");
  $("welcomeName").textContent=`Signed in as ${currentUser.email}`;
  const {data:trades,error}=await client.from("trade_requests").select("id,brand,card_value,currency,status,created_at").eq("user_id",currentUser.id).order("created_at",{ascending:false});
  if(error){showMessage("historyRows",error.message,true);return;}
  const rows=trades||[];
  $("tradeCount").textContent=rows.length;
  $("pendingCount").textContent=rows.filter(x=>["Pending review","Under review"].includes(x.status)).length;
  $("historyRows").innerHTML=rows.map(r=>`<tr><td>${escapeHtml(r.id.slice(0,8))}</td><td>${escapeHtml(r.brand)}</td><td>${escapeHtml(r.card_value)} ${escapeHtml(r.currency)}</td><td>${escapeHtml(r.status)}</td><td>${new Date(r.created_at).toLocaleDateString()}</td></tr>`).join("")||'<tr><td colspan="5">No trade requests yet.</td></tr>';
  const {data:bank}=await client.from("withdrawal_accounts").select("bank_name,account_name,account_number").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(bank){$("bankName").value=bank.bank_name;$("bankAccountName").value=bank.account_name;$("bankAccountNumber").value=bank.account_number;}
}
async function authSubmit(e) {
  e.preventDefault();
  try {
    const email=$("authEmail").value.trim(), password=$("authPassword").value;
    if(authMode==="signup") {
      const {data,error}=await client.auth.signUp({email,password,options:{data:{full_name:$("authName").value.trim()}}});
      if(error)throw error;
      if(data.session){currentUser=data.user;await loadProfile();showView("account");}
      else showMessage("authSubtitle","Account created. Check your email to confirm, then log in.");
    } else {
      const {data,error}=await client.auth.signInWithPassword({email,password});
      if(error)throw error;
      currentUser=data.user;await loadProfile();showView("account");
    }
    updateAccountButton();
  } catch(err){showMessage("authSubtitle",err.message,true);}
}
async function saveBank(e) {
  e.preventDefault(); if(!currentUser)return showView("auth");
  const bank_name=$("bankName").value, account_name=$("bankAccountName").value.trim(), account_number=$("bankAccountNumber").value.trim();
  if(!/^\d{10}$/.test(account_number)){showMessage("bankMessage","Enter a valid 10-digit Nigerian account number.",true);return;}
  try {
    const {data:existing,error:findError}=await client.from("withdrawal_accounts").select("id").eq("user_id",currentUser.id).limit(1).maybeSingle();
    if(findError)throw findError;
    const payload={user_id:currentUser.id,bank_name,account_name,account_number};
    const result=existing
      ? await client.from("withdrawal_accounts").update(payload).eq("id",existing.id)
      : await client.from("withdrawal_accounts").insert(payload);
    if(result.error)throw result.error;
    showMessage("bankMessage","Withdrawal account saved securely to your account.");
  } catch(err){showMessage("bankMessage",err.message,true);}
}
async function submitTrade(e) {
  e.preventDefault(); if(!currentUser)return showView("auth");
  const card=cardCache.find(c=>c.id===$("tradeBrand").value);
  if(!card){showMessage("tradeMessage","Please select an active gift card.",true);return;}
  try {
    const {error}=await client.from("trade_requests").insert({
      user_id:currentUser.id, gift_card_id:card.id, brand:card.brand,
      region:$("tradeCountry").value, card_value:Number($("tradeAmount").value),
      currency:$("tradeCurrency").value, customer_note:$("tradeNotes").value.trim(),
      status:"Pending review"
    });
    if(error)throw error;
    showMessage("tradeMessage","Trade request submitted. You can follow its status in My account.");
    e.target.reset(); await renderAccount();
  } catch(err){showMessage("tradeMessage",err.message,true);}
}
async function renderAdmin() {
  if(!currentUser||currentProfile?.role!=="admin"){showView("home");alert("Admin access only.");return;}
  const [{data:trades,error:tErr},{data:cards,error:cErr},{data:banks,error:bErr},{data:payouts,error:pErr}]=await Promise.all([
    client.from("trade_requests").select("id,user_id,brand,card_value,currency,status,created_at").order("created_at",{ascending:false}),
    client.from("gift_cards").select("*").order("brand"),
    client.from("withdrawal_accounts").select("user_id,bank_name,account_name,account_number").order("created_at",{ascending:false}),
    client.from("payouts").select("id,trade_request_id,user_id,amount_ngn,status").order("created_at",{ascending:false})
  ]);
  const err=[tErr,cErr,bErr,pErr].find(Boolean); if(err){alert("Admin data error: "+err.message);return;}
  $("adminTotal").textContent=(trades||[]).length;
  $("adminPending").textContent=(trades||[]).filter(t=>t.status==="Pending review").length;
  $("adminRows").innerHTML=(trades||[]).map(t=>`<tr><td>${escapeHtml(t.id.slice(0,8))}</td><td>${escapeHtml(t.user_id.slice(0,8))}</td><td>${escapeHtml(t.brand)}</td><td>${escapeHtml(t.card_value)} ${escapeHtml(t.currency)}</td><td>${escapeHtml(t.status)}</td><td><select data-trade-status="${t.id}">${["Pending review","Under review","Approved","Rejected","Paid"].map(s=>`<option ${s===t.status?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("")||'<tr><td colspan="6">No trade requests yet.</td></tr>';
  $("adminCardRows").innerHTML=(cards||[]).map(c=>`<tr><td>${escapeHtml(c.brand)}</td><td>${escapeHtml(c.region)}</td><td><input type="number" min="0" step=".01" value="${c.rate_ngn_per_usd}" data-rate="${c.id}" style="width:105px"></td><td>${c.is_active?"Yes":"No"}</td><td><button class="card-bottom" data-save-rate="${c.id}">Save rate</button> <button data-toggle-card="${c.id}" data-active="${c.is_active}">${c.is_active?"Disable":"Enable"}</button></td></tr>`).join("");
  $("adminBankRows").innerHTML=(banks||[]).map(b=>`<tr><td>${escapeHtml(b.user_id.slice(0,8))}</td><td>${escapeHtml(b.bank_name)}</td><td>${escapeHtml(b.account_name)}</td><td>${escapeHtml(b.account_number)}</td></tr>`).join("")||'<tr><td colspan="4">No saved withdrawal accounts.</td></tr>';
  $("adminPayoutRows").innerHTML=(payouts||[]).map(p=>`<tr><td>${escapeHtml(p.trade_request_id.slice(0,8))}</td><td>₦${Number(p.amount_ngn).toLocaleString("en-NG")}</td><td>${escapeHtml(p.status)}</td><td>${p.status!=="Paid"?`<button data-mark-paid="${p.id}">Mark paid</button>`:"Completed"}</td></tr>`).join("")||'<tr><td colspan="4">No payouts created yet. Payout creation is enabled after trade approval workflow is configured.</td></tr>';
}
async function addCard(e) {
  e.preventDefault();
  try{
    const {error}=await client.from("gift_cards").insert({brand:$("newCardBrand").value.trim(),category:$("newCardCategory").value,region:$("newCardRegion").value.trim(),rate_ngn_per_usd:Number($("newCardRate").value),is_active:true});
    if(error)throw error;showMessage("adminCardMessage","Gift card and rate added.");e.target.reset();await renderAdmin();await loadCards();
  }catch(err){showMessage("adminCardMessage",err.message,true);}
}
async function adminTableChange(e){
  const status=e.target.closest("[data-trade-status]");
  if(status){try{const {error}=await client.from("trade_requests").update({status:status.value}).eq("id",status.dataset.tradeStatus);if(error)throw error;await renderAdmin();}catch(err){alert(err.message);}return;}
}
async function adminTableClick(e){
  const rateBtn=e.target.closest("[data-save-rate]");
  const toggle=e.target.closest("[data-toggle-card]");
  const paid=e.target.closest("[data-mark-paid]");
  try{
    if(rateBtn){const id=rateBtn.dataset.saveRate;const val=document.querySelector(`[data-rate="${id}"]`).value;const {error}=await client.from("gift_cards").update({rate_ngn_per_usd:Number(val)}).eq("id",id);if(error)throw error;alert("Rate updated.");await renderAdmin();await loadCards();}
    if(toggle){const {error}=await client.from("gift_cards").update({is_active:toggle.dataset.active!=="true"}).eq("id",toggle.dataset.toggleCard);if(error)throw error;await renderAdmin();await loadCards();}
    if(paid){const {error}=await client.from("payouts").update({status:"Paid",paid_at:new Date().toISOString()}).eq("id",paid.dataset.markPaid);if(error)throw error;alert("Payout marked paid. Confirm the bank transfer has already been sent.");await renderAdmin();}
  }catch(err){alert(err.message);}
}
async function signOut(){await client.auth.signOut();currentUser=null;currentProfile=null;updateAccountButton();showView("home");}
let authMode="login";
function bindEvents(){
  document.addEventListener("click",e=>{
    const v=e.target.closest("[data-view]");
    if(v){e.preventDefault();const name=v.dataset.view;if(name==="admin"&&currentProfile?.role!=="admin"){alert("Admin access only.");return;}if(name==="trade"&&!currentUser){showView("auth");return;}showView(name);}
  });
  $("accountBtn").addEventListener("click",()=>showView(currentUser?"account":"auth"));
  $("tradeNavBtn").addEventListener("click",()=>showView(currentUser?"trade":"auth"));
  document.addEventListener("click",e=>{
    if(!e.target.closest("#switchAuth"))return;
    authMode=authMode==="login"?"signup":"login";
    $("authTitle").textContent=authMode==="login"?"Welcome back":"Create your account";
    $("authSubtitle").textContent=authMode==="login"?"Log in to view your trades.":"Create an account to trade gift cards.";
    $("authName").parentElement.hidden=authMode==="login";$("authName").required=authMode==="signup";
    $("authSubmit").textContent=authMode==="login"?"Log in":"Create account";
    $("authSwitchText").innerHTML=authMode==="login"?'New here? <button class="inline-link" id="switchAuth">Create an account</button>':'Already registered? <button class="inline-link" id="switchAuth">Log in</button>';
  });
  $("authForm").addEventListener("submit",authSubmit);
  $("bankForm").addEventListener("submit",saveBank);
  $("tradeForm").addEventListener("submit",submitTrade);
  $("adminCardForm").addEventListener("submit",addCard);
  $("adminRows").addEventListener("change",adminTableChange);
  $("adminCardRows").addEventListener("click",adminTableClick);
  $("adminPayoutRows").addEventListener("click",adminTableClick);
  $("adminExit").addEventListener("click",()=>showView("home"));
  $("logoutBtn").addEventListener("click",signOut);
  $("cardSearch").addEventListener("input",renderCards);
  document.querySelectorAll(".chip").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderCards();}));
  $("cardGrid").addEventListener("click",e=>{const b=e.target.closest("[data-card]");if(!b)return;$("tradeBrand").value=b.dataset.card;if(!currentUser)showView("auth");else showView("trade");});
  $("rateBrand").addEventListener("change",calculateEstimate);$("rateAmount").addEventListener("input",calculateEstimate);
  $("year").textContent=new Date().getFullYear();
  $("authName").parentElement.hidden=true;
}
async function init(){
  bindEvents();
  if(!client){alert("Supabase configuration is missing.");return;}
  try{await loadSession();await loadCards();if(currentUser)showView("account");}
  catch(err){console.error(err);alert("Connection/setup error: "+err.message);}
}
init();
