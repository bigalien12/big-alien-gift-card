// BIG ALIEN GIFT CARD — customer portal
const $ = id => document.getElementById(id);
const supabaseClient = window.supabase?.createClient(window.BIG_ALIEN_SUPABASE_URL, window.BIG_ALIEN_SUPABASE_PUBLISHABLE_KEY);
let currentUser = null;
let cards = [];
let authMode = 'login';
let pendingCardId = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function message(id, text, error=false) { const el=$(id); if(el){el.textContent=text;el.style.color=error?'#ff9c9c':'#4bd7d0';} }
function showView(name) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const view=$(name+'View'); if(view)view.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  if(name==='account') loadAccount();
  if(name==='trade' && pendingCardId) $('tradeBrand').value=pendingCardId;
}
function selectedCard(id) { return cards.find(c=>c.id===id); }
function renderCards() {
  const grid=$('cardGrid'); if(!grid)return;
  const query=($('cardSearch').value||'').trim().toLowerCase();
  const category=document.querySelector('.chip.active')?.dataset.category||'All';
  const filtered=cards.filter(c=>(category==='All'||c.category===category)&&c.brand.toLowerCase().includes(query));
  grid.innerHTML=filtered.map(c=>`<article class="gift-card"><div class="card-logo">${escapeHtml(c.brand.slice(0,2).toUpperCase())}</div><h3>${escapeHtml(c.brand)}</h3><p>${escapeHtml(c.category)} · ${escapeHtml(c.region)}</p><div class="card-bottom"><span>${Number(c.rate_ngn_per_usd)>0?'Rate available':'Quote on review'}</span><button type="button" data-select-card="${c.id}">Select card</button></div></article>`).join('') || '<p>No gift cards are listed yet. Please check back soon.</p>';
}
function fillCardSelects() {
  const options=cards.map(c=>`<option value="${c.id}">${escapeHtml(c.brand)} — ${escapeHtml(c.region)}</option>`).join('');
  ['tradeBrand','rateBrand'].forEach(id=>{const el=$(id);if(el)el.innerHTML='<option value="">Choose a gift card</option>'+options;});
  if(pendingCardId && $('tradeBrand')) $('tradeBrand').value=pendingCardId;
  calculateEstimate();
}
function calculateEstimate() {
  const card=selectedCard($('rateBrand')?.value);
  const amount=Number($('rateAmount')?.value)||0;
  const rate=Number(card?.rate_ngn_per_usd)||0;
  if($('estimateValue')) $('estimateValue').textContent=rate>0?'₦'+Math.round(amount*rate).toLocaleString('en-NG'):'Quote after review';
  if($('estimateHint')) $('estimateHint').textContent=card?(rate>0?`Indicative rate: ₦${rate.toLocaleString('en-NG')} per USD. Final offer requires review.`:'No rate has been published for this card yet.'):'Choose a gift card to view its rate.';
}
async function loadAccount() {
  if(!currentUser){showView('auth');return;}
  $('welcomeName').textContent=`Signed in as ${currentUser.email}`;
  const {data:trades,error}=await supabaseClient.from('trade_requests').select('id,brand,card_value,currency,status,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false});
  if(error){message('historyRows',error.message,true);return;}
  const rows=trades||[];
  $('tradeCount').textContent=rows.length;
  $('pendingCount').textContent=rows.filter(t=>['Pending review','Under review'].includes(t.status)).length;
  $('historyRows').innerHTML=rows.map(t=>`<tr><td>${escapeHtml(t.id.slice(0,8))}</td><td>${escapeHtml(t.brand)}</td><td>${escapeHtml(t.card_value)} ${escapeHtml(t.currency)}</td><td>${escapeHtml(t.status)}</td><td>${new Date(t.created_at).toLocaleDateString()}</td></tr>`).join('')||'<tr><td colspan="5">No trade requests yet.</td></tr>';
  const {data:bank}=await supabaseClient.from('withdrawal_accounts').select('bank_name,account_name,account_number').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(bank){$('bankName').value=bank.bank_name;$('bankAccountName').value=bank.account_name;$('bankAccountNumber').value=bank.account_number;}
}
async function authSubmit(event) {
  event.preventDefault();
  try {
    const email=$('authEmail').value.trim(), password=$('authPassword').value;
    if(authMode==='signup') {
      const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name:$('authName').value.trim()}}});
      if(error)throw error;
      if(!data.session){message('authSubtitle','Account created. Check your email to confirm, then log in.');return;}
      currentUser=data.user;
    } else {
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error)throw error; currentUser=data.user;
    }
    $('accountBtn').textContent='My account';
    if(pendingCardId){$('tradeBrand').value=pendingCardId;showView('trade');}else showView('account');
  } catch(error){message('authSubtitle',error.message,true);}
}
async function saveBank(event) {
  event.preventDefault(); if(!currentUser){showView('auth');return;}
  const account_number=$('bankAccountNumber').value.trim();
  if(!/^\d{10}$/.test(account_number)){message('bankMessage','Enter a valid 10-digit Nigerian account number.',true);return;}
  const payload={user_id:currentUser.id,bank_name:$('bankName').value,account_name:$('bankAccountName').value.trim(),account_number};
  try {
    const {data:existing,error:findError}=await supabaseClient.from('withdrawal_accounts').select('id').eq('user_id',currentUser.id).limit(1).maybeSingle();
    if(findError)throw findError;
    const result=existing?await supabaseClient.from('withdrawal_accounts').update(payload).eq('id',existing.id):await supabaseClient.from('withdrawal_accounts').insert(payload);
    if(result.error)throw result.error;
    message('bankMessage','Withdrawal account saved.');
  } catch(error){message('bankMessage',error.message,true);}
}
async function submitTrade(event) {
  event.preventDefault(); if(!currentUser){showView('auth');return;}
  const card=selectedCard($('tradeBrand').value);
  if(!card){message('tradeMessage','Please select a gift card first.',true);return;}
  const value=Number($('tradeAmount').value);
  if(!Number.isFinite(value)||value<=0){message('tradeMessage','Enter a valid card value.',true);return;}
  try {
    const {error}=await supabaseClient.from('trade_requests').insert({user_id:currentUser.id,gift_card_id:card.id,brand:card.brand,region:$('tradeCountry').value,card_value:value,currency:$('tradeCurrency').value,customer_name:$('tradeName').value.trim(),customer_email:$('tradeEmail').value.trim(),customer_contact:$('tradeContact').value.trim(),customer_note:$('tradeNotes').value.trim(),status:'Pending review'});
    if(error)throw error;
    message('tradeMessage','Your trade request was submitted successfully.');
    pendingCardId=null;event.target.reset();await loadAccount();showView('account');
  } catch(error){message('tradeMessage',error.message,true);}
}
async function signOut(){await supabaseClient.auth.signOut();currentUser=null;$('accountBtn').textContent='Log in';showView('home');}
function bind() {
  document.addEventListener('click',event=>{
    const cardButton=event.target.closest('[data-select-card]');
    if(cardButton){pendingCardId=cardButton.dataset.selectCard;if(!currentUser)showView('auth');else{$('tradeBrand').value=pendingCardId;showView('trade');}return;}
    const viewButton=event.target.closest('[data-view]');
    if(viewButton){event.preventDefault();const target=viewButton.dataset.view;if(target==='trade'&&!currentUser){pendingCardId=$('tradeBrand').value||pendingCardId;showView('auth');}else showView(target);return;}
    if(event.target.closest('#switchAuth')){
      authMode=authMode==='login'?'signup':'login';
      $('authTitle').textContent=authMode==='login'?'Welcome back':'Create your account';
      $('authSubtitle').textContent=authMode==='login'?'Log in to view your gift card trades.':'Create an account to trade gift cards.';
      $('authName').parentElement.hidden=authMode==='login';$('authName').required=authMode==='signup';
      $('authSubmit').textContent=authMode==='login'?'Log in':'Create account';
      $('authSwitchText').innerHTML=authMode==='login'?'New here? <button class="inline-link" id="switchAuth" type="button">Create an account</button>':'Already registered? <button class="inline-link" id="switchAuth" type="button">Log in</button>';
    }
  });
  $('accountBtn').addEventListener('click',()=>showView(currentUser?'account':'auth'));
  $('tradeNavBtn').addEventListener('click',()=>showView(currentUser?'trade':'auth'));
  $('authForm').addEventListener('submit',authSubmit);$('bankForm').addEventListener('submit',saveBank);$('tradeForm').addEventListener('submit',submitTrade);$('logoutBtn').addEventListener('click',signOut);
  $('cardSearch').addEventListener('input',renderCards);
  document.querySelectorAll('.chip').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));button.classList.add('active');renderCards();}));
  $('rateBrand').addEventListener('change',calculateEstimate);$('rateAmount').addEventListener('input',calculateEstimate);
  $('tradeBrand').addEventListener('change',()=>{pendingCardId=$('tradeBrand').value;});
  $('year').textContent=new Date().getFullYear();$('authName').parentElement.hidden=true;
}
async function init(){
  bind();
  if(!supabaseClient){message('authSubtitle','Supabase configuration failed to load. Refresh the page or check config.js.',true);return;}
  try {
    const {data:{session},error}=await supabaseClient.auth.getSession();if(error)throw error;
    currentUser=session?.user||null;if(currentUser)$('accountBtn').textContent='My account';
    const {data,error:cardError}=await supabaseClient.from('gift_cards').select('id,brand,category,region,rate_ngn_per_usd,is_active').eq('is_active',true).order('brand');
    if(cardError)throw cardError;cards=data||[];renderCards();fillCardSelects();
    if(location.hash==='#trade'&&!currentUser)showView('auth');
  } catch(error){console.error(error);const grid=$('cardGrid');if(grid)grid.innerHTML=`<p>Could not load gift cards: ${escapeHtml(error.message)}</p>`;}
}
init();
