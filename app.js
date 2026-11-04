// BIG ALIEN GIFT CARD — customer app
const $ = (id) => document.getElementById(id);
const db = window.supabase?.createClient(
  window.BIG_ALIEN_SUPABASE_URL,
  window.BIG_ALIEN_SUPABASE_PUBLISHABLE_KEY
);
let currentUser = null,
  cards = [],
  rates = [],
  authMode = "login",
  pendingCardId = null,
  selectedImages = [],
  activeOrderFilter = "all",
  timerHandle = null;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
const money = (n) =>
  "₦" +
  Number(n || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function msg(id, t, bad = false) {
  const e = $(id);
  if (e) {
    e.textContent = t;
    e.style.color = bad ? "#b42318" : "#9a4b12";
  }
}
function showView(name) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  $(name + "View")?.classList.add("active");
  document
    .querySelectorAll(".bottom-nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (["account", "order", "message", "user"].includes(name) && !currentUser) {
    showView("auth");
    return;
  }
  if (name === "account") {
    loadAccount();
    loadProfile();
  }
  if (name === "order") loadOrders();
  if (name === "message") loadMessages();
  if (name === "user") loadProfile();
  if (name === "trade" && pendingCardId && $("tradeBrand"))
    $("tradeBrand").value = pendingCardId;
  if (name === "trade") updateEstimate();
  document.body.classList.toggle("trade-active", name === "trade");
}
function chosenRate(cardId, currency) {
  return rates.find(
    (r) => r.gift_card_id === cardId && r.currency === currency && r.is_active
  );
}
function estimate(cardId, currency, amount) {
  const r = chosenRate(cardId, currency);
  return r && Number(amount) > 0
    ? Number(amount) * Number(r.rate_ngn_per_unit)
    : null;
}
function renderCards() {
  const q = ($("cardSearch")?.value || "").trim().toLowerCase(),
    cat = document.querySelector(".chip.active")?.dataset.category || "All";
  const list = cards.filter(
    (c) =>
      (cat === "All" || c.category === cat) && c.brand.toLowerCase().includes(q)
  );
  $("cardGrid").innerHTML =
    list
      .map(
        (c) =>
          `<article class="gift-card"><div class="card-logo">${esc( c.brand.slice(0, 2).toUpperCase() )}</div><h3>${esc(c.brand)}</h3><p>${esc(c.category)} · ${esc( c.region )}</p><div class="card-bottom"><span>${ rates.some( (r) => r.gift_card_id === c.id && r.is_active && Number(r.rate_ngn_per_unit) > 0 ) ? "Rates available" : "Quote on review" }</span><button type="button" data-select-card="${ c.id }">Sell</button></div></article>`
      )
      .join("") || "<p>No gift cards found.</p>";
}
function fillCards() {
  const opts = cards
    .map(
      (c) =>
        `<option value="${c.id}">${esc(c.brand)} — ${esc(c.region)}</option>`
    )
    .join("");
  ["tradeBrand", "rateBrand"].forEach((id) => {
    if ($(id))
      $(id).innerHTML = '<option value="">Choose gift card</option>' + opts;
  });
  if (pendingCardId && $("tradeBrand")) $("tradeBrand").value = pendingCardId;
  updateEstimate();
}
function updateEstimate() {
  const tradeId = $("tradeBrand")?.value,
    currency = $("tradeCurrency")?.value || "USD",
    amount = $("tradeAmount")?.value || 0,
    card = cards.find((c) => c.id === tradeId),
    r = chosenRate(tradeId, currency),
    value = estimate(tradeId, currency, amount);
  if ($("tradeEstimate"))
    $("tradeEstimate").textContent =
      value === null ? "Rate not available" : money(value);
  if ($("tradeRateHint"))
    $("tradeRateHint").textContent = r
      ? `₦${Number(r.rate_ngn_per_unit).toLocaleString( "en-NG" )} per ${currency}`
      : "No verified rate for this card and currency yet.";
  if ($("tradeCardName"))
    $("tradeCardName").textContent = card?.brand || "Choose a gift card";
  if ($("tradeCardCurrency"))
    $("tradeCardCurrency").textContent = `Currency: ${currency}`;
  if ($("tradeCurrencyLabel")) $("tradeCurrencyLabel").textContent = currency;
  if ($("tradeCardLimits"))
    $("tradeCardLimits").textContent = r
      ? `Limits: ${r.min_card_value ?? "—"}–${ r.max_card_value ?? "—" } ${currency}`
      : "Limits: Not published";
  if ($("tradeCardRate"))
    $("tradeCardRate").textContent = r
      ? `1 ${currency} = ${money(r.rate_ngn_per_unit)}`
      : "Rate not available";
  if ($("tradeCardArt"))
    $("tradeCardArt").textContent = card
      ? card.brand.slice(0, 2).toUpperCase()
      : "👽";
  if ($("estimateValue"))
    $("estimateValue").textContent =
      value === null ? "Rate not available" : money(value);
  if ($("estimateHint"))
    $("estimateHint").textContent = r
      ? `₦${Number(r.rate_ngn_per_unit).toLocaleString( "en-NG" )} per ${currency}`
      : "No verified rate has been published.";
}
function renderImagePreviews() {
  $("imagePreview").innerHTML = selectedImages
    .map(
      (f, i) =>
        `<div class="preview"><img alt="Card picture ${ i + 1 }" src="${URL.createObjectURL( f )}"><button type="button" class="remove-preview" data-remove-image="${i}" aria-label="Remove picture">×</button><small>${esc( f.name )}</small></div>`
    )
    .join("");
}
function previewFiles() {
  const incoming = Array.from($("tradeImages").files || []);
  if (selectedImages.length + incoming.length > 9) {
    msg(
      "tradeMessage",
      "Maximum 9 pictures. Remove a picture before adding more.",
      true
    );
    $("tradeImages").value = "";
    return;
  }
  if (
    incoming.some(
      (f) =>
        !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
        f.size > 10 * 1024 * 1024
    )
  ) {
    msg(
      "tradeMessage",
      "Use JPG, PNG or WebP pictures, each no larger than 10 MB.",
      true
    );
    $("tradeImages").value = "";
    return;
  }
  selectedImages.push(...incoming);
  $("tradeImages").value = "";
  renderImagePreviews();
}
let customerProfile = { full_name: "", phone_number: "" };
async function loadProfile() {
  const { data, error } = await db
    .from("profiles")
    .select("full_name,phone_number")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (error) console.warn(error);
  customerProfile = {
    full_name: data?.full_name || currentUser.user_metadata?.full_name || "",
    phone_number: data?.phone_number || "",
  };
  $("profileName").textContent =
    customerProfile.full_name ||
    currentUser.email?.split("@")[0] ||
    "My profile";
  $("profileEmail").textContent = currentUser.email || "";
  if ($("profileFullName"))
    $("profileFullName").value = customerProfile.full_name;
  if ($("profileEmailAddress"))
    $("profileEmailAddress").value = currentUser.email || "";
  if ($("profilePhone")) $("profilePhone").value = customerProfile.phone_number;
}
async function saveProfile(e) {
  e.preventDefault();
  if (!currentUser) return showView("auth");
  const full_name = $("profileFullName").value.trim(),
    phone_number = $("profilePhone").value.trim();
  if (!full_name || !phone_number)
    return msg("profileMessage", "Enter your name and contact number.", true);
  try {
    const { error } = await db
      .from("profiles")
      .update({ full_name, phone_number })
      .eq("id", currentUser.id);
    if (error) throw error;
    customerProfile = { full_name, phone_number };
    $("profileName").textContent = full_name;
    msg(
      "profileMessage",
      "Personal details saved. They will be added to your sell orders."
    );
  } catch (err) {
    msg("profileMessage", err.message, true);
  }
}
async function loadAccount() {
  if (!currentUser) return;
  const { data: bank } = await db
    .from("withdrawal_accounts")
    .select("bank_name,account_name,account_number")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bank) {
    $("bankName").value = bank.bank_name;
    $("bankAccountName").value = bank.account_name;
    $("bankAccountNumber").value = bank.account_number;
  }
  const { data: payouts, error } = await db
    .from("payouts")
    .select("id,trade_request_id,amount_ngn,status,paid_at,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error) {
    msg("bankMessage", error.message, true);
    return;
  }
  const rows = payouts || [];
  const paid = rows.filter((p) => p.status === "Paid");
  $("availableBalance").textContent = money(
    paid.reduce((s, p) => s + Number(p.amount_ngn || 0), 0)
  );
  $("payoutRows").innerHTML =
    rows
      .map(
        (p) =>
          `<tr><td>${esc( String(p.trade_request_id).slice(0, 8) )}</td><td>${money(p.amount_ngn)}</td><td>${esc(p.status)}</td><td>${ p.paid_at ? new Date(p.paid_at).toLocaleString() : new Date(p.created_at).toLocaleDateString() }</td></tr>`
      )
      .join("") || '<tr><td colspan="4">No payout records yet.</td></tr>';
}
async function saveBank(e) {
  e.preventDefault();
  if (!currentUser) return showView("auth");
  const account_number = $("bankAccountNumber").value.trim();
  if (!/^\d{10}$/.test(account_number)) {
    msg("bankMessage", "Enter a valid 10-digit Nigerian account number.", true);
    return;
  }
  const payload = {
    user_id: currentUser.id,
    bank_name: $("bankName").value,
    account_name: $("bankAccountName").value.trim(),
    account_number,
  };
  try {
    const { data: old, error: findErr } = await db
      .from("withdrawal_accounts")
      .select("id")
      .eq("user_id", currentUser.id)
      .limit(1)
      .maybeSingle();
    if (findErr) throw findErr;
    const res = old
      ? await db.from("withdrawal_accounts").update(payload).eq("id", old.id)
      : await db.from("withdrawal_accounts").insert(payload);
    if (res.error) throw res.error;
    msg("bankMessage", "Bank account saved securely.");
  } catch (e) {
    msg("bankMessage", e.message, true);
  }
}
async function submitTrade(e) {
  e.preventDefault();
  if (!currentUser) return showView("auth");
  const card = cards.find((c) => c.id === $("tradeBrand").value),
    value = Number($("tradeAmount").value),
    currency = $("tradeCurrency").value;
  if (!card || !Number.isFinite(value) || value <= 0)
    return msg("tradeMessage", "Choose a card and enter a valid amount.", true);
  if (!customerProfile.full_name || !customerProfile.phone_number) {
    msg(
      "tradeMessage",
      "Please save your name and contact number in Account Management first.",
      true
    );
    showView("account");
    return;
  }
  if (!selectedImages.length)
    return msg(
      "tradeMessage",
      "Please upload at least one clear card picture.",
      true
    );
  if (selectedImages.length > 9)
    return msg("tradeMessage", "Maximum 9 images.", true);
  const rate = chosenRate(card.id, currency);
  const payout = rate ? value * Number(rate.rate_ngn_per_unit) : null;
  if (
    rate &&
    ((rate.min_card_value != null && value < Number(rate.min_card_value)) ||
      (rate.max_card_value != null && value > Number(rate.max_card_value)))
  )
    return msg(
      "tradeMessage",
      `This card's accepted limit is ${rate.min_card_value ?? "—"} to ${ rate.max_card_value ?? "—" } ${currency}.`,
      true
    );
  const button = e.submitter;
  try {
    button.disabled = true;
    button.textContent = "Submitting...";
    const payload = {
      user_id: currentUser.id,
      gift_card_id: card.id,
      brand: card.brand,
      region: card.region || "Other",
      card_value: value,
      currency,
      customer_name: customerProfile.full_name,
      customer_email: currentUser.email || "",
      customer_contact: customerProfile.phone_number,
      customer_note: $("tradeNotes").value.trim(),
      status: "Pending review",
      exchange_rate: rate ? Number(rate.rate_ngn_per_unit) : null,
      estimated_payout_ngn: payout,
    };
    const { data: order, error } = await db
      .from("trade_requests")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    let failed = [];
    for (let i = 0; i < selectedImages.length; i++) {
      const file = selectedImages[i],
        ext =
          file.name
            .split(".")
            .pop()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg",
        path = `${currentUser.id}/${order.id}/${crypto.randomUUID()}.${ext}`;
      const up = await db.storage
        .from("trade-card-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) {
        failed.push(file.name + ": " + up.error.message);
        continue;
      }
      const rec = await db
        .from("trade_card_images")
        .insert({
          trade_request_id: order.id,
          user_id: currentUser.id,
          object_path: path,
        });
      if (rec.error) failed.push(file.name + ": " + rec.error.message);
    }
    msg(
      "tradeMessage",
      failed.length
        ? `Order ${order.id.slice( 0, 8 )} created, but some pictures failed: ${failed.join("; ")}`
        : `Trade submitted! Reference: ${order.id.slice( 0, 8 )}. Your 30-minute review timer has started.`,
      failed.length > 0
    );
    e.target.reset();
    selectedImages = [];
    $("imagePreview").innerHTML = "";
    pendingCardId = null;
    await loadOrders();
    showView("order");
  } catch (err) {
    msg("tradeMessage", err.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Submit trade request →";
  }
}
function countdown(deadline) {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "Time elapsed — awaiting review";
  const m = Math.floor(ms / 60000),
    s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s remaining`;
}
function startTimers() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(
    () =>
      document
        .querySelectorAll("[data-deadline]")
        .forEach((el) => (el.textContent = countdown(el.dataset.deadline))),
    1000
  );
}
async function showOrderDetail(id) {
  const { data: t, error } = await db
    .from("trade_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return alert(error.message);
  const { data: imgs } = await db
    .from("trade_card_images")
    .select("object_path")
    .eq("trade_request_id", id);
  const urls = [];
  for (const im of imgs || []) {
    const x = await db.storage
      .from("trade-card-images")
      .createSignedUrl(im.object_path, 300);
    if (x.data?.signedUrl) urls.push(x.data.signedUrl);
  }
  const d = $("orderDetail");
  d.hidden = false;
  d.innerHTML = `<button class="back-link" id="closeOrderDetail">← Back to orders</button><h3>${esc( t.brand )} · ${esc(t.card_value)} ${esc(t.currency)}</h3><p><b>Reference:</b> ${esc( t.id )}</p><p><b>Status:</b> ${esc(t.status)}</p><p><b>Order value:</b> ${ t.estimated_payout_ngn == null ? "Awaiting quote" : money(t.estimated_payout_ngn) }</p><p><b>Review timer:</b> <strong data-deadline="${esc( t.deadline_at || "" )}">${ t.deadline_at ? countdown(t.deadline_at) : "Not available for this order" }</strong></p><p><b>Submitted:</b> ${new Date( t.submitted_at || t.created_at ).toLocaleString()}</p><p><b>Admin remark:</b> ${esc( t.admin_note || "No remark yet." )}</p><div class="preview-grid">${urls .map( (u) => `<img class="order-image" src="${u}" alt="Submitted card image">` ) .join( "" )}</div><a class="btn btn-primary" href="https://wa.me/2347025136166" target="_blank" rel="noopener">Contact support</a>`;
  $("orderDetail").scrollIntoView({ behavior: "smooth" });
}
async function loadOrders() {
  if (!currentUser) return;
  const { data, error } = await db
    .from("trade_requests")
    .select(
      "id,brand,card_value,currency,status,created_at,submitted_at,deadline_at,estimated_payout_ngn"
    )
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error) {
    $("orderList").textContent = error.message;
    return;
  }
  let rows = data || [];
  if (activeOrderFilter === "processing")
    rows = rows.filter((t) =>
      ["Pending review", "Under review", "Approved"].includes(t.status)
    );
  else if (activeOrderFilter !== "all")
    rows = rows.filter((t) => t.status === activeOrderFilter);
  $("orderList").innerHTML =
    rows
      .map(
        (t) =>
          `<button class="order-row" data-order-id="${t.id}"><span><b>${esc( t.brand )}</b><small>${esc(t.card_value)} ${esc(t.currency)} · ${new Date( t.created_at ).toLocaleDateString()}</small><small class="status">${esc( t.status )}</small></span><span>›</span></button>`
      )
      .join("") || '<p class="muted">No orders in this category yet.</p>';
  startTimers();
}
async function loadMessages() {
  if (!currentUser) return;
  const { data, error } = await db
    .from("customer_messages")
    .select("id,sender_role,message,created_at,read_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });
  if (error) {
    $("messageList").textContent = error.message;
    return;
  }
  $("messageList").innerHTML =
    (data || [])
      .map(
        (m) =>
          `<article class="message ${ m.sender_role === "customer" ? "mine" : "theirs" }"><small>${ m.sender_role === "admin" ? "BIG ALIEN Support" : "You" } · ${new Date(m.created_at).toLocaleString()}</small><p>${esc( m.message )}</p></article>`
      )
      .join("") ||
    '<p class="muted">No messages yet. Send us a message below.</p>';
}
async function sendMessage(e) {
  e.preventDefault();
  const text = $("messageText").value.trim();
  if (!text) return;
  const { error } = await db
    .from("customer_messages")
    .insert({
      user_id: currentUser.id,
      sender_role: "customer",
      message: text,
    });
  if (error) {
    msg("messageStatus", error.message, true);
    return;
  }
  $("messageText").value = "";
  msg("messageStatus", "Message sent.");
  await loadMessages();
}
async function authSubmit(e) {
  e.preventDefault();
  try {
    const email = $("authEmail").value.trim(),
      password = $("authPassword").value;
    if (authMode === "signup") {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { full_name: $("authName").value.trim() } },
      });
      if (error) throw error;
      if (!data.session) {
        msg(
          "authMessage",
          "Account created. Check your email to confirm, then log in."
        );
        return;
      }
      currentUser = data.user;
    } else {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      currentUser = data.user;
    }
    document.body.classList.add("logged-in");
    $("accountBtn").textContent = "My account";
    showView(pendingCardId ? "trade" : "home");
  } catch (e) {
    msg("authMessage", e.message, true);
  }
}
async function logout() {
  await db.auth.signOut();
  currentUser = null;
  document.body.classList.remove("logged-in");
  $("accountBtn").textContent = "Log in";
  showView("home");
}
function bind() {
  document.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-remove-image]");
    if (remove) {
      selectedImages.splice(Number(remove.dataset.removeImage), 1);
      renderImagePreviews();
      return;
    }
    const sel = e.target.closest("[data-select-card]");
    if (sel) {
      pendingCardId = sel.dataset.selectCard;
      if (!currentUser) showView("auth");
      else {
        $("tradeBrand").value = pendingCardId;
        showView("trade");
      }
      return;
    }
    const nav = e.target.closest("[data-view]");
    if (nav) {
      e.preventDefault();
      const v = nav.dataset.view;
      if (v === "trade" && !currentUser) {
     showView("auth");
        return;
      }
      showView(v);
      return;
    }
    const ord = e.target.closest("[data-order-id]");
    if (ord) {
      showOrderDetail(ord.dataset.orderId);
      return;
    }
    if (e.target.id === "closeOrderDetail") {
      $("orderDetail").hidden = true;
      return;
    }
    const filter = e.target.closest("[data-order-filter]");
    if (filter) {
      activeOrderFilter = filter.dataset.orderFilter;
      document
        .querySelectorAll("[data-order-filter]")
        .forEach((b) => b.classList.toggle("active", b === filter));
      loadOrders();
      return;
    }
    if (e.target.closest("#switchAuth")) {
      authMode = authMode === "login" ? "signup" : "login";
      $("authTitle").textContent =
        authMode === "login" ? "Welcome back" : "Create your account";
      $("authName").parentElement.hidden = authMode === "login";
      $("authName").required = authMode === "signup";
      $("authSubmit").textContent =
        authMode === "login" ? "Log in" : "Create account";
      $("authSwitchText").innerHTML =
        authMode === "login"
          ? 'New here? <button class="inline-link" id="switchAuth" type="button">Create an account</button>'
          : 'Already registered? <button class="inline-link" id="switchAuth" type="button">Log in</button>';
    }
  });
  $("accountBtn").onclick = () => showView(currentUser ? "user" : "auth");
  $("tradeNavBtn").onclick = () => showView(currentUser ? "trade" : "auth");
  $("authForm").onsubmit = authSubmit;
  $("tradeForm").onsubmit = submitTrade;
  $("profileForm")?.addEventListener("submit", saveProfile);
  $("bankForm").onsubmit = saveBank;
  $("messageForm").onsubmit = sendMessage;
  $("logoutBtn").onclick = logout;
  $("cardSearch").oninput = renderCards;
  $("tradeImages").onchange = previewFiles;
  [
    "tradeBrand",
    "tradeCurrency",
    "tradeAmount",
    "rateBrand",
    "rateCurrency",
    "rateAmount",
  ].forEach((id) => $(id)?.addEventListener("input", updateEstimate));
  document.querySelectorAll(".chip").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll(".chip")
          .forEach((x) => x.classList.toggle("active", x === b));
        renderCards();
      })
  );
}
async function init() {
  bind();
  $("year").textContent = new Date().getFullYear();
  if (!db) {
    msg(
      "authMessage",
      "Supabase configuration did not load. Check config.js.",
      true
    );
    return;
  }
  try {
    const {
      data: { session },
      error,
    } = await db.auth.getSession();
    if (error) throw error;
    currentUser = session?.user || null;
    if (currentUser) {
      document.body.classList.add("logged-in");
      $("accountBtn").textContent = "My account";
      await loadProfile();
    }
    const [c, r] = await Promise.all([
      db
        .from("gift_cards")
        .select("id,brand,category,region,rate_ngn_per_usd,is_active")
        .eq("is_active", true)
        .order("brand"),
      db
        .from("gift_card_rates")
        .select(
          "id,gift_card_id,currency,rate_ngn_per_unit,min_card_value,max_card_value,is_active"
        )
        .eq("is_active", true),
    ]);
    if (c.error) throw c.error;
    if (r.error) throw r.error;
    cards = c.data || [];
    rates = r.data || [];
    renderCards();
    fillCards();
    if (location.hash === "#trade" && !currentUser) showView("auth");
  } catch (e) {
    console.error(e);
    $("cardGrid").textContent =
      "Could not load gift cards or rates: " + e.message;
  }
}
init();
