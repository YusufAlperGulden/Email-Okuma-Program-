(() => {
  "use strict";

  const demoEmails = [
    {
      id: "demo-1", sender: "Ayşe Demir · Nova Lojistik", subject: "Teklif onayı için son tarih bugün", receivedAt: "2026-08-03T08:42:00+03:00",
      summary: "Yarın başlayacak taşıma işi için teklif onayının bugün 16.00'ya kadar iletilmesi isteniyor.",
      importanceReason: "Bugün son tarih var ve iş başlangıcını etkiliyor.", action: "16.00'ya kadar onayla veya revize iste.",
      category: "action", priority: "Yüksek", status: "open"
    },
    {
      id: "demo-2", sender: "Murat Kaya · Finans", subject: "Temmuz gider raporu: eksik belge hatırlatması", receivedAt: "2026-08-03T07:55:00+03:00",
      summary: "Gider raporunda iki fiş eksik görünüyor; muhasebe kapanışı için belgelerin paylaşılması gerekiyor.",
      importanceReason: "Kapanış süreci bekliyor; daha önce de hatırlatılmış.", action: "Eksik iki belgeyi gün içinde gönder.",
      category: "followup", priority: "Takip", status: "open"
    },
    {
      id: "demo-3", sender: "Zeynep Arslan · Müşteri Başarı", subject: "Atlas A.Ş. toplantı notları", receivedAt: "2026-08-03T09:14:00+03:00",
      summary: "Müşteri, yeni panel raporunu olumlu değerlendirdi ve cuma gününe kadar kısa bir eğitim planı bekliyor.",
      importanceReason: "Müşteri beklentisi ve net bir sonraki adım içeriyor.", action: "Cuma için eğitim planı taslağını paylaş.",
      category: "action", priority: "Yüksek", status: "open"
    },
    {
      id: "demo-4", sender: "İnsan ve Kültür", subject: "Ağustos eğitim takvimi yayımlandı", receivedAt: "2026-08-03T06:30:00+03:00",
      summary: "Bu ayın zorunlu ve isteğe bağlı kurum içi eğitim tarihleri paylaşıldı.",
      importanceReason: "Bilgilendirme amaçlı; acil yanıt beklenmiyor.", action: "Uygun olduğunda eğitim tarihlerini incele.",
      category: "info", priority: "Bilgi", status: "open"
    },
    {
      id: "demo-5", sender: "Can Akın · Ürün", subject: "Sürüm 2.4 yayın notları", receivedAt: "2026-08-02T16:12:00+03:00",
      summary: "Rapor dışa aktarma ve bildirim tercihleri için iyileştirmeler canlıya alındı.",
      importanceReason: "Bilgilendirme; doğrudan aksiyon gerektirmiyor.", action: "Gerektiğinde yeni özellikleri gözden geçir.",
      category: "info", priority: "Bilgi", status: "open"
    },
    {
      id: "demo-6", sender: "Deniz Aksoy · Satın Alma", subject: "Tedarikçi sözleşmesi onaylandı", receivedAt: "2026-08-02T14:05:00+03:00",
      summary: "Sözleşme hukuk tarafından onaylandı; işlem kaydı tamamlandı.",
      importanceReason: "Bilgi için saklandı; bekleyen aksiyon yok.", action: "Gerekli değil.",
      category: "info", priority: "Tamamlandı", status: "done"
    }
  ];

  const state = {
    emails: [], stats: {}, connection: {}, activeFilter: "all", query: "", isDemo: false,
    currentSnoozeId: null, authChecked: false, loginRequired: false
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const elements = {
    connection: $("#baglantiDurumu"), demoNotice: $("#demoUyarisi"), setup: $("#kurulumPaneli"), setupLink: $("#kurulumaGit"),
    welcome: $("#karsilamaMetni"), updated: $("#sonGuncelleme"), sync: $("#esitleDugmesi"), search: $("#aramaGirdisi"),
    list: $("#postaListesi"), listStatus: $("#listeDurumu"), template: $("#postaKartiSablonu"), focusTitle: $("#odakOzetiBaslik"),
    focusText: $("#odakOzetiMetni"), login: $("#girisPenceresi"), loginForm: $("#girisFormu"), loginError: $("#girisHatasi"),
    password: $("#parolaGirdisi"), loginButton: $("#girisGonder"), snooze: $("#ertelePenceresi"), snoozeForm: $("#erteleFormu"),
    snoozeInput: $("#erteleTarihi"), snoozeError: $("#erteleHatasi"), notifications: $("#bildirimler"), theme: $("#temaDugmesi"), account: $("#oturumDugmesi")
  };

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

  function useDemo(reason = "") {
    state.emails = demoEmails.map(normaliseEmail);
    state.stats = {};
    state.connection = { connected: false, demo: true };
    state.isDemo = true;
    elements.demoNotice.hidden = false;
    if (reason) console.info("Demo modu:", reason);
    render();
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    if (response.status === 401) {
      const error = new Error("Giriş gerekli"); error.code = 401; throw error;
    }
    if (!response.ok) throw new Error(`İstek başarısız (${response.status})`);
    const type = response.headers.get("content-type") || "";
    return type.includes("application/json") ? response.json() : null;
  }

  async function checkAuth() {
    try {
      const auth = await request("/api/auth/status");
      state.authChecked = true;
      state.loginRequired = Boolean((auth?.required || auth?.passwordRequired) && !auth?.authenticated);
      if (state.loginRequired) showLogin();
      return !state.loginRequired;
    } catch (error) {
      // Uygulamanın eski sürümlerinde bu uç nokta olmayabilir; dashboard denemeye devam eder.
      state.authChecked = true;
      return true;
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
      elements.demoNotice.hidden = true;
      // Gmail henüz bağlanmadıysa boş bir ekran yerine ürünün nasıl çalıştığını göster.
      if (state.connection?.gmailConnected === false && rawEmails.length === 0) {
        try {
          const demo = await request("/api/demo");
          state.emails = (demo?.emails || demo || demoEmails).map(normaliseEmail);
          state.stats = demo?.stats || {};
          state.connection = { ...state.connection, demo: true };
          state.isDemo = true;
          elements.demoNotice.hidden = false;
        } catch (_) {
          useDemo("Gmail bağlı değil");
          return;
        }
      }
      render();
    } catch (error) {
      if (error.code === 401) {
        state.loginRequired = true;
        showLogin();
        elements.listStatus.innerHTML = "";
        return;
      }
      // Önce sunucunun isteğe bağlı demo uç noktasını dene, o da yoksa gömülü veri kullan.
      try {
        const data = await request("/api/demo");
        state.emails = (data?.emails || data || demoEmails).map(normaliseEmail);
        state.stats = data?.stats || {};
        state.connection = { ...(data?.connection || {}), demo: true };
        state.isDemo = true;
        elements.demoNotice.hidden = false;
        render();
      } catch (_) {
        useDemo(error.message);
      }
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
    elements.connection.classList.toggle("hata", !connected);
    $("span", elements.connection).textContent = connected ? "Bağlı" : "Demo modu";
    const noConnection = !connected;
    elements.setup.hidden = !noConnection;
    elements.setupLink.href = state.connection?.gmailConfigured === false ? "#" : "/auth/google";
    elements.setupLink.textContent = state.connection?.gmailConfigured === false ? "Kurulum bilgisi" : "Gmail'i bağla";
    const owner = state.connection?.email || state.connection?.account;
    elements.welcome.textContent = state.isDemo ? "Örnek e-postalarla akıllı önceliklendirmeyi keşfet." : owner ? `${owner} için öncelikler yapay zekâ ile sıralandı.` : "Gelen kutundaki önemli konular yapay zekâ ile sıralandı.";
    elements.updated.textContent = state.isDemo ? "Örnek veriler" : state.connection?.lastSyncAt ? `Son eşitleme ${relativeTime(state.connection.lastSyncAt)}` : "Henüz eşitlenmedi";
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
    if (state.isDemo) { notify("Demo verileri zaten güncel.", "uyari"); return; }
    elements.sync.disabled = true; elements.sync.innerHTML = '<span aria-hidden="true">↻</span> Yenileniyor…';
    try { await request("/api/sync", { method: "POST", body: "{}" }); await loadDashboard(); notify("Gelen kutusu yenilendi.", "basari"); }
    catch (error) { notify(error.code === 401 ? "Yenilemek için giriş yapmalısın." : "E-postalar yenilenemedi.", "uyari"); if (error.code === 401) showLogin(); }
    finally { elements.sync.disabled = false; elements.sync.innerHTML = '<span aria-hidden="true">↻</span> Postaları yenile'; }
  }

  function notify(message, type = "") { const note = document.createElement("div"); note.className = `bildirim ${type}`; note.textContent = message; elements.notifications.append(note); window.setTimeout(() => note.remove(), 4200); }
  function showLogin() { elements.loginError.textContent = ""; if (!elements.login.open) elements.login.showModal(); window.setTimeout(() => elements.password.focus(), 30); }
  async function login() {
    const password = elements.password.value; if (!password) return;
    elements.loginButton.disabled = true; elements.loginError.textContent = "";
    try { await request("/api/login", { method: "POST", body: JSON.stringify({ password }) }); elements.password.value = ""; elements.login.close(); state.loginRequired = false; await loadDashboard(); notify("Giriş başarılı.", "basari"); }
    catch (error) { elements.loginError.textContent = error.code === 401 ? "Parola doğru değil." : "Giriş yapılamadı. Bağlantını kontrol et."; }
    finally { elements.loginButton.disabled = false; }
  }

  async function logout() {
    if (state.isDemo) { notify("Demo modunda oturum yok.", "uyari"); return; }
    try { await request("/api/logout", { method: "POST", body: "{}" }); showLogin(); }
    catch (_) { notify("Oturum kapatılamadı.", "uyari"); }
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
    elements.loginForm.addEventListener("submit", event => { event.preventDefault(); login(); }); $("#girisKapat").addEventListener("click", () => elements.login.close());
    elements.theme.addEventListener("click", () => { const dark = !document.body.classList.contains("koyu"); document.body.classList.toggle("koyu", dark); localStorage.setItem("odak-posta-tema", dark ? "dark" : "light"); elements.theme.setAttribute("aria-label", dark ? "Açık temayı aç" : "Koyu temayı aç"); });
    elements.account.addEventListener("click", () => { if (state.loginRequired) showLogin(); else if (state.authChecked && !state.isDemo && confirm("Oturumu kapatmak istiyor musun?")) logout(); else notify(state.isDemo ? "Demo modundasın." : "Oturumun açık."); });
    elements.setupLink.addEventListener("click", event => {
      if (elements.setupLink.getAttribute("href") === "#") {
        event.preventDefault();
        notify("Gmail bağlantısı için sunucuda Google OAuth bilgileri yapılandırılmalı.", "uyari");
      }
    });
  }

  async function boot() { initialiseTheme(); bindEvents(); const allowed = await checkAuth(); if (allowed) await loadDashboard(); }
  boot();
})();
