(() => {
  const AGENT_KEY = "callcenter_last_agent";
  const COLLECTION = "leads";

  const form = document.getElementById("leadForm");
  const leadId = document.getElementById("leadId");
  const customerName = document.getElementById("customerName");
  const phone = document.getElementById("phone");
  const followUpDate = document.getElementById("followUpDate");
  const preferredTime = document.getElementById("preferredTime");
  const service = document.getElementById("service");
  const agentName = document.getElementById("agentName");
  const details = document.getElementById("details");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const searchInput = document.getElementById("searchInput");
  const interestFilter = document.getElementById("interestFilter");
  const bookedFilter = document.getElementById("bookedFilter");
  const exportScope = document.getElementById("exportScope");
  const leadsBody = document.getElementById("leadsBody");
  const leadsCards = document.getElementById("leadsCards");
  const emptyState = document.getElementById("emptyState");
  const toast = document.getElementById("toast");
  const installBtn = document.getElementById("installBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const exportXlsxBtn = document.getElementById("exportXlsxBtn");
  const syncBar = document.getElementById("syncBar");
  const syncText = document.getElementById("syncText");
  const setupPanel = document.getElementById("setupPanel");

  let leads = [];
  let db = null;
  let deferredPrompt = null;
  let toastTimer = null;
  let saving = false;

  agentName.value = localStorage.getItem(AGENT_KEY) || "";

  function setSyncState(state, message) {
    syncBar.dataset.state = state;
    syncText.textContent = message;
  }

  function isConfigured() {
    const cfg = window.FIREBASE_CONFIG || {};
    return Boolean(
      cfg.apiKey &&
        cfg.projectId &&
        !String(cfg.apiKey).startsWith("PASTE_") &&
        !String(cfg.projectId).startsWith("PASTE_")
    );
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function interestLabel(value) {
    if (value === "yes") return "مهتم";
    if (value === "maybe") return "محتمل";
    return "غير مهتم";
  }

  function bookedLabel(value) {
    return value === "yes" ? "نعم" : "لا";
  }

  function badgeClass(value) {
    if (value === "yes") return "badge-yes";
    if (value === "maybe") return "badge-maybe";
    return "badge-no";
  }

  function formatDate(value) {
    if (!value) return "—";
    const [y, m, d] = value.split("-");
    if (!y || !m || !d) return value;
    return `${d}/${m}/${y}`;
  }

  function getSelected(name) {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  }

  function setSelected(name, value) {
    const el = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  }

  function resetForm(keepAgent = true) {
    const agent = keepAgent ? agentName.value : "";
    form.reset();
    leadId.value = "";
    setSelected("interested", "yes");
    setSelected("booked", "no");
    agentName.value = agent;
    saveBtn.textContent = "حفظ العميل";
    cancelEditBtn.hidden = true;
  }

  function getFilteredLeads() {
    const q = searchInput.value.trim().toLowerCase();
    const interest = interestFilter.value;
    const booked = bookedFilter.value;

    return leads.filter((lead) => {
      const matchesQuery =
        !q ||
        lead.customerName.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        (lead.service || "").toLowerCase().includes(q) ||
        (lead.details || "").toLowerCase().includes(q);

      const matchesInterest = interest === "all" || lead.interested === interest;
      const matchesBooked = booked === "all" || lead.booked === booked;
      return matchesQuery && matchesInterest && matchesBooked;
    });
  }

  function getExportLeads() {
    const scope = exportScope.value;
    if (scope === "all") return [...leads];
    if (scope === "targets") {
      return leads.filter((l) => l.interested === "yes" || l.interested === "maybe");
    }
    return getFilteredLeads();
  }

  function updateStats() {
    document.getElementById("statTotal").textContent = String(leads.length);
    document.getElementById("statInterested").textContent = String(
      leads.filter((l) => l.interested === "yes").length
    );
    document.getElementById("statMaybe").textContent = String(
      leads.filter((l) => l.interested === "maybe").length
    );
    document.getElementById("statBooked").textContent = String(
      leads.filter((l) => l.booked === "yes").length
    );
  }

  function actionButtons(id) {
    return `
      <div class="row-actions">
        <button type="button" class="btn btn-tiny" data-edit="${id}">تعديل</button>
        <button type="button" class="btn btn-danger" data-delete="${id}">حذف</button>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderTable() {
    const rows = getFilteredLeads();
    leadsBody.innerHTML = "";
    leadsCards.innerHTML = "";
    emptyState.classList.toggle("visible", rows.length === 0);

    rows.forEach((lead) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(lead.customerName)}</strong></td>
        <td dir="ltr">${escapeHtml(lead.phone)}</td>
        <td><span class="badge ${badgeClass(lead.interested)}">${interestLabel(lead.interested)}</span></td>
        <td><span class="badge ${badgeClass(lead.booked)}">${bookedLabel(lead.booked)}</span></td>
        <td>${escapeHtml(formatDate(lead.followUpDate))}${lead.preferredTime ? `<div class="muted-note">${escapeHtml(lead.preferredTime)}</div>` : ""}</td>
        <td>${escapeHtml(lead.service || "—")}</td>
        <td class="details-cell" title="${escapeHtml(lead.details || "")}">${escapeHtml(lead.details || "—")}</td>
        <td>${actionButtons(lead.id)}</td>
      `;
      leadsBody.appendChild(tr);

      const card = document.createElement("article");
      card.className = "lead-card";
      card.innerHTML = `
        <div class="lead-card-top">
          <div>
            <h3>${escapeHtml(lead.customerName)}</h3>
            <a class="phone-link" href="tel:${escapeHtml(lead.phone)}" dir="ltr">${escapeHtml(lead.phone)}</a>
          </div>
          <div class="lead-card-badges">
            <span class="badge ${badgeClass(lead.interested)}">${interestLabel(lead.interested)}</span>
            <span class="badge ${badgeClass(lead.booked)}">حجز: ${bookedLabel(lead.booked)}</span>
          </div>
        </div>
        <dl class="lead-card-meta">
          <div><dt>اليوم</dt><dd>${escapeHtml(formatDate(lead.followUpDate))}</dd></div>
          <div><dt>الوقت</dt><dd>${escapeHtml(lead.preferredTime || "—")}</dd></div>
          <div><dt>الخدمة</dt><dd>${escapeHtml(lead.service || "—")}</dd></div>
        </dl>
        ${lead.details ? `<p class="lead-card-details">${escapeHtml(lead.details)}</p>` : ""}
        ${actionButtons(lead.id)}
      `;
      leadsCards.appendChild(card);
    });
  }

  function refresh() {
    updateStats();
    renderTable();
  }

  async function upsertLead(payload, id) {
    if (!db) throw new Error("db-not-ready");
    if (id) {
      await db.collection(COLLECTION).doc(id).set(payload, { merge: true });
      return id;
    }
    const ref = await db.collection(COLLECTION).add(payload);
    return ref.id;
  }

  async function removeLead(id) {
    if (!db) throw new Error("db-not-ready");
    await db.collection(COLLECTION).doc(id).delete();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db) {
      showToast("قاعدة البيانات المشتركة غير مفعلة بعد");
      return;
    }
    if (saving) return;

    const name = customerName.value.trim();
    const phoneValue = phone.value.trim();
    if (!name || !phoneValue) {
      showToast("الاسم ورقم الهاتف مطلوبان");
      return;
    }

    const payload = {
      customerName: name,
      phone: phoneValue,
      interested: getSelected("interested"),
      booked: getSelected("booked"),
      followUpDate: followUpDate.value,
      preferredTime: preferredTime.value.trim(),
      service: service.value.trim(),
      agentName: agentName.value.trim(),
      details: details.value.trim(),
      updatedAt: new Date().toISOString(),
    };

    if (!leadId.value) {
      payload.createdAt = new Date().toISOString();
    }

    if (agentName.value.trim()) {
      localStorage.setItem(AGENT_KEY, agentName.value.trim());
    }

    saving = true;
    saveBtn.disabled = true;
    try {
      await upsertLead(payload, leadId.value || null);
      showToast(leadId.value ? "تم تحديث بيانات العميل" : "تم حفظ العميل للفريق كله");
      resetForm(true);
      customerName.focus();
    } catch (err) {
      console.error(err);
      showToast("فشل الحفظ — تحقق من الاتصال أو قواعد Firestore");
    } finally {
      saving = false;
      saveBtn.disabled = false;
    }
  });

  resetBtn.addEventListener("click", () => {
    resetForm(true);
    customerName.focus();
  });

  cancelEditBtn.addEventListener("click", () => {
    resetForm(true);
    showToast("تم إلغاء التعديل");
  });

  async function handleLeadAction(e) {
    const editId = e.target.getAttribute("data-edit");
    const deleteId = e.target.getAttribute("data-delete");

    if (editId) {
      const lead = leads.find((l) => l.id === editId);
      if (!lead) return;
      leadId.value = lead.id;
      customerName.value = lead.customerName;
      phone.value = lead.phone;
      setSelected("interested", lead.interested);
      setSelected("booked", lead.booked);
      followUpDate.value = lead.followUpDate || "";
      preferredTime.value = lead.preferredTime || "";
      service.value = lead.service || "";
      agentName.value = lead.agentName || agentName.value;
      details.value = lead.details || "";
      saveBtn.textContent = "تحديث العميل";
      cancelEditBtn.hidden = false;
      customerName.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (deleteId) {
      const lead = leads.find((l) => l.id === deleteId);
      if (!lead) return;
      const ok = confirm(`حذف العميل "${lead.customerName}" من سجل الفريق؟`);
      if (!ok) return;
      try {
        await removeLead(deleteId);
        if (leadId.value === deleteId) resetForm(true);
        showToast("تم حذف العميل من السجل المشترك");
      } catch (err) {
        console.error(err);
        showToast("فشل الحذف");
      }
    }
  }

  leadsBody.addEventListener("click", handleLeadAction);
  leadsCards.addEventListener("click", handleLeadAction);

  [searchInput, interestFilter, bookedFilter].forEach((el) => {
    el.addEventListener("input", renderTable);
    el.addEventListener("change", renderTable);
  });

  function toSheetRows(list) {
    return list.map((lead, index) => ({
      "#": index + 1,
      "اسم العميل": lead.customerName,
      "رقم الهاتف": lead.phone,
      "مهتم بالخدمة": interestLabel(lead.interested),
      "تم الحجز": bookedLabel(lead.booked),
      "يوم المتابعة": lead.followUpDate || "",
      "وقت مناسب": lead.preferredTime || "",
      "الخدمة / العرض": lead.service || "",
      التفاصيل: lead.details || "",
      "اسم الموظف": lead.agentName || "",
      "تاريخ التسجيل": lead.createdAt
        ? new Date(lead.createdAt).toLocaleString("ar-EG")
        : "",
      "آخر تحديث": lead.updatedAt
        ? new Date(lead.updatedAt).toLocaleString("ar-EG")
        : "",
    }));
  }

  function summaryRows(list) {
    return [
      { المؤشر: "إجمالي العملاء", القيمة: list.length },
      {
        المؤشر: "مهتمين",
        القيمة: list.filter((l) => l.interested === "yes").length,
      },
      {
        المؤشر: "محتملين",
        القيمة: list.filter((l) => l.interested === "maybe").length,
      },
      {
        المؤشر: "غير مهتمين",
        القيمة: list.filter((l) => l.interested === "no").length,
      },
      {
        المؤشر: "محجوز",
        القيمة: list.filter((l) => l.booked === "yes").length,
      },
      {
        المؤشر: "غير محجوز",
        القيمة: list.filter((l) => l.booked === "no").length,
      },
    ];
  }

  function fileStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  }

  function exportCsv() {
    const list = getExportLeads();
    if (!list.length) {
      showToast("لا توجد بيانات للتصدير");
      return;
    }

    const rows = toSheetRows(list);
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `عملاء-الكول-سنتر_${fileStamp()}.csv`);
    showToast("تم تصدير CSV");
  }

  function exportXlsx() {
    if (typeof XLSX === "undefined") {
      showToast("مكتبة Excel غير متاحة، استخدم CSV");
      return;
    }

    const list = getExportLeads();
    if (!list.length) {
      showToast("لا توجد بيانات للتصدير");
      return;
    }

    const wb = XLSX.utils.book_new();
    const detailsSheet = XLSX.utils.json_to_sheet(toSheetRows(list));
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows(list));
    const targets = list.filter(
      (l) => l.interested === "yes" || l.interested === "maybe"
    );
    const targetsSheet = XLSX.utils.json_to_sheet(toSheetRows(targets));
    const booked = list.filter((l) => l.booked === "yes");
    const bookedSheet = XLSX.utils.json_to_sheet(toSheetRows(booked));

    XLSX.utils.book_append_sheet(wb, detailsSheet, "كل العملاء");
    XLSX.utils.book_append_sheet(wb, summarySheet, "ملخص");
    XLSX.utils.book_append_sheet(wb, targetsSheet, "المحتملين");
    XLSX.utils.book_append_sheet(wb, bookedSheet, "المحجوزين");

    XLSX.writeFile(wb, `عملاء-الكول-سنتر_${fileStamp()}.xlsx`);
    showToast("تم تصدير Excel بالجداول");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  exportCsvBtn.addEventListener("click", exportCsv);
  exportXlsxBtn.addEventListener("click", exportXlsx);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  function startSharedSync() {
    if (!isConfigured()) {
      setupPanel.hidden = false;
      setSyncState("error", "السجل المشترك غير مفعل — أكمِل إعداد Firebase");
      refresh();
      return;
    }

    if (typeof firebase === "undefined") {
      setupPanel.hidden = false;
      setSyncState("error", "تعذر تحميل Firebase");
      return;
    }

    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      db = firebase.firestore();
    } catch (err) {
      console.error(err);
      setupPanel.hidden = false;
      setSyncState("error", "إعدادات Firebase غير صحيحة");
      return;
    }

    setupPanel.hidden = true;
    setSyncState("loading", "جاري مزامنة سجل الفريق...");

    db.collection(COLLECTION).onSnapshot(
      (snapshot) => {
        leads = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        refresh();
        setSyncState("online", `متصل — سجل مشترك للفريق (${leads.length})`);
      },
      (err) => {
        console.error(err);
        setSyncState(
          "error",
          "فشل الاتصال بـ Firestore — فعّل Test mode أو انشر القواعد من firestore.rules.txt"
        );
        setupPanel.hidden = false;
      }
    );
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  startSharedSync();
})();
