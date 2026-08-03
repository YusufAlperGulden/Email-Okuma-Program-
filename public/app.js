(() => {
  "use strict";



  const state = {
    emails: [], stats: {}, connection: {}, activeFilter: "all", query: "", isDemo: false,
    currentSnoozeId: null, authChecked: false, loginRequired: false, user: null,
    authMode: "login", dashboardRefreshTimer: null, desktopOAuthTimer: null,
    desktopOAuthPending: false, desktopSettings: null, desktopSettingsRequired: false, localMode: false
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const desktopBridge = window.odakDesktop || null;
  const elements = {
    connection: $("#baglantiDurumu"), setup: $("#kurulumPaneli"), setupLink: $("#kurulumaGit"), gmailAddress: $("#gmailAdresGirdisi"), gmailConsent: $("#gmailVeriOnayi"), connectedGmail: $("#bagliGmailPaneli"), connectedGmailDescription: $("#bagliGmailAciklamasi"), disconnectGmail: $("#gmailBaglantisiniKes"),
    welcome: $("#karsilamaMetni"), updated: $("#sonGuncelleme"), sync: $("#esitleDugmesi"), search: $("#aramaGirdisi"),
    list: $("#postaListesi"), listStatus: $("#listeDurumu"), template: $("#postaKartiSablonu"), focusTitle: $("#odakOzetiBaslik"),
    focusText: $("#odakOzetiMetni"), login: $("#girisPenceresi"), loginForm: $("#girisFormu"), loginError: $("#girisHatasi"), loginTitle: $("#girisBasligi"), loginDescription: $("#girisAciklamasi"),
    accountUsername: $("#kullaniciAdiGirdisi"), password: $("#parolaGirdisi"), passwordConfirmation: $("#parolaTekrarGirdisi"), passwordConfirmationField: $("#parolaTekrarAlani"), loginButton: $("#girisGonder"), authToggle: $("#kimlikModuDegistir"), snooze: $("#ertelePenceresi"), snoozeForm: $("#erteleFormu"),
    snoozeInput: $("#erteleTarihi"), snoozeError: $("#erteleHatasi"), notifications: $("#bildirimler"), theme: $("#temaDugmesi"), account: $("#oturumDugmesi"), settingsButton: $("#hesapAyarlariDugmesi"), settingsDialog: $("#hesapAyarlariPenceresi"), settingsForm: $("#hesapAyarlariFormu"), settingsError: $("#hesapAyarlariHatasi"), settingsConfirm: $("#hesapAyarlariOnay"), settingsUsername: $("#ayarKullaniciAdiGirdisi"), settingsNewPassword: $("#ayarYeniParolaGirdisi"), settingsCurrentPassword: $("#ayarMevcutParolaGirdisi"), deleteAccountButton: $("#hesapSilDugmesi"), deleteAccountDialog: $("#hesapSilPenceresi"), deleteAccountForm: $("#hesapSilFormu"), deleteAccountPassword: $("#hesapSilParolaGirdisi"), deleteAccountError: $("#hesapSilHatasi"), deleteAccountConfirm: $("#hesapSilOnay"),
    desktopSettingsButton: $("#masaustuAyarDugmesi"), desktopSettingsDialog: $("#masaustuAyarPenceresi"), desktopSettingsForm: $("#masaustuAyarFormu"), desktopSettingsClose: $("#masaustuAyarKapat"), desktopGoogleClientId: $("#masaustuGoogleIstemciGirdisi"), desktopGeminiKey: $("#masaustuGeminiAnahtarGirdisi"), desktopGeminiStatus: $("#masaustuGeminiDurumu"), desktopClearGeminiKey: $("#masaustuGeminiSil"), desktopGeminiModel: $("#masaustuGeminiModelGirdisi"), desktopAutoSync: $("#masaustuEsitlemeGirdisi"), desktopSettingsError: $("#masaustuAyarHatasi"), desktopSettingsSave: $("#masaustuAyarKaydet")
  };

  function isDesktop() { return Boolean(desktopBridge && state.localMode); }

  function normaliseEmail(email, index) {
    const labels = { urgent: "action", action_required: "action", important: "action", reminder: "followup", forgotten: "followup", information: "info", low: "info" };
    const rawCategory = String(email.category || email.type || "").toLowerCase();
    const firstAction = Array.isArray(email.actionItems) ? email.actionItems[0] : null;
    const category = labels[rawCategory]
      || (email.followUpState === "overdue" ? "followup" : "")
      || (email.needsReply || ["urgent", "action_required", "important"].includes(String(email.priority || "").toLowerCase()) ? "action" : "")
      || rawCategory;
    return {
      id: String(email.id ?? `mail-${index}`),
      sender: email.sender || email.from || "Bilinmeyen gönderen", subject: email.subject || email.title || "Konu yok",
      receivedAt: email.receivedAt || email.date || email.createdAt || new Date().toISOString(),
      summary: email.summary || email.aiSummary || email.excerpt || "Bu e-posta için henüz özet yok.",
      importanceReason: email.importanceReason || email.reason || email.aiReason || "Öncelik değerlendirmesi yapıldı.",
      action: email.action || email.suggestedAction || email.nextAction || firstAction?.task || "E-postayı incele.",
      category: ["action", "followup", "info", "today"].includes(category) ? category : "info",
      priority: email.priority || (category === "action" ? "Yüksek" : category === "followup" ? "Takip" : "Bilgi"),
      status: String(email.status || "open").toLowerCase(),
      originalUrl: email.originalUrl || email.url || null,
      snoozedUntil: email.snoozedUntil || email.snoozeUntil || null
    };
  }



  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json().catch(() => null) : null;
    if (!response.ok) {
      const error = new Error(payload?.error || `İstek başarısız (${response.status})`);
      error.code = payload?.code || response.status;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function checkAuth() {
    try {
      const auth = await request("/api/auth/status");
      state.authChecked = true;
      state.user = auth?.user || null;
      state.localMode = Boolean(auth?.localMode);
      if (isDesktop()) {
        state.desktopSettings = await desktopBridge.getSettings();
      }
      elements.desktopSettingsButton.hidden = !isDesktop();
      if (!auth?.databaseConfigured) {
        state.loginRequired = true;
        if (state.localMode) {
          showLocalStartupError();
          return false;
        }
        showLogin("login", "Sunucu henüz kullanıcı veritabanına bağlanmadı. Yönetici DATABASE_URL ayarını tamamlamalı.");
        return false;
      }
      state.loginRequired = !auth?.authenticated;
      updateAccountButton();
      if (state.loginRequired) showLogin();
      return !state.loginRequired;
    } catch (error) {
      state.authChecked = true;
      state.loginRequired = true;
      if (desktopBridge) {
        state.localMode = true;
        elements.desktopSettingsButton.hidden = false;
        showLocalStartupError();
        return false;
      }
      showLogin("login", "Giriş durumu alınamadı. Lütfen bağlantını tekrar kontrol et.");
      return false;
    }
  }

  async function loadDashboard() {
    elements.listStatus.innerHTML = '<div class="yukleniyor">Gelen kutun analiz ediliyor…</div>';
    try {
      const data = await request("/api/dashboard");
      const rawEmails = Array.isArray(data?.emails) ? data.emails : [];
      state.emails = rawEmails.map(normaliseEmail);
      state.stats = data?.stats || {};
      state.connection = data?.connection || {};
      state.isDemo = false;
      render();
      scheduleDashboardRefresh();
    } catch (error) {
      if (error.code === 401) {
        state.loginRequired = true;
        showLogin();
        elements.listStatus.innerHTML = "";
        return;
      }
      elements.listStatus.innerHTML = `<div class="bos-durum"><strong>Panel şu anda yüklenemedi.</strong><span>${error.message || "Lütfen daha sonra tekrar deneyin."}</span></div>`;
    }
  }

  function scheduleDashboardRefresh() {
    if (state.dashboardRefreshTimer) window.clearTimeout(state.dashboardRefreshTimer);
    state.dashboardRefreshTimer = null;
    // The OAuth callback starts the first background summary job. Refresh the
    // visible dashboard until it completes so the user never needs to click
    // the manual button merely to see the first summaries.
    if (!state.isDemo && state.connection?.syncInProgress) {
      state.dashboardRefreshTimer = window.setTimeout(() => { void loadDashboard(); }, 3000);
    }
  }

  function isToday(value) {
    const date = new Date(value);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }

  function counts() {
    const all = state.emails;
    const active = all.filter(email => email.status !== "done" && !isSnoozedForLater(email));
    return {
      today: all.filter(email => isToday(email.receivedAt)).length,
      action: active.filter(email => email.category === "action").length,
      followup: active.filter(email => email.category === "followup" || Boolean(email.snoozedUntil)).length,
      info: active.filter(email => email.category === "info").length,
      all: all.length,
      done: all.filter(email => email.status === "done").length
    };
  }

  function isSnoozedForLater(email) {
    return email.status === "snoozed" && email.snoozedUntil && new Date(email.snoozedUntil).valueOf() > Date.now();
  }

  function statValue(key, fallback) {
    const candidates = { today: ["today", "todayCount", "newToday"], action: ["action", "actionRequired", "actionRequiredCount", "important"], followup: ["followup", "forgotten", "followUpCount"], info: ["info", "information"] }[key] || [];
    for (const name of candidates) if (Number.isFinite(Number(state.stats?.[name]))) return Number(state.stats[name]);
    return fallback;
  }

  function relativeTime(value) {
    const date = new Date(value); const seconds = Math.round((date - new Date()) / 1000); const rtf = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });
    const spans = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.34524, "week"], [12, "month"], [Number.POSITIVE_INFINITY, "year"]];
    let duration = seconds;
    for (const [amount, unit] of spans) { if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit); duration /= amount; }
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(date);
  }

  function firstLetters(name) {
    return name.replace(/·.*$/, "").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
  }

  function categoryLabel(category) {
    return ({ action: "Aksiyon gerekli", followup: "Takip", info: "Bilgi", today: "Bugün" })[category] || "Bilgi";
  }

  function filteredEmails() {
    let emails = [...state.emails];
    if (state.activeFilter === "today") emails = emails.filter(email => isToday(email.receivedAt) && !isSnoozedForLater(email));
    else if (state.activeFilter === "done") emails = emails.filter(email => email.status === "done");
    else if (state.activeFilter !== "all") emails = emails.filter(email => email.category === state.activeFilter && email.status !== "done" && !isSnoozedForLater(email));
    else emails = emails.filter(email => email.status !== "done" && !isSnoozedForLater(email));
    const query = state.query.trim().toLocaleLowerCase("tr-TR");
    if (query) emails = emails.filter(email => [email.sender, email.subject, email.summary, email.importanceReason, email.action].join(" ").toLocaleLowerCase("tr-TR").includes(query));
    const order = { action: 0, followup: 1, info: 2 };
    return emails.sort((a, b) => (order[a.category] ?? 3) - (order[b.category] ?? 3) || new Date(b.receivedAt) - new Date(a.receivedAt));
  }

  function renderStats() {
    const c = counts();
    const values = { today: statValue("today", c.today), action: statValue("action", c.action), followup: statValue("followup", c.followup), info: statValue("info", c.info) };
    $("#bugunSayisi").textContent = values.today; $("#aksiyonSayisi").textContent = values.action; $("#takipSayisi").textContent = values.followup; $("#bilgiSayisi").textContent = values.info;
    $("#bugunAlt").textContent = values.today === 1 ? "yeni e-posta" : "yeni e-posta";
    $("#aksiyonAlt").textContent = values.action ? "yanıt bekliyor" : "bekleyen yok";
    $("#takipAlt").textContent = values.followup ? "hatırlatılacak" : "takip temiz";
    $("#bilgiAlt").textContent = values.info ? "okunabilir" : "bilgi postası yok";
    $("#tumSayisi").textContent = c.all; $("#filtreAksiyonSayisi").textContent = c.action; $("#filtreTakipSayisi").textContent = c.followup;
  }

  function renderFocus() {
    const c = counts();
    if (!state.emails.length) {
      elements.focusTitle.textContent = "Gelen kutun şu an sakin.";
      elements.focusText.textContent = "Yeni e-posta geldiğinde önceliğini ve önerilen aksiyonunu burada göreceksin.";
      return;
    }
    if (c.action) {
      elements.focusTitle.textContent = `${c.action} e-posta bugün senden aksiyon bekliyor.`;
      elements.focusText.textContent = c.followup ? `${c.followup} konu için de takip zamanı gelmiş. Önce son tarihi olanları ele al.` : "En yüksek öncelikli postalara kısa bir yanıt vererek güne önden başla.";
    } else if (c.followup) {
      elements.focusTitle.textContent = "Bugün için acil aksiyon görünmüyor.";
      elements.focusText.textContent = `${c.followup} takip konusunu gözden geçirmen yeterli; kalan postalar bilgilendirme niteliğinde.`;
    } else {
      elements.focusTitle.textContent = "Gelen kutun kontrol altında.";
      elements.focusText.textContent = "Şu an acil yanıt ya da gecikmiş takip gerektiren bir e-posta yok.";
    }
  }

  function renderConnection() {
    const configuredConnection = state.connection?.gmailConnected ?? state.connection?.connected;
    const connected = Boolean(configuredConnection) && !state.isDemo;
    const desktop = isDesktop();
    const needsGoogleSettings = state.connection?.gmailConfigured === false;
    elements.connection.classList.toggle("hata", !connected);
    $("span", elements.connection).textContent = connected ? "Gmail bağlı" : "Gmail bekliyor";
    const noConnection = !connected;
    elements.setup.hidden = !noConnection;
    elements.connectedGmail.hidden = !connected;
    elements.setupLink.disabled = needsGoogleSettings && !desktop;
    elements.setupLink.textContent = state.desktopOAuthPending
      ? "Bağlantıyı iptal et"
      : needsGoogleSettings
        ? (desktop ? "Google ayarını aç" : "Google ayarı gerekli")
        : "Gmail’i bağla";
    const owner = state.connection?.gmailAddress || state.connection?.email || state.connection?.account;
    if (connected) {
      elements.connectedGmailDescription.textContent = owner
        ? `${owner} hesabının e-postaları yalnızca bu OdakPosta hesabında özetlenir.`
        : "Bu hesabın e-postaları yalnızca kendi panelinde özetlenir.";
    }
    elements.welcome.textContent = !connected
      ? (state.localMode
        ? "Yerel OdakPosta hazır. Kendi Gmail hesabını bağlayarak özetlerini bu bilgisayarda tut."
        : `${state.user?.username || "Hesabın"} hazır. Kendi Gmail hesabını bağlayarak kişisel özetlerini gör.`)
      : owner ? `${owner} için öncelikler yapay zekâ ile sıralandı.` : "Gelen kutundaki önemli konular yapay zekâ ile sıralandı.";
    const warning = state.connection?.lastAnalysisWarning;
    elements.updated.title = warning || "";
    elements.updated.textContent = state.isDemo
      ? "Örnek veriler"
      : state.connection?.syncInProgress
        ? "E-postalar yapay zekâ ile özetleniyor…"
        : warning
          ? "Bazı özetler yeniden denenecek"
          : state.connection?.lastSyncAt
            ? `Son eşitleme ${relativeTime(state.connection.lastSyncAt)}`
            : "Henüz eşitlenmedi";
  }

  function renderList() {
    const emails = filteredEmails();
    elements.list.replaceChildren(); elements.listStatus.innerHTML = "";
    if (!emails.length) {
      const heading = state.query ? "Aramana uygun e-posta yok." : state.activeFilter === "done" ? "Henüz tamamlanan e-posta yok." : "Bu bölümde e-posta yok.";
      elements.listStatus.innerHTML = `<div class="bos-durum"><strong>${heading}</strong><span>Filtreyi değiştirebilir veya daha sonra tekrar kontrol edebilirsin.</span></div>`;
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const email of emails) {
      const card = elements.template.content.firstElementChild.cloneNode(true);
      card.dataset.id = email.id; card.dataset.kategori = email.category; card.dataset.durum = email.status;
      $(".avatar", card).textContent = firstLetters(email.sender); $(".gonderen", card).textContent = email.sender; $(".zaman", card).textContent = relativeTime(email.receivedAt);
      $(".oncelik-etiketi", card).textContent = email.priority || categoryLabel(email.category); $(".durum-etiketi", card).textContent = email.status === "done" ? "Tamamlandı" : categoryLabel(email.category);
      $(".konu", card).textContent = email.subject; $(".ozet", card).textContent = email.summary; $(".neden", card).textContent = email.importanceReason; $(".aksiyon-metni", card).textContent = email.action;
      const complete = $(".tamamla-dugmesi", card); const snooze = $(".ertele-dugmesi", card);
      if (email.status === "done") { complete.hidden = true; snooze.hidden = true; $(".incele-dugmesi", card).textContent = "E-postayı aç ↗"; }
      fragment.append(card);
    }
    elements.list.append(fragment);
  }

  function renderFilters() { $$(".filtre").forEach(button => button.classList.toggle("etkin", button.dataset.filtre === state.activeFilter)); }
  function render() { renderStats(); renderFocus(); renderConnection(); renderFilters(); renderList(); }

  async function changeStatus(id, status) {
    const email = state.emails.find(item => item.id === id); if (!email) return;
    const before = email.status; email.status = status; render();
    if (state.isDemo) { notify(status === "done" ? "E-posta tamamlandı olarak işaretlendi." : "E-posta güncellendi.", "basari"); return; }
    try { await request(`/api/emails/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status }) }); notify("E-posta güncellendi.", "basari"); }
    catch (error) { email.status = before; render(); notify("Güncelleme kaydedilemedi. Tekrar deneyin.", "uyari"); }
  }

  async function openOriginal(id) {
    const email = state.emails.find(item => item.id === id); if (!email) return;
    if (state.isDemo) { notify("Demo modunda özgün e-posta açılmaz.", "uyari"); return; }
    if (email.originalUrl) { window.open(email.originalUrl, "_blank", "noopener,noreferrer"); return; }
    try { const data = await request(`/api/emails/${encodeURIComponent(id)}/original`); if (!data?.url) throw new Error("Adres bulunamadı"); window.open(data.url, "_blank", "noopener,noreferrer"); }
    catch (_) { notify("Özgün e-posta şu anda açılamıyor.", "uyari"); }
  }

  function defaultSnoozeValue() { const date = new Date(Date.now() + 24 * 60 * 60 * 1000); date.setMinutes(0, 0, 0); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function showSnooze(id) { state.currentSnoozeId = id; elements.snoozeError.textContent = ""; elements.snoozeInput.min = new Date().toISOString().slice(0, 16); elements.snoozeInput.value = defaultSnoozeValue(); elements.snooze.showModal(); }
  async function saveSnooze() {
    const id = state.currentSnoozeId; const value = elements.snoozeInput.value; if (!id || !value) return;
    const email = state.emails.find(item => item.id === id); if (!email) return;
    const old = { snoozedUntil: email.snoozedUntil, status: email.status };
    email.snoozedUntil = new Date(value).toISOString(); email.status = "snoozed"; render(); elements.snooze.close();
    if (state.isDemo) { notify("Hatırlatıcı oluşturuldu.", "basari"); return; }
    try { await request(`/api/emails/${encodeURIComponent(id)}/snooze`, { method: "POST", body: JSON.stringify({ until: email.snoozedUntil }) }); notify("Hatırlatıcı oluşturuldu.", "basari"); }
    catch (_) { email.snoozedUntil = old.snoozedUntil; email.status = old.status; render(); notify("Hatırlatıcı kaydedilemedi.", "uyari"); }
  }

  async function sync() {
    if (!state.connection?.gmailConnected) { notify("Önce kendi Gmail hesabını bağlamalısın.", "uyari"); return; }
    elements.sync.disabled = true; elements.sync.innerHTML = '<span aria-hidden="true">↻</span> Yenileniyor…';
    try { await request("/api/sync", { method: "POST", body: "{}" }); await loadDashboard(); notify("Gelen kutusu yenilendi.", "basari"); }
    catch (error) { notify(error.status === 401 ? "Yenilemek için giriş yapmalısın." : error.message || "E-postalar yenilenemedi.", "uyari"); if (error.status === 401) showLogin(); }
    finally { elements.sync.disabled = false; elements.sync.innerHTML = '<span aria-hidden="true">↻</span> Postaları yenile'; }
  }

  function notify(message, type = "") { const note = document.createElement("div"); note.className = `bildirim ${type}`; note.textContent = message; elements.notifications.append(note); window.setTimeout(() => note.remove(), 4200); }
  function showLogin(mode = state.authMode, message = "") {
    if (state.localMode) {
      notify(message || "Masaüstü sürümünde ayrı bir uygulama hesabıyla giriş yapılmaz.", "uyari");
      return;
    }
    state.authMode = mode;
    const registering = mode === "register";
    elements.loginTitle.textContent = registering ? "OdakPosta hesabı oluştur" : "OdakPosta'ya giriş yap";
    elements.loginDescription.textContent = registering ? "Hesabın için e-posta adresini ve güçlü bir parola seç. Gmail hesabını sonraki adımda bağlayacaksın." : "Kendi e-posta adresin ve parolanla giriş yap.";
    elements.loginButton.textContent = registering ? "Hesap oluştur" : "Giriş yap";
    elements.authToggle.textContent = registering ? "Zaten hesabın var mı? Giriş yap" : "Hesabın yok mu? Hesap oluştur";
    elements.passwordConfirmationField.hidden = !registering;
    elements.passwordConfirmation.required = registering;
    elements.password.autocomplete = registering ? "new-password" : "current-password";
    elements.loginError.textContent = message;
    if (!elements.login.open) elements.login.showModal();
    window.setTimeout(() => elements.accountUsername.focus(), 30);
  }

  function showLocalStartupError() {
    elements.connection.classList.add("hata");
    $("span", elements.connection).textContent = "Yerel veritabanı hatası";
    elements.setup.hidden = true;
    elements.connectedGmail.hidden = true;
    elements.sync.disabled = true;
    elements.account.hidden = true;
    elements.deleteAccountButton.hidden = true;
    elements.welcome.textContent = "Yerel veriler başlatılamadığı için OdakPosta şu anda kullanılamıyor.";
    elements.list.replaceChildren();
    elements.listStatus.innerHTML = "<div class=\"bos-durum\"><strong>Yerel veritabanı başlatılamadı.</strong><span>Masaüstü uygulamasını yeniden başlatın. Sorun sürerse ayarlarınızı gözden geçirin.</span></div>";
  }

  async function submitAuth() {
    const username = elements.accountUsername.value.trim(); const password = elements.password.value; const passwordConfirmation = elements.passwordConfirmation.value;
    if (!username || !password || (state.authMode === "register" && !passwordConfirmation)) return;
    elements.loginButton.disabled = true; elements.loginError.textContent = "";
    try {
      const registering = state.authMode === "register";
      const result = await request(registering ? "/api/auth/register" : "/api/auth/login", { method: "POST", body: JSON.stringify({ username, password, passwordConfirmation }) });
      state.user = result?.user || { username };
      elements.password.value = ""; elements.passwordConfirmation.value = ""; elements.login.close(); state.loginRequired = false; updateAccountButton(); await loadDashboard(); notify(registering ? "Hesabın oluşturuldu. Şimdi Gmail hesabını bağlayabilirsin." : "Giriş başarılı.", "basari");
    }
    catch (error) { elements.loginError.textContent = error.message || "Giriş yapılamadı. Bağlantını kontrol et."; }
    finally { elements.loginButton.disabled = false; }
  }

  async function logout() {
    try { await request("/api/logout", { method: "POST", body: "{}" }); state.user = null; state.connection = {}; state.emails = []; updateAccountButton(); showLogin("login"); }
    catch (_) { notify("Oturum kapatılamadı.", "uyari"); }
  }

  function showDeleteAccount() {
    if (!state.user) return;
    elements.deleteAccountPassword.value = "";
    elements.deleteAccountError.textContent = "";
    if (!elements.deleteAccountDialog.open) elements.deleteAccountDialog.showModal();
    window.setTimeout(() => elements.deleteAccountPassword.focus(), 30);
  }

  async function deleteAccount() {
    const password = elements.deleteAccountPassword.value;
    if (!password) return;
    elements.deleteAccountConfirm.disabled = true;
    elements.deleteAccountError.textContent = "";
    try {
      await request("/api/account", { method: "DELETE", body: JSON.stringify({ password }) });
      elements.deleteAccountDialog.close();
      state.user = null; state.connection = {}; state.emails = []; state.stats = {}; state.loginRequired = true;
      updateAccountButton(); render(); showLogin("register", "Hesabın ve bağlı Gmail verilerin silindi.");
    } catch (error) {
      elements.deleteAccountError.textContent = error.message || "Hesap silinemedi.";
    } finally {
      elements.deleteAccountConfirm.disabled = false;
    }
  }

  function updateAccountButton() {
    const username = state.user?.username || "";
    const initials = username ? username.substring(0, 2).toUpperCase() : "OP";
    elements.account.textContent = initials || "OP";
    elements.account.title = username ? `${username} — hesap seçenekleri` : "Giriş yap";
    elements.account.hidden = state.localMode;
    elements.deleteAccountButton.hidden = !username || state.localMode;
    if (elements.settingsButton) elements.settingsButton.hidden = !username || state.localMode;
  }

  function showAccountSettings() {
    if (!state.user) return;
    elements.settingsUsername.value = state.user.username || "";
    elements.settingsNewPassword.value = "";
    elements.settingsCurrentPassword.value = "";
    elements.settingsError.textContent = "";
    if (!elements.settingsDialog.open) elements.settingsDialog.showModal();
    window.setTimeout(() => elements.settingsUsername.focus(), 30);
  }

  async function saveAccountSettings() {
    const newUsername = elements.settingsUsername.value.trim();
    const newPassword = elements.settingsNewPassword.value;
    const currentPassword = elements.settingsCurrentPassword.value;

    if (!currentPassword) return;

    elements.settingsConfirm.disabled = true;
    elements.settingsError.textContent = "";

    try {
      const result = await request("/api/auth/update", {
        method: "POST",
        body: JSON.stringify({ newUsername, newPassword, currentPassword })
      });
      if (result && result.username) {
        state.user.username = result.username;
        updateAccountButton();
      }
      elements.settingsDialog.close();
      notify("Hesap bilgilerin başarıyla güncellendi.", "basari");
    } catch (error) {
      elements.settingsError.textContent = error.message || "Hesap bilgileri güncellenemedi.";
    } finally {
      elements.settingsConfirm.disabled = false;
    }
  }

  async function showDesktopSettings(required = false) {
    if (!isDesktop()) return;
    try {
      state.desktopSettingsRequired = Boolean(required);
      state.desktopSettings = await desktopBridge.getSettings();
      const settings = state.desktopSettings;
      elements.desktopGoogleClientId.value = settings.googleClientId || "";
      elements.desktopGeminiKey.value = "";
      elements.desktopClearGeminiKey.checked = false;
      elements.desktopGeminiModel.value = settings.geminiModel || "gemini-2.5-flash-lite";
      elements.desktopAutoSync.value = String(settings.autoSyncMinutes ?? 15);
      elements.desktopGeminiStatus.textContent = settings.geminiConfigured
        ? "Bir Gemini anahtarı güvenli yerel depoda kayıtlı. Değiştirmek için yeni anahtarı yaz veya kaldırma kutusunu işaretle."
        : "Gemini anahtarı isteğe bağlıdır; boş bırakılırsa yerel önceliklendirme kullanılır.";
      elements.desktopSettingsError.textContent = required && !settings.googleConfigured
        ? "Gmail bağlamak için önce Google Desktop OAuth istemci kimliğini kaydedin."
        : "";
      if (!elements.desktopSettingsDialog.open) elements.desktopSettingsDialog.showModal();
      window.setTimeout(() => elements.desktopGoogleClientId.focus(), 30);
    } catch (error) {
      notify(error.message || "Masaüstü ayarları açılamadı.", "uyari");
    }
  }

  async function saveDesktopSettings() {
    if (!isDesktop()) return;
    if (state.desktopSettingsRequired && !elements.desktopGoogleClientId.value.trim()) {
      elements.desktopSettingsError.textContent = "Gmail bağlamak için Google Desktop OAuth istemci kimliği gerekli.";
      elements.desktopGoogleClientId.focus();
      return;
    }
    elements.desktopSettingsSave.disabled = true;
    elements.desktopSettingsError.textContent = "";
    try {
      state.desktopSettings = await desktopBridge.saveSettings({
        googleClientId: elements.desktopGoogleClientId.value,
        geminiApiKey: elements.desktopGeminiKey.value,
        clearGeminiKey: elements.desktopClearGeminiKey.checked,
        geminiModel: elements.desktopGeminiModel.value,
        autoSyncMinutes: elements.desktopAutoSync.value
      });
      elements.desktopSettingsDialog.close();
      notify("Ayarlar güvenli yerel depoya kaydedildi. Uygulama yeniden başlatılıyor…", "basari");
      await desktopBridge.restart();
    } catch (error) {
      elements.desktopSettingsError.textContent = error.message || "Ayarlar kaydedilemedi.";
      elements.desktopSettingsSave.disabled = false;
    }
  }

  function stopDesktopOAuthPolling() {
    if (state.desktopOAuthTimer) window.clearTimeout(state.desktopOAuthTimer);
    state.desktopOAuthTimer = null;
    state.desktopOAuthPending = false;
  }

  function startDesktopOAuthPolling() {
    stopDesktopOAuthPolling();
    state.desktopOAuthPending = true;
    const deadline = Date.now() + 10 * 60 * 1000;
    const poll = async () => {
      await loadDashboard();
      if (state.connection?.gmailConnected) {
        stopDesktopOAuthPolling();
        render();
        notify("Gmail hesabı bağlandı; ilk özetler hazırlanıyor.", "basari");
        return;
      }
      if (Date.now() >= deadline) {
        stopDesktopOAuthPolling();
        render();
        notify("Google yetkilendirmesi tamamlanmadı. İstersen tekrar deneyebilirsin.", "uyari");
        return;
      }
      state.desktopOAuthTimer = window.setTimeout(() => { void poll(); }, 2500);
    };
    state.desktopOAuthTimer = window.setTimeout(() => { void poll(); }, 2500);
  }

  async function connectGmail() {
    if (state.desktopOAuthPending) {
      stopDesktopOAuthPolling();
      render();
      notify("Google yetkilendirmesi için bekleme iptal edildi. İstersen tekrar deneyebilirsin.", "uyari");
      return;
    }
    if (isDesktop() && !state.desktopSettings?.googleConfigured) {
      await showDesktopSettings(true);
      return;
    }
    if (elements.setupLink.disabled) { notify("Gmail bağlantısı için sunucuda Google OAuth bilgileri yapılandırılmalı.", "uyari"); return; }
    const hint = elements.gmailAddress.value.trim();
    if (hint && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint)) { notify("Geçerli bir Gmail adresi yaz veya alanı boş bırak.", "uyari"); return; }
    if (!elements.gmailConsent.checked) { notify("Devam etmek için Gmail verisi işleme onayını vermelisin.", "uyari"); return; }
    elements.setupLink.disabled = true;
    try {
      await request("/api/gmail/consent", { method: "POST", body: JSON.stringify({ accepted: true }) });
      if (isDesktop()) {
        await desktopBridge.beginGoogleOAuth(hint);
        startDesktopOAuthPolling();
        render();
        notify("Google yetkilendirmesi sistem tarayıcısında açıldı. Onayı tamamladıktan sonra buraya dön.", "basari");
        return;
      }
      window.location.assign(`/auth/google${hint ? `?email=${encodeURIComponent(hint)}` : ""}`);
    } catch (error) {
      notify(error.message || "Gmail bağlantısı başlatılamadı.", "uyari");
      elements.setupLink.disabled = false;
    }
  }

  async function disconnectGmail() {
    if (!confirm("Gmail bağlantısı kaldırılacak ve bu Gmail hesabına ait kaydedilmiş özetler silinecek. Devam etmek istiyor musun?")) return;
    elements.disconnectGmail.disabled = true;
    try {
      await request("/api/disconnect", { method: "POST", body: "{}" });
      stopDesktopOAuthPolling();
      state.emails = []; state.stats = {}; state.connection = { gmailConnected: false, gmailConfigured: state.connection?.gmailConfigured };
      elements.gmailConsent.checked = false;
      render();
      elements.gmailAddress.focus();
      notify("Gmail bağlantısı kaldırıldı. Başka bir hesabı bağlayabilirsin.", "basari");
    } catch (error) {
      notify(error.message || "Gmail bağlantısı kaldırılamadı.", "uyari");
    } finally {
      elements.disconnectGmail.disabled = false;
    }
  }

  function initialiseTheme() {
    const saved = localStorage.getItem("odak-posta-tema"); const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.classList.toggle("koyu", dark); elements.theme.setAttribute("aria-label", dark ? "Açık temayı aç" : "Koyu temayı aç");
  }

  function bindEvents() {
    $$(".filtre").forEach(button => button.addEventListener("click", () => { state.activeFilter = button.dataset.filtre; render(); }));
    $$(".istatistik-karti").forEach(card => { const change = () => { state.activeFilter = card.dataset.filtre; render(); document.querySelector(".posta-alani").scrollIntoView({ behavior: "smooth", block: "start" }); }; card.addEventListener("click", change); card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); change(); } }); });
    elements.search.addEventListener("input", event => { state.query = event.target.value; renderList(); }); elements.sync.addEventListener("click", sync);
    elements.list.addEventListener("click", event => { const card = event.target.closest(".posta-karti"); if (!card) return; if (event.target.closest(".incele-dugmesi")) openOriginal(card.dataset.id); if (event.target.closest(".tamamla-dugmesi")) changeStatus(card.dataset.id, "done"); if (event.target.closest(".ertele-dugmesi")) showSnooze(card.dataset.id); });
    elements.snoozeForm.addEventListener("submit", event => { event.preventDefault(); saveSnooze(); }); $("#erteleKapat").addEventListener("click", () => elements.snooze.close());
    elements.loginForm.addEventListener("submit", event => { event.preventDefault(); submitAuth(); }); elements.authToggle.addEventListener("click", () => showLogin(state.authMode === "login" ? "register" : "login")); $("#girisKapat").addEventListener("click", () => elements.login.close());
    elements.deleteAccountForm.addEventListener("submit", event => { event.preventDefault(); deleteAccount(); }); $("#hesapSilKapat").addEventListener("click", () => elements.deleteAccountDialog.close()); elements.deleteAccountButton.addEventListener("click", showDeleteAccount);
    if (elements.settingsForm) { elements.settingsForm.addEventListener("submit", event => { event.preventDefault(); void saveAccountSettings(); }); }
    if (elements.settingsButton) { elements.settingsButton.addEventListener("click", showAccountSettings); }
    if ($("#hesapAyarlariKapat")) { $("#hesapAyarlariKapat").addEventListener("click", () => elements.settingsDialog.close()); }
    elements.desktopSettingsButton.addEventListener("click", () => { void showDesktopSettings(); }); elements.desktopSettingsForm.addEventListener("submit", event => { event.preventDefault(); void saveDesktopSettings(); }); elements.desktopSettingsClose.addEventListener("click", () => elements.desktopSettingsDialog.close());
    elements.theme.addEventListener("click", () => { const dark = !document.body.classList.contains("koyu"); document.body.classList.toggle("koyu", dark); localStorage.setItem("odak-posta-tema", dark ? "dark" : "light"); elements.theme.setAttribute("aria-label", dark ? "Açık temayı aç" : "Koyu temayı aç"); });
    elements.account.addEventListener("click", () => { if (state.loginRequired) showLogin(); else if (state.authChecked && confirm("Oturumu kapatmak istiyor musun?")) logout(); });
    elements.setupLink.addEventListener("click", connectGmail);
    elements.disconnectGmail.addEventListener("click", disconnectGmail);
  }

  async function boot() { initialiseTheme(); bindEvents(); const allowed = await checkAuth(); if (allowed) await loadDashboard(); }
  boot();
})();
