const $=id=>document.getElementById(id);
const db=window.supabase?.createClient(window.BIG_ALIEN_SUPABASE_URL,window.BIG_ALIEN_SUPABASE_PUBLISHABLE_KEY);
let adminUser=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function say(id,msg,bad=false){const e=$(id);if(e){e.textContent=msg;e.style.color=bad?'#ff9c9c':'#4bd7d0';}}
async function verifyAdmin(){
  if(!db)throw Error('Supabase client did not load. Check config.js.');
  const {data:{session},error}=await db.auth.getSession();if(error)throw error;
  if(!session){showLogin();return false;}adminUser=session.user;
  const {data:profile,error:profileError}=await db.from('profiles').select('role,full_name').eq('id',adminUser.id).single();
  if(profileError)throw profileError;
  if(profile.role!=='admin'){await db.auth.signOut();showLogin();say('adminLoginMessage','This account does not have administrator permission.',true);return false;}
  $('adminLogin').hidden=true;$('adminPanel').hidden=false;$('adminLogout').hidden=false;
  $('adminWelcome').textContent=`Signed in as ${profile.full_name||adminUser.email} · Administrator`;
  await refreshAll();return true;
}
function showLogin(){$('adminLogin').hidden=false;$('adminPanel').hidden=true;$('adminLogout').hidden=true;}
async function refreshAll(){
  const [tr,ca,ba,pa]=await Promise.all([
    db.from('trade_requests').select('id,user_id,brand,card_value,currency,status,created_at').order('created_at',{ascending:false}),
    db.from('gift_cards').select('id,brand,category,region,rate_ngn_per_usd,is_active').order('brand'),
    db.from('withdrawal_accounts').select('user_id,bank_name,account_name,account_number').order('created_at',{ascending:false}),
    db.from('payouts').select('id,trade_request_id,amount_ngn,status').order('created_at',{ascending:false})
  ]);
  const failure=[tr,ca,ba,pa].find(x=>x.error);if(failure)throw failure.error;
  const trades=tr.data||[],cards=ca.data||[];
  $('tradeTotal').textContent=trades.length;$('tradePending').textContent=trades.filter(t=>t.status==='Pending review').length;
  $('adminTradeRows').innerHTML=trades.map(t=>`<tr><td>${esc(t.id.slice(0,8))}</td><td>${esc(t.user_id.slice(0,8))}</td><td>${esc(t.brand)}</td><td>${esc(t.card_value)} ${esc(t.currency)}</td><td>${esc(t.status)}</td><td><select data-trade-status="${t.id}">${['Pending review','Under review','Approved','Rejected','Paid'].map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="6">No trade requests yet.</td></tr>';
  $('adminCardRows').innerHTML=cards.map(c=>`<tr><td>${esc(c.brand)}</td><td>${esc(c.category)}</td><td>${esc(c.region)}</td><td><input data-rate="${c.id}" type="number" min="0" step="0.01" value="${Number(c.rate_ngn_per_usd)}"></td><td>${c.is_active?'Active':'Disabled'}</td><td><button data-save-rate="${c.id}">Save rate</button> <button data-toggle="${c.id}" data-active="${c.is_active}">${c.is_active?'Disable':'Enable'}</button></td></tr>`).join('')||'<tr><td colspan="6">No gift cards added. Add cards above.</td></tr>';
  $('adminBankRows').innerHTML=(ba.data||[]).map(b=>`<tr><td>${esc(b.user_id.slice(0,8))}</td><td>${esc(b.bank_name)}</td><td>${esc(b.account_name)}</td><td>${esc(b.account_number)}</td></tr>`).join('')||'<tr><td colspan="4">No withdrawal accounts saved.</td></tr>';
  $('adminPayoutRows').innerHTML=(pa.data||[]).map(p=>`<tr><td>${esc(p.trade_request_id.slice(0,8))}</td><td>₦${Number(p.amount_ngn).toLocaleString('en-NG')}</td><td>${esc(p.status)}</td><td>${p.status==='Paid'?'Completed':`<button data-paid="${p.id}">Mark paid</button>`}</td></tr>`).join('')||'<tr><td colspan="4">No payout records yet. Payout creation must be completed before live payouts.</td></tr>';
}
async function login(e){e.preventDefault();try{const {error}=await db.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});if(error)throw error;await verifyAdmin();}catch(err){say('adminLoginMessage',err.message,true);}}
async function addCard(e){e.preventDefault();try{const {error}=await db.from('gift_cards').insert({brand:$('cardBrand').value.trim(),category:$('cardCategory').value,region:$('cardRegion').value.trim(),rate_ngn_per_usd:Number($('cardRate').value),is_active:true});if(error)throw error;say('cardMessage','Gift card added. It is now available in the customer catalogue.');e.target.reset();$('cardRegion').value='United States';await refreshAll();}catch(err){say('cardMessage',err.message,true);}}
async function tableAction(e){const status=e.target.closest('[data-trade-status]'),rate=e.target.closest('[data-save-rate]'),toggle=e.target.closest('[data-toggle]'),paid=e.target.closest('[data-paid]');try{
  if(status){const {error}=await db.from('trade_requests').update({status:status.value}).eq('id',status.dataset.tradeStatus);if(error)throw error;await refreshAll();}
  if(rate){const id=rate.dataset.saveRate,value=Number(document.querySelector(`[data-rate="${id}"]`).value);if(value<0||!Number.isFinite(value))throw Error('Enter a valid rate.');const {error}=await db.from('gift_cards').update({rate_ngn_per_usd:value}).eq('id',id);if(error)throw error;await refreshAll();}
  if(toggle){const {error}=await db.from('gift_cards').update({is_active:toggle.dataset.active!=='true'}).eq('id',toggle.dataset.toggle);if(error)throw error;await refreshAll();}
  if(paid){if(!confirm('Confirm that the bank transfer has already been completed?'))return;const {error}=await db.from('payouts').update({status:'Paid',paid_at:new Date().toISOString()}).eq('id',paid.dataset.paid);if(error)throw error;await refreshAll();}
 }catch(err){alert(err.message);}}
async function boot(){if(!db){say('adminLoginMessage','Supabase configuration missing.',true);return;}$('adminLoginForm').addEventListener('submit',login);$('adminAddCard').addEventListener('submit',addCard);$('refreshAdmin').addEventListener('click',()=>refreshAll().catch(e=>alert(e.message)));$('adminPanel').addEventListener('change',tableAction);$('adminPanel').addEventListener('click',tableAction);$('adminLogout').addEventListener('click',async()=>{await db.auth.signOut();showLogin();});try{await verifyAdmin();}catch(err){showLogin();say('adminLoginMessage',err.message,true);}}
boot();