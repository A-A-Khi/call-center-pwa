import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { registerSW } from "virtual:pwa-register";
import { db } from "./firebase.js";
import { DOC_SYNC } from "./sync-config.js";

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) {
      window.__doctorSwRegistration = registration;
    }
  },
});

const APPOINTMENTS = "appointments";
const LEADS = "leads";
const NOTIFY_TODAY_KEY = "doctor_notified_today";
const KNOWN_IDS_KEY = "doctor_known_appt_ids";
const UPCOMING_KEY = "doctor_upcoming_notified";

const syncBar = document.getElementById("syncBar");
const syncText = document.getElementById("syncText");
const monthLabel = document.getElementById("monthLabel");
const calendarGrid = document.getElementById("calendarGrid");
const weekdayRow = document.getElementById("weekdayRow");
const agendaTitle = document.getElementById("agendaTitle");
const agendaSub = document.getElementById("agendaSub");
const agendaList = document.getElementById("agendaList");
const emptyAgenda = document.getElementById("emptyAgenda");
const hideCancelled = document.getElementById("hideCancelled");
const todayBanner = document.getElementById("todayBanner");
const todayBannerTitle = document.getElementById("todayBannerTitle");
const todayBannerText = document.getElementById("todayBannerText");
const jumpTodayBtn = document.getElementById("jumpTodayBtn");
const notifyBtn = document.getElementById("notifyBtn");
const installBtn = document.getElementById("installBtn");
const installSheet = document.getElementById("installSheet");
const toast = document.getElementById("toast");
let deferredInstallPrompt = null;
const apptDialog = document.getElementById("apptDialog");
const editApptId = document.getElementById("editApptId");
const editPatientName = document.getElementById("editPatientName");
const editPhoneLink = document.getElementById("editPhoneLink");
const editService = document.getElementById("editService");
const editVisitDate = document.getElementById("editVisitDate");
const editVisitTime = document.getElementById("editVisitTime");
const editDetails = document.getElementById("editDetails");
const dialogStatus = document.getElementById("dialogStatus");
const dialogTitle = document.getElementById("dialogTitle");
const saveApptBtn = document.getElementById("saveApptBtn");
const cancelApptBtn = document.getElementById("cancelApptBtn");
const confirmApptBtn = document.getElementById("confirmApptBtn");
const completeVisitBtn = document.getElementById("completeVisitBtn");
const saveVisitEditBtn = document.getElementById("saveVisitEditBtn");
const visitCompletePanel = document.getElementById("visitCompletePanel");
const visitCompleteTitle = document.getElementById("visitCompleteTitle");
const visitCompleteHint = document.getElementById("visitCompleteHint");
const invoiceItemsList = document.getElementById("invoiceItemsList");
const addInvoiceItemBtn = document.getElementById("addInvoiceItemBtn");
const visitCaseCostEgp = document.getElementById("visitCaseCostEgp");
const visitCaseCostNote = document.getElementById("visitCaseCostNote");
const doctorBillTotal = document.getElementById("doctorBillTotal");
const doctorAfterCosts = document.getElementById("doctorAfterCosts");
const visitPaidEgp = document.getElementById("visitPaidEgp");
const visitClinicalNotes = document.getElementById("visitClinicalNotes");
const followUpBlock = document.getElementById("followUpBlock");
const followUpSlotPanel = document.getElementById("followUpSlotPanel");
const followUpVisitDate = document.getElementById("followUpVisitDate");
const followUpVisitTime = document.getElementById("followUpVisitTime");
const followUpDetails = document.getElementById("followUpDetails");
const completedSummary = document.getElementById("completedSummary");
const completedSummaryText = document.getElementById("completedSummaryText");
const paymentStatusLine = document.getElementById("paymentStatusLine");
const syncStatusLine = document.getElementById("syncStatusLine");
const retrySyncBtn = document.getElementById("retrySyncBtn");
const paymentPanel = document.getElementById("paymentPanel");
const paymentPanelHint = document.getElementById("paymentPanelHint");
const savePaymentBtn = document.getElementById("savePaymentBtn");
const shareInvoiceBtn = document.getElementById("shareInvoiceBtn");
const doctorSearchInput = document.getElementById("doctorSearchInput");
const doctorSearchResults = document.getElementById("doctorSearchResults");
const statAwaiting = document.getElementById("statAwaiting");
const statConfirmed = document.getElementById("statConfirmed");
const statToday = document.getElementById("statToday");
const statCompleted = document.getElementById("statCompleted");

const INVOICE_BRAND = "Dentist On Call";
const LOGO_URL = new URL(
  `${import.meta.env.BASE_URL}icons/logo-official.png`,
  window.location.origin
).href;

let appointments = [];
let viewMode = "month";
let cursor = startOfMonth(new Date());
let selectedDate = todayISO();
let toastTimer = null;
let knownIds = loadKnownIds();
let initialSnapshot = true;
let mutationBusy = false;

async function withBusy(button, fn, { loadingText, nested = false } = {}) {
  if (!nested && mutationBusy) return;
  if (button?.dataset?.busy === "1") return;
  const ownsLock = !nested;
  if (ownsLock) mutationBusy = true;
  const originalText = button?.textContent;
  if (button) {
    button.dataset.busy = "1";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("is-loading");
    if (loadingText) button.textContent = loadingText;
  }
  try {
    return await fn();
  } finally {
    if (ownsLock) mutationBusy = false;
    if (button) {
      button.dataset.busy = "0";
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.classList.remove("is-loading");
      if (loadingText) button.textContent = originalText;
    }
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayISO() {
  return toISODate(new Date());
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function parseISODate(value) {
  const [y, m, day] = String(value || "").split("-").map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

function formatDateLabel(value) {
  const d = parseISODate(value);
  if (!d) return "—";
  return d.toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatMonthLabel(d) {
  return d.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
}

function formatTime(value) {
  if (!value) return "—";
  const [h, m] = String(value).split(":");
  if (h == null || m == null) return value;
  return `${h}:${m}`;
}

/** Normalize statuses — including legacy call-center "confirmed" without doctorConfirmedAt */
function normalizeStatus(appt) {
  const status = typeof appt === "string" ? appt : appt?.status;
  const doctorConfirmedAt =
    typeof appt === "object" && appt ? appt.doctorConfirmedAt : null;

  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (status === "awaiting_doctor" || status === "pending") return "awaiting_doctor";
  if (status === "confirmed" || status === "doctor_confirmed") {
    // الحجوزات القديمة من الكول سنتر كانت confirmed من غير تأكيد دكتور
    if (!doctorConfirmedAt && typeof appt === "object" && appt) {
      return "awaiting_doctor";
    }
    return "confirmed";
  }
  return "awaiting_doctor";
}

function statusLabel(statusOrAppt) {
  const s = normalizeStatus(statusOrAppt);
  if (s === "cancelled") return "ملغى";
  if (s === "completed") return "تم الكشف";
  if (s === "confirmed") return "مؤكد من الدكتور";
  return "بانتظار تأكيد الدكتور";
}

function statusClass(statusOrAppt) {
  const s = normalizeStatus(statusOrAppt);
  if (s === "cancelled") return "cancelled";
  if (s === "completed") return "completed";
  if (s === "confirmed") return "";
  return "awaiting";
}

function isActive(appt) {
  return normalizeStatus(appt) !== "cancelled";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function loadKnownIds() {
  try {
    const raw = localStorage.getItem(KNOWN_IDS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function saveKnownIds() {
  localStorage.setItem(KNOWN_IDS_KEY, JSON.stringify([...knownIds]));
}

function setSync(state, text) {
  syncBar.dataset.state = state;
  syncText.textContent = text;
}

function forDate(dateISO, { includeCancelled = false } = {}) {
  return appointments
    .filter((a) => a.visitDate === dateISO)
    .filter((a) => includeCancelled || isActive(a))
    .sort((a, b) => String(a.visitTime || "").localeCompare(String(b.visitTime || "")));
}

function countsForDate(dateISO) {
  const day = appointments.filter((a) => a.visitDate === dateISO);
  return {
    active: day.filter(isActive).length,
    awaiting: day.filter((a) => normalizeStatus(a) === "awaiting_doctor").length,
    confirmed: day.filter((a) => normalizeStatus(a) === "confirmed").length,
    completed: day.filter((a) => normalizeStatus(a) === "completed").length,
    cancelled: day.filter((a) => normalizeStatus(a) === "cancelled").length,
  };
}

function getVisibleDays() {
  if (viewMode === "day") {
    const d = parseISODate(selectedDate) || new Date();
    return [d];
  }

  if (viewMode === "week") {
    const selected = parseISODate(selectedDate) || new Date();
    const start = new Date(selected);
    start.setDate(selected.getDate() - selected.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function renderCalendar() {
  monthLabel.textContent =
    viewMode === "day"
      ? formatDateLabel(selectedDate)
      : viewMode === "week"
        ? `أسبوع ${formatDateLabel(selectedDate)}`
        : formatMonthLabel(cursor);

  calendarGrid.dataset.mode = viewMode;
  weekdayRow.hidden = viewMode === "day";
  calendarGrid.innerHTML = "";

  const days = getVisibleDays();
  const today = todayISO();

  days.forEach((d) => {
    const iso = toISODate(d);
    const counts = countsForDate(iso);
    const totalVisible = hideCancelled.checked
      ? counts.active
      : counts.active + counts.cancelled;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-cell";
    btn.dataset.date = iso;
    if (d.getMonth() !== cursor.getMonth() && viewMode === "month") {
      btn.classList.add("is-outside");
    }
    if (iso === today) btn.classList.add("is-today");
    if (iso === selectedDate) btn.classList.add("is-selected");

    const dots = [];
    if (counts.awaiting > 0) dots.push('<span class="dot awaiting"></span>');
    if (counts.confirmed > 0) dots.push('<span class="dot"></span>');
    if (counts.completed > 0) dots.push('<span class="dot completed"></span>');
    if (!hideCancelled.checked && counts.cancelled > 0) {
      dots.push('<span class="dot cancelled"></span>');
    }

    btn.innerHTML = `
      <span class="day-num">${d.getDate()}</span>
      <span class="day-dots">${dots.join("")}</span>
      ${totalVisible ? `<span class="day-count">${totalVisible} موعد</span>` : ""}
    `;
    btn.addEventListener("click", () => {
      selectedDate = iso;
      if (viewMode === "month") cursor = startOfMonth(d);
      renderAll();
    });
    calendarGrid.appendChild(btn);
  });
}

function renderAgenda() {
  agendaTitle.textContent =
    selectedDate === todayISO() ? "جدول اليوم" : "جدول اليوم المحدد";
  agendaSub.textContent = formatDateLabel(selectedDate);

  const includeCancelled = !hideCancelled.checked;
  const rows = forDate(selectedDate, { includeCancelled });
  agendaList.innerHTML = "";
  emptyAgenda.classList.toggle("visible", rows.length === 0);

  rows.forEach((appt, index) => {
    const status = normalizeStatus(appt);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `appt-card${status === "cancelled" ? " is-cancelled" : ""}`;
    card.style.animationDelay = `${index * 0.04}s`;
    const money = completedMoneyLabel(appt, status);
    card.innerHTML = `
      <span class="appt-time">${formatTime(appt.visitTime)}</span>
      <span class="appt-body">
        <strong>${escapeHtml(appt.patientName || "بدون اسم")}</strong>
        <p>${escapeHtml(appt.visit?.serviceName || appt.service || appt.phone || "—")}${money}</p>
      </span>
      <span class="appt-status ${statusClass(appt)}">${statusLabel(appt)}</span>
    `;
    card.addEventListener("click", () => openDialog(appt));
    agendaList.appendChild(card);
  });
}

function renderStats() {
  const awaiting = appointments.filter(
    (a) => normalizeStatus(a) === "awaiting_doctor"
  ).length;
  const confirmed = appointments.filter(
    (a) => normalizeStatus(a) === "confirmed"
  ).length;
  const completed = appointments.filter(
    (a) => normalizeStatus(a) === "completed"
  ).length;
  const todayCount = forDate(todayISO()).length;

  statAwaiting.textContent = String(awaiting);
  statConfirmed.textContent = String(confirmed);
  statToday.textContent = String(todayCount);
  statCompleted.textContent = String(completed);

  if (todayCount > 0) {
    todayBanner.hidden = false;
    const needConfirm = forDate(todayISO()).filter(
      (a) => normalizeStatus(a) === "awaiting_doctor"
    ).length;
    todayBannerTitle.textContent = `عندك ${todayCount} موعد اليوم`;
    todayBannerText.textContent = needConfirm
      ? `منها ${needConfirm} بانتظار تأكيدك`
      : `أقرب موعد الساعة ${formatTime(forDate(todayISO())[0]?.visitTime)}`;
  } else {
    todayBanner.hidden = true;
  }
}

function renderAll() {
  renderCalendar();
  renderAgenda();
  renderStats();
  renderSearchResults();
}

function getLeadId(appt) {
  return appt?.leadId || appt?.id || "";
}

function getFollowUpBooked() {
  const selected = document.querySelector('input[name="followUpBooked"]:checked');
  return selected?.value === "yes";
}

function setFollowUpBooked(value) {
  const radios = document.querySelectorAll('input[name="followUpBooked"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === value;
  });
  if (followUpSlotPanel) {
    followUpSlotPanel.hidden = value !== "yes";
  }
}

function resetFollowUpFields() {
  setFollowUpBooked("no");
  if (followUpVisitDate) followUpVisitDate.value = "";
  if (followUpVisitTime) followUpVisitTime.value = "";
  if (followUpDetails) followUpDetails.value = "";
}

function normalizeLineItems(rawItems, fallbackName = "", fallbackCost = 0) {
  const items = Array.isArray(rawItems)
    ? rawItems
        .map((item) => ({
          name: String(item?.name || "").trim(),
          amountEgp: Number(item?.amountEgp ?? item?.costEgp ?? 0),
        }))
        .filter((item) => item.name && Number.isFinite(item.amountEgp) && item.amountEgp >= 0)
    : [];
  if (items.length) return items;
  const name = String(fallbackName || "").trim();
  const amount = Number(fallbackCost) || 0;
  if (name) return [{ name, amountEgp: amount }];
  return [{ name: "", amountEgp: 0 }];
}

function visitLineItems(visit, appt = null) {
  return normalizeLineItems(
    visit?.lineItems,
    visit?.serviceName || appt?.service || "",
    visit?.costEgp ?? 0
  );
}

function sumLineItems(items) {
  return (items || []).reduce((sum, item) => sum + (Number(item.amountEgp) || 0), 0);
}

function visitCaseCostEgpOf(visit) {
  return Math.max(0, Number(visit?.caseCostEgp) || 0);
}

/** Patient-facing bill total = procedures only (lab/case cost excluded). */
function visitInvoiceTotalEgp(visit, appt = null) {
  if (Array.isArray(visit?.lineItems) && visit.lineItems.length) {
    return sumLineItems(visitLineItems(visit, appt));
  }
  return Math.max(0, Number(visit?.costEgp) || 0);
}

function visitAfterCostsEgp(visit, appt = null) {
  return Math.max(0, visitInvoiceTotalEgp(visit, appt) - visitCaseCostEgpOf(visit));
}

function renderInvoiceItemRows(items) {
  if (!invoiceItemsList) return;
  const rows = normalizeLineItems(items);
  invoiceItemsList.innerHTML = rows
    .map(
      (item, index) => `
      <div class="invoice-item-row" data-index="${index}">
        <input
          type="text"
          class="item-name"
          list="servicePriceList"
          placeholder="اسم البند"
          value="${escapeHtml(item.name)}"
          aria-label="اسم البند"
        />
        <input
          type="number"
          class="item-amount"
          min="0"
          step="1"
          inputmode="numeric"
          placeholder="0"
          value="${item.amountEgp || ""}"
          aria-label="مبلغ البند"
        />
        <button type="button" class="invoice-item-remove" data-remove="${index}" aria-label="حذف البند" ${rows.length <= 1 ? "disabled" : ""}>×</button>
      </div>`
    )
    .join("");
  updateDoctorTotalsPreview();
}

function readInvoiceItemRows() {
  if (!invoiceItemsList) return [];
  return Array.from(invoiceItemsList.querySelectorAll(".invoice-item-row")).map((row) => ({
    name: row.querySelector(".item-name")?.value.trim() || "",
    amountEgp: Number(row.querySelector(".item-amount")?.value || 0),
  }));
}

function updateDoctorTotalsPreview() {
  const items = readInvoiceItemRows();
  const billTotal = sumLineItems(
    items.filter((item) => item.name && Number.isFinite(item.amountEgp) && item.amountEgp >= 0)
  );
  const caseRaw = visitCaseCostEgp?.value;
  const caseCost =
    caseRaw === "" || caseRaw == null ? 0 : Math.max(0, Number(caseRaw) || 0);
  const after = Math.max(0, billTotal - caseCost);
  if (doctorBillTotal) doctorBillTotal.textContent = `${billTotal} ج`;
  if (doctorAfterCosts) doctorAfterCosts.textContent = `${after} ج`;
}

function readInvoiceFields() {
  const lineItems = readInvoiceItemRows()
    .map((item) => ({
      name: item.name.trim(),
      amountEgp: Number(item.amountEgp),
    }))
    .filter((item) => item.name);

  if (!lineItems.length) {
    showToast("أضف بند واحد على الأقل للفاتورة");
    invoiceItemsList?.querySelector(".item-name")?.focus();
    return null;
  }
  for (const item of lineItems) {
    if (!Number.isFinite(item.amountEgp) || item.amountEgp < 0) {
      showToast(`أدخل مبلغ صحيح للبند: ${item.name}`);
      return null;
    }
  }

  const caseCostRaw = visitCaseCostEgp?.value;
  const caseCostEgp =
    caseCostRaw === "" || caseCostRaw == null ? 0 : Number(caseCostRaw);
  const caseCostNote = (visitCaseCostNote?.value || "").trim().slice(0, 160);
  const clinicalNotes = visitClinicalNotes.value.trim();
  const costEgp = sumLineItems(lineItems);

  if (!Number.isFinite(caseCostEgp) || caseCostEgp < 0) {
    showToast("أدخل تكلفة المعمل بشكل صحيح (أو اتركها صفر)");
    visitCaseCostEgp?.focus();
    return null;
  }
  if (caseCostEgp > costEgp) {
    showToast("تكلفة المعمل أكبر من إجمالي الفاتورة");
    visitCaseCostEgp?.focus();
    return null;
  }

  return {
    lineItems,
    serviceName: lineItems.map((item) => item.name).join(" + "),
    costEgp,
    caseCostEgp,
    caseCostNote,
    clinicalNotes,
    afterCostsEgp: Math.max(0, costEgp - caseCostEgp),
  };
}

function computePaymentStatus(costEgp, paidEgp) {
  const cost = Number(costEgp) || 0;
  const paid = Number(paidEgp) || 0;
  if (paid <= 0) return "unpaid";
  if (paid >= cost) return "paid";
  return "partial";
}

function paymentStatusLabel(status) {
  if (status === "paid") return "مدفوع بالكامل";
  if (status === "partial") return "مدفوع جزئياً";
  return "في انتظار الدفع";
}

function remainingBalance(costEgp, paidEgp) {
  return Math.max(0, (Number(costEgp) || 0) - (Number(paidEgp) || 0));
}

function buildInvoiceNumber(appt) {
  const datePart = String(appt.visitDate || todayISO()).replaceAll("-", "");
  const idTail = String(appt.id || "xxxx").slice(-4).toUpperCase();
  return `DOC-${datePart}-${idTail}`;
}

function completedMoneyLabel(appt, status) {
  if (status !== "completed" || !appt.visit) return "";
  const cost = visitInvoiceTotalEgp(appt.visit);
  const paid = Number(appt.visit.paidEgp) || 0;
  const remain = remainingBalance(cost, paid);
  if (remain > 0) return ` · متبقي ${remain} ج`;
  if (paid > 0) return ` · مدفوع ${paid} ج`;
  return cost > 0 ? ` · فاتورة ${cost} ج` : "";
}

function readPaymentAmount(costEgp) {
  const paidEgp = Number(visitPaidEgp.value);
  if (!Number.isFinite(paidEgp) || paidEgp < 0) {
    showToast("أدخل مبلغ مدفوع صحيح");
    visitPaidEgp.focus();
    return null;
  }
  if (paidEgp > costEgp) {
    showToast("المدفوع أكبر من تكلفة الفاتورة");
    visitPaidEgp.focus();
    return null;
  }
  return paidEgp;
}

function searchNeedle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function appointmentMatchesQuery(appt, query) {
  if (!query) return false;
  const haystack = [
    appt.patientName,
    appt.phone,
    appt.service,
    appt.city,
    appt.visit?.serviceName,
    appt.visit?.clinicalNotes,
    appt.details,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderSearchResults() {
  if (!doctorSearchInput || !doctorSearchResults) return;
  const query = searchNeedle(doctorSearchInput.value);
  if (!query) {
    doctorSearchResults.hidden = true;
    doctorSearchResults.innerHTML = "";
    return;
  }

  const includeCancelled = !hideCancelled.checked;
  const matches = appointments
    .filter((a) => includeCancelled || isActive(a))
    .filter((a) => appointmentMatchesQuery(a, query))
    .sort((a, b) => {
      const dateCmp = String(b.visitDate || "").localeCompare(String(a.visitDate || ""));
      if (dateCmp !== 0) return dateCmp;
      return String(b.visitTime || "").localeCompare(String(a.visitTime || ""));
    })
    .slice(0, 40);

  doctorSearchResults.hidden = false;
  doctorSearchResults.innerHTML = "";

  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "search-empty";
    empty.textContent = "لا توجد نتائج مطابقة";
    doctorSearchResults.appendChild(empty);
    return;
  }

  matches.forEach((appt) => {
    const status = normalizeStatus(appt);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `search-result${status === "cancelled" ? " is-cancelled" : ""}`;
    btn.innerHTML = `
      <span class="search-result-main">
        <strong>${escapeHtml(appt.patientName || "بدون اسم")}</strong>
        <p>${escapeHtml(formatDateLabel(appt.visitDate))} · ${escapeHtml(formatTime(appt.visitTime))}</p>
        <p class="search-result-meta">${escapeHtml(appt.phone || "—")} · ${escapeHtml(appt.visit?.serviceName || appt.service || "—")}</p>
      </span>
      <span class="appt-status ${statusClass(appt)}">${statusLabel(appt)}</span>
    `;
    btn.addEventListener("click", () => openDialog(appt));
    doctorSearchResults.appendChild(btn);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setScheduleFieldsDisabled(disabled) {
  editVisitDate.disabled = disabled;
  editVisitTime.disabled = disabled;
  editDetails.disabled = disabled;
}

function fillCompletedSummary(appt) {
  const v = appt.visit || {};
  const items = visitLineItems(v, appt);
  const cost = visitInvoiceTotalEgp(v, appt);
  const caseCost = visitCaseCostEgpOf(v);
  const afterCosts = visitAfterCostsEgp(v, appt);
  const paid = Number(v.paidEgp) || 0;
  const remain = remainingBalance(cost, paid);
  const payStatus = v.paymentStatus || computePaymentStatus(cost, paid);
  const itemsLabel = items.map((item) => `${item.name} ${item.amountEgp} ج`).join(" · ");

  completedSummaryText.textContent = [
    v.invoiceNumber || null,
    itemsLabel || v.serviceName || appt.service || "خدمة",
    `الإجمالي ${cost} ج`,
    caseCost > 0 ? `معمل ${caseCost} ج · بعد التكاليف ${afterCosts} ج` : null,
    `مدفوع ${paid} ج`,
    remain > 0 ? `متبقي ${remain} ج` : null,
    v.clinicalNotes || null,
    appt.mainSite?.patientCode ? `كود ${appt.mainSite.patientCode}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (paymentStatusLine) {
    paymentStatusLine.textContent = paymentStatusLabel(payStatus);
    paymentStatusLine.className = `payment-status-line is-${payStatus}`;
  }

  if (paymentPanelHint) {
    paymentPanelHint.textContent =
      remain > 0
        ? `المتبقي ${remain} ج — سجّل إجمالي المدفوع حتى الآن (كامل أو جزء)`
        : "الفاتورة متسددة بالكامل — تقدر تعدّل المبلغ لو حصل خطأ";
  }
}

function openDialog(appt) {
  const status = normalizeStatus(appt);
  editApptId.value = appt.id;
  editPatientName.textContent = appt.patientName || "بدون اسم";
  editPhoneLink.textContent = appt.phone || "—";
  editPhoneLink.href = appt.phone ? `tel:${appt.phone}` : "#";
  editService.textContent = [appt.service, appt.city].filter(Boolean).join(" · ") || "—";
  editVisitDate.value = appt.visitDate || "";
  editVisitTime.value = appt.visitTime || "";
  editDetails.value = appt.details || "";
  dialogStatus.textContent = statusLabel(status);

  renderInvoiceItemRows(
    visitLineItems(appt.visit, appt).map((item) =>
      item.name || item.amountEgp
        ? item
        : { name: appt.service || "", amountEgp: 0 }
    )
  );
  if (visitCaseCostEgp) {
    visitCaseCostEgp.value =
      appt.visit?.caseCostEgp != null && appt.visit?.caseCostEgp !== ""
        ? appt.visit.caseCostEgp
        : "";
  }
  if (visitCaseCostNote) visitCaseCostNote.value = appt.visit?.caseCostNote || "";
  visitPaidEgp.value = appt.visit?.paidEgp ?? 0;
  visitClinicalNotes.value = appt.visit?.clinicalNotes || "";
  updateDoctorTotalsPreview();
  resetFollowUpFields();

  const scheduleLocked = status === "cancelled" || status === "completed";
  setScheduleFieldsDisabled(scheduleLocked);

  confirmApptBtn.hidden = status !== "awaiting_doctor";
  completeVisitBtn.hidden = status !== "confirmed";
  saveVisitEditBtn.hidden = status !== "completed";
  shareInvoiceBtn.hidden = status !== "completed";
  if (paymentPanel) paymentPanel.hidden = status !== "completed";
  visitCompletePanel.hidden = !(status === "confirmed" || status === "completed");
  if (followUpBlock) followUpBlock.hidden = status !== "confirmed";
  saveApptBtn.hidden = scheduleLocked;
  cancelApptBtn.hidden = scheduleLocked;
  saveApptBtn.textContent = "حفظ التعديل";

  if (status === "confirmed") {
    visitCompleteTitle.textContent = "إصدار فاتورة بعد الكشف";
    visitCompleteHint.textContent =
      "بنود الفاتورة للمريض — تكلفة المعمل للحسابات فقط ومش بتظهر في الفاتورة";
  } else if (status === "completed") {
    visitCompleteTitle.textContent = "تعديل بيانات الفاتورة";
    visitCompleteHint.textContent =
      "عدّل البنود أو تكلفة المعمل الداخلية ثم احفظ — فاتورة المريض بدون المعمل";
  }

  retrySyncBtn.hidden = true;

  if (status === "completed") {
    dialogTitle.textContent = "زيارة مكتملة";
    completedSummary.hidden = false;
    fillCompletedSummary(appt);
    const syncStatus = appt.syncStatus || "pending";
    syncStatusLine.textContent = syncStatusLabel(syncStatus);
    syncStatusLine.className = `sync-line is-${syncStatus}`;
    if (appt.syncError && syncStatus === "failed") {
      syncStatusLine.textContent += ` (${appt.syncError})`;
    }
    retrySyncBtn.hidden = syncStatus === "synced";
  } else if (status === "awaiting_doctor") {
    dialogTitle.textContent = "تأكيد الموعد";
    completedSummary.hidden = true;
  } else if (status === "confirmed") {
    dialogTitle.textContent = "إنهاء الزيارة";
    completedSummary.hidden = true;
  } else {
    dialogTitle.textContent = "موعد ملغى";
    completedSummary.hidden = true;
  }

  apptDialog.showModal();
}

async function syncLeadFromAppointment(apptOrId, patch) {
  const leadId =
    typeof apptOrId === "string"
      ? apptOrId
      : getLeadId(apptOrId);
  if (!leadId) return;
  const leadRef = doc(db, LEADS, leadId);
  try {
    await updateDoc(leadRef, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("lead sync skipped", err);
  }
}

async function createFollowUpAppointment(appt, { visitDate, visitTime, details }) {
  const updatedAt = new Date().toISOString();
  const leadId = getLeadId(appt);
  const payload = {
    leadId,
    patientName: appt.patientName || "",
    phone: appt.phone || "",
    city: appt.city || "",
    service: appt.service || appt.visit?.serviceName || "",
    visitDate,
    visitTime,
    status: "confirmed",
    doctorConfirmedAt: updatedAt,
    details: details || "حجز متابعة بعد الكشف",
    source: "doctor_followup",
    parentAppointmentId: appt.id,
    agentName: appt.agentName || "",
    createdAt: updatedAt,
    updatedAt,
  };
  const ref = await addDoc(collection(db, APPOINTMENTS), payload);
  await syncLeadFromAppointment(leadId || appt, {
    booked: "yes",
    visitDate,
    visitTime,
    doctorStatus: "confirmed",
    details: details || appt.details || "",
  });
  return ref.id;
}

function syncStatusLabel(syncStatus) {
  if (syncStatus === "synced") return "تمت المزامنة مع الموقع الرئيسي";
  if (syncStatus === "failed") return "فشلت المزامنة — يمكن إعادة المحاولة";
  if (syncStatus === "pending") return "جاري/بانتظار المزامنة مع الموقع الرئيسي";
  return "لم تتم المزامنة بعد";
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo load failed"));
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function renderInvoiceCanvas(appt) {
  const visit = appt.visit || {};
  // Patient bill: procedure lines only — never include lab/case costs.
  const lineItems = visitLineItems(visit, appt).map((item) => ({
    name: item.name,
    amount: item.amountEgp,
  }));
  const total = visitInvoiceTotalEgp(visit, appt);
  const paid = Number(visit.paidEgp) || 0;
  const remain = remainingBalance(total, paid);
  const payStatus = visit.paymentStatus || computePaymentStatus(total, paid);
  const extraLines = Math.max(0, lineItems.length - 1);
  const width = 720;
  const height = 980 + extraLines * 46;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const ink = "#111111";
  const gold = "#c9a227";
  const muted = "#6b6b66";
  const soft = "#f7f7f5";

  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, 150);
  ctx.fillStyle = gold;
  ctx.fillRect(0, 150, width, 3);

  let logo = null;
  try {
    logo = await loadImage(LOGO_URL);
  } catch {
    logo = null;
  }
  if (logo) {
    const size = 72;
    ctx.drawImage(logo, 48, 39, size, size);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px IBM Plex Sans Arabic, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(INVOICE_BRAND, width - 48, 70);
  ctx.fillStyle = gold;
  ctx.font = "500 20px IBM Plex Sans Arabic, Arial, sans-serif";
  ctx.fillText("فاتورة خدمة طبية", width - 48, 108);

  roundRectPath(ctx, 36, 180, width - 72, 720 + extraLines * 46, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(17, 17, 17, 0.1)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const invoiceNumber = visit.invoiceNumber || buildInvoiceNumber(appt);

  ctx.textAlign = "right";
  ctx.fillStyle = ink;
  ctx.font = "700 26px IBM Plex Sans Arabic, Arial, sans-serif";
  ctx.fillText("بيانات الفاتورة", width - 64, 230);

  ctx.font = "500 20px IBM Plex Sans Arabic, Arial, sans-serif";
  const metaLines = [
    [`رقم الفاتورة`, invoiceNumber],
    [`اسم المريض`, appt.patientName || "—"],
    [`الموبايل`, appt.phone || "—"],
    [`تاريخ الزيارة`, formatDateLabel(appt.visitDate)],
    [`الساعة`, formatTime(appt.visitTime)],
  ];
  let y = 280;
  metaLines.forEach(([label, value]) => {
    ctx.fillStyle = muted;
    ctx.fillText(label, width - 64, y);
    ctx.fillStyle = ink;
    ctx.font = "600 20px IBM Plex Sans Arabic, Arial, sans-serif";
    ctx.fillText(String(value), width - 250, y);
    ctx.font = "500 20px IBM Plex Sans Arabic, Arial, sans-serif";
    y += 42;
  });

  y += 20;
  ctx.strokeStyle = "rgba(201, 162, 39, 0.45)";
  ctx.beginPath();
  ctx.moveTo(64, y);
  ctx.lineTo(width - 64, y);
  ctx.stroke();

  y += 50;
  ctx.fillStyle = gold;
  ctx.font = "700 22px IBM Plex Sans Arabic, Arial, sans-serif";
  ctx.fillText("البند", width - 64, y);
  ctx.fillText("المبلغ", 160, y);

  lineItems.forEach((item) => {
    y += 46;
    ctx.fillStyle = ink;
    ctx.font = "600 22px IBM Plex Sans Arabic, Arial, sans-serif";
    const name = String(item.name || "بند").slice(0, 42);
    ctx.fillText(name, width - 64, y);
    ctx.fillText(`${item.amount} ج.م`, 160, y);
  });

  y += 50;
  ctx.strokeStyle = "rgba(17, 17, 17, 0.12)";
  ctx.beginPath();
  ctx.moveTo(64, y);
  ctx.lineTo(width - 64, y);
  ctx.stroke();

  y += 55;
  ctx.font = "700 28px IBM Plex Sans Arabic, Arial, sans-serif";
  ctx.fillStyle = ink;
  ctx.fillText("الإجمالي", width - 64, y);
  ctx.fillStyle = gold;
  ctx.fillText(`${total} ج.م`, 180, y);

  y += 50;
  ctx.font = "600 22px IBM Plex Sans Arabic, Arial, sans-serif";
  ctx.fillStyle = muted;
  ctx.fillText("المدفوع", width - 64, y);
  ctx.fillStyle = ink;
  ctx.fillText(`${paid} ج.م`, 180, y);

  y += 42;
  ctx.fillStyle = muted;
  ctx.fillText("المتبقي", width - 64, y);
  ctx.fillStyle = ink;
  ctx.fillText(`${remain} ج.م`, 180, y);

  y += 60;
  roundRectPath(ctx, 64, y - 34, width - 128, 56, 12);
  if (payStatus === "paid") ctx.fillStyle = "rgba(201, 162, 39, 0.16)";
  else if (payStatus === "partial") ctx.fillStyle = "rgba(201, 162, 39, 0.1)";
  else ctx.fillStyle = "rgba(196, 92, 92, 0.12)";
  ctx.fill();
  ctx.fillStyle =
    payStatus === "paid" ? ink : payStatus === "partial" ? "#7a6210" : "#b45353";
  ctx.font = "700 22px IBM Plex Sans Arabic, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(paymentStatusLabel(payStatus), width / 2, y);

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = "500 16px IBM Plex Sans Arabic, Arial, sans-serif";
  ctx.fillText("شكراً لثقتكم في Dentist On Call", width / 2, height - 48);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("invoice blob failed"));
    }, "image/png");
  });
}

function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function invoiceShareText(appt) {
  const visit = appt.visit || {};
  const items = visitLineItems(visit, appt);
  const total = visitInvoiceTotalEgp(visit, appt);
  const remain = remainingBalance(total, visit.paidEgp);
  const lines = [
    `فاتورة ${INVOICE_BRAND}`,
    `رقم: ${visit.invoiceNumber || buildInvoiceNumber(appt)}`,
    `المريض: ${appt.patientName || "—"}`,
  ];
  items.forEach((item) => {
    lines.push(`${item.name}: ${item.amountEgp} ج.م`);
  });
  lines.push(`الإجمالي: ${total} ج.م`);
  if (remain > 0) lines.push(`المتبقي: ${remain} ج.م`);
  else lines.push("الحالة: مدفوع بالكامل");
  return lines.join("\n");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function shareInvoiceForAppointment(appt, { nested = false } = {}) {
  if (!appt?.visit) {
    showToast("لا توجد فاتورة لهذه الزيارة");
    return;
  }
  await withBusy(
    shareInvoiceBtn,
    async () => {
      const canvas = await renderInvoiceCanvas(appt);
      const blob = await canvasToBlob(canvas);
      const filename = `${appt.visit.invoiceNumber || "invoice"}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      const text = invoiceShareText(appt);

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `فاتورة ${INVOICE_BRAND}`,
            text,
          });
          showToast("تم فتح المشاركة — ابعت الفاتورة للمريض");
        } catch (shareErr) {
          if (shareErr?.name !== "AbortError") throw shareErr;
        }
        return;
      }

      downloadBlob(blob, filename);
      const waPhone = normalizeWhatsAppPhone(appt.phone);
      if (waPhone) {
        window.open(
          `https://wa.me/${waPhone}?text=${encodeURIComponent(`${text}\n\n(صورة الفاتورة اتحمّلت على الجهاز — ارفقها من المعرض)`)}`,
          "_blank",
          "noopener"
        );
        showToast("اتحمّلت صورة الفاتورة — وارفقها من واتساب");
      } else {
        showToast("اتحمّلت صورة الفاتورة على الجهاز");
      }
    },
    { loadingText: "جاري التحضير...", nested }
  );
}

async function shareCurrentInvoice() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || normalizeStatus(appt) !== "completed") return;
  try {
    await shareInvoiceForAppointment(appt);
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.error(err);
    showToast("تعذر مشاركة الفاتورة");
  }
}

function buildMainSitePayload(appt) {
  const visit = appt.visit || {};
  const completedAt = visit.completedAt || appt.updatedAt || new Date().toISOString();
  return {
    external_source: DOC_SYNC.externalSource,
    external_id: appt.id,
    completed_at: completedAt,
    patient: {
      full_name: appt.patientName || "مريض",
      phone: appt.phone || "",
      city: appt.city || null,
      notes: appt.details || null,
      address: null,
      gender: "Male",
    },
    doctor: {
      display_name: null,
      doctor_code: null,
    },
    appointment: {
      date: appt.visitDate,
      time: (appt.visitTime || "12:00").slice(0, 5),
      duration_minutes: 30,
      location: "Home visit",
      reason: visit.serviceName || appt.service || "كشف منزلي",
    },
    visit: {
      service_name: visit.serviceName || appt.service || "كشف منزلي",
      cost_egp: visitInvoiceTotalEgp(visit, appt),
      paid_egp: Number(visit.paidEgp) || 0,
      case_cost_egp: visitCaseCostEgpOf(visit),
      case_cost_note: String(visit.caseCostNote || "").trim() || null,
      procedures: visitLineItems(visit, appt).map((item) => ({
        name: item.name,
        cost_egp: item.amountEgp,
      })),
      clinical_notes: visit.clinicalNotes || appt.details || null,
      chief_complaint: visit.clinicalNotes || null,
      diagnosis: visit.clinicalNotes || null,
      doctor_notes: null,
    },
  };
}

async function syncAppointmentToMainSite(appt) {
  if (!appt?.id || !appt.phone) {
    throw new Error("بيانات المريض غير مكتملة للمزامنة");
  }
  if (!appt.visitDate || !appt.visitTime) {
    throw new Error("تاريخ/ساعة الزيارة ناقصة");
  }
  const hasItems =
    (Array.isArray(appt.visit?.lineItems) && appt.visit.lineItems.length > 0) ||
    appt.visit?.serviceName;
  if (!hasItems) {
    throw new Error("خدمة الزيارة ناقصة");
  }

  const response = await fetch(`${DOC_SYNC.apiBase}/integrations/doctor-visits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Integration-Key": DOC_SYNC.integrationKey,
    },
    body: JSON.stringify(buildMainSitePayload(appt)),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail = body?.detail
      ? typeof body.detail === "string"
        ? body.detail
        : JSON.stringify(body.detail)
      : `HTTP ${response.status}`;
    throw new Error(detail);
  }

  const syncedAt = new Date().toISOString();
  await setDoc(
    doc(db, APPOINTMENTS, appt.id),
    {
      syncStatus: "synced",
      syncError: "",
      syncedAt,
      mainSite: {
        visitId: body?.visitId || null,
        appointmentId: body?.appointmentId || null,
        patientCode: body?.patientCode || null,
        patientCreated: Boolean(body?.patientCreated),
        created: Boolean(body?.created),
      },
      updatedAt: syncedAt,
    },
    { merge: true }
  );

  return body;
}

async function markSyncFailed(apptId, errorMessage) {
  await setDoc(
    doc(db, APPOINTMENTS, apptId),
    {
      syncStatus: "failed",
      syncError: String(errorMessage || "unknown").slice(0, 500),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

async function saveAppointmentEdits() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt) return;
  const status = normalizeStatus(appt);
  if (status === "cancelled" || status === "completed") return;

  const visitDate = editVisitDate.value;
  const visitTime = editVisitTime.value;
  if (!visitDate || !visitTime) {
    showToast("حدد التاريخ والساعة");
    return;
  }

  const updatedAt = new Date().toISOString();
  const details = editDetails.value.trim();

  await withBusy(
    saveApptBtn,
    async () => {
      try {
        await setDoc(
          doc(db, APPOINTMENTS, id),
          {
            visitDate,
            visitTime,
            details,
            updatedAt,
          },
          { merge: true }
        );
        await syncLeadFromAppointment(appt, {
          visitDate,
          visitTime,
          booked: "yes",
          details: details || appt.details || "",
        });
        apptDialog.close();
        showToast("تم تحديث الموعد");
      } catch (err) {
        console.error(err);
        showToast("فشل حفظ التعديل");
      }
    },
    { loadingText: "جاري الحفظ..." }
  );
}

async function confirmAppointment() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || normalizeStatus(appt) !== "awaiting_doctor") return;

  const visitDate = editVisitDate.value || appt.visitDate;
  const visitTime = editVisitTime.value || appt.visitTime;
  if (!visitDate || !visitTime) {
    showToast("حدد التاريخ والساعة قبل التأكيد");
    return;
  }

  const updatedAt = new Date().toISOString();
  await withBusy(
    confirmApptBtn,
    async () => {
      try {
        await setDoc(
          doc(db, APPOINTMENTS, id),
          {
            visitDate,
            visitTime,
            details: editDetails.value.trim(),
            status: "confirmed",
            doctorConfirmedAt: updatedAt,
            updatedAt,
          },
          { merge: true }
        );
        await syncLeadFromAppointment(appt, {
          visitDate,
          visitTime,
          booked: "yes",
          doctorStatus: "confirmed",
        });
        apptDialog.close();
        showToast("تم تأكيد الموعد");
        notifyDoctor("تم تأكيد موعد", `${appt.patientName || "مريض"} — ${formatDateLabel(visitDate)}`);
      } catch (err) {
        console.error(err);
        showToast("فشل تأكيد الموعد");
      }
    },
    { loadingText: "جاري التأكيد..." }
  );
}

async function completeVisit() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || normalizeStatus(appt) !== "confirmed") return;

  const fields = readInvoiceFields();
  if (!fields) return;
  const {
    lineItems,
    serviceName,
    costEgp,
    caseCostEgp,
    caseCostNote,
    clinicalNotes,
  } = fields;
  const paidEgp = 0;

  const wantsFollowUp = getFollowUpBooked();
  let followUpDate = "";
  let followUpTime = "";
  let followUpNote = "";
  if (wantsFollowUp) {
    followUpDate = followUpVisitDate?.value || "";
    followUpTime = followUpVisitTime?.value || "";
    followUpNote = followUpDetails?.value.trim() || "";
    if (!followUpDate || !followUpTime) {
      showToast("حدد تاريخ وساعة الموعد الإضافي");
      followUpVisitDate?.focus();
      return;
    }
  }

  const updatedAt = new Date().toISOString();
  const invoiceNumber = buildInvoiceNumber({
    ...appt,
    visitDate: editVisitDate.value || appt.visitDate,
  });
  await withBusy(
    completeVisitBtn,
    async () => {
      try {
        const visitPayload = {
          serviceName,
          lineItems,
          costEgp,
          caseCostEgp,
          caseCostNote: caseCostNote || null,
          paidEgp,
          clinicalNotes,
          completedAt: updatedAt,
          completedBy: "doctor",
          invoiceIssuedAt: updatedAt,
          invoiceNumber,
          paymentStatus: "unpaid",
        };
        await setDoc(
          doc(db, APPOINTMENTS, id),
          {
            status: "completed",
            visit: visitPayload,
            syncStatus: "pending",
            syncError: "",
            updatedAt,
          },
          { merge: true }
        );
        await syncLeadFromAppointment(appt, {
          booked: "yes",
          doctorStatus: "completed",
          visitServiceName: serviceName,
          visitCostEgp: costEgp,
          visitCaseCostEgp: caseCostEgp,
          visitPaidEgp: paidEgp,
        });

        let followUpCreated = false;
        if (wantsFollowUp) {
          await createFollowUpAppointment(appt, {
            visitDate: followUpDate,
            visitTime: followUpTime,
            details: followUpNote,
          });
          followUpCreated = true;
        }

        const fresh = {
          ...appt,
          status: "completed",
          visit: visitPayload,
          details: editDetails.value.trim() || appt.details,
          visitDate: editVisitDate.value || appt.visitDate,
          visitTime: editVisitTime.value || appt.visitTime,
        };

        try {
          const result = await syncAppointmentToMainSite(fresh);
          const code = result?.patientCode ? ` · ${result.patientCode}` : "";
          const followMsg = followUpCreated
            ? ` · ومتابعة ${formatDateLabel(followUpDate)}`
            : "";
          showToast(`تم إصدار الفاتورة ومزامنتها${code}${followMsg}`);
          notifyDoctor(
            followUpCreated ? "فاتورة + متابعة" : "فاتورة جاهزة للمشاركة",
            `${appt.patientName || "مريض"} · ${serviceName} · ${costEgp} ج`
          );
          openDialog({ ...fresh, syncStatus: "synced", mainSite: {
            ...(appt.mainSite || {}),
            patientCode: result?.patientCode || appt.mainSite?.patientCode || null,
          }});
          try {
            await shareInvoiceForAppointment(fresh, { nested: true });
          } catch (shareErr) {
            console.warn(shareErr);
          }
        } catch (syncErr) {
          console.error(syncErr);
          await markSyncFailed(id, syncErr.message || syncErr);
          const followMsg = followUpCreated ? " وحجز المتابعة اتعمل" : "";
          showToast(
            `الفاتورة اتسجّلت محليًا${followMsg} لكن المزامنة فشلت — تقدر تشاركها وتعدّل الدفع`
          );
          openDialog({ ...fresh, syncStatus: "failed", syncError: String(syncErr.message || syncErr) });
        }
      } catch (err) {
        console.error(err);
        showToast("فشل إصدار الفاتورة");
      }
    },
    { loadingText: "جاري الإصدار..." }
  );
}

async function saveCompletedVisitEdit() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || normalizeStatus(appt) !== "completed") return;

  const fields = readInvoiceFields();
  if (!fields) return;
  const {
    lineItems,
    serviceName,
    costEgp,
    caseCostEgp,
    caseCostNote,
    clinicalNotes,
  } = fields;
  const paidEgp = Number(appt.visit?.paidEgp) || 0;
  if (paidEgp > costEgp) {
    showToast("الإجمالي أقل من المدفوع المسجّل — عدّل الدفعة أولاً أو زوّد البنود");
    invoiceItemsList?.querySelector(".item-amount")?.focus();
    return;
  }

  const updatedAt = new Date().toISOString();
  await withBusy(
    saveVisitEditBtn,
    async () => {
      try {
        const visitPayload = {
          ...(appt.visit || {}),
          serviceName,
          lineItems,
          costEgp,
          caseCostEgp,
          caseCostNote: caseCostNote || null,
          paidEgp,
          clinicalNotes,
          invoiceNumber: appt.visit?.invoiceNumber || buildInvoiceNumber(appt),
          invoiceIssuedAt: appt.visit?.invoiceIssuedAt || updatedAt,
          paymentStatus: computePaymentStatus(costEgp, paidEgp),
          updatedAt,
          updatedBy: "doctor",
        };
        await setDoc(
          doc(db, APPOINTMENTS, id),
          {
            visit: visitPayload,
            syncStatus: "pending",
            syncError: "",
            updatedAt,
          },
          { merge: true }
        );
        await syncLeadFromAppointment(appt, {
          doctorStatus: "completed",
          visitServiceName: serviceName,
          visitCostEgp: costEgp,
          visitCaseCostEgp: caseCostEgp,
          visitPaidEgp: paidEgp,
        });

        const fresh = {
          ...appt,
          status: "completed",
          visit: visitPayload,
        };

        try {
          const result = await syncAppointmentToMainSite(fresh);
          const code = result?.patientCode ? ` · ${result.patientCode}` : "";
          showToast(`تم تعديل الفاتورة ومزامنتها${code}`);
          openDialog({
            ...fresh,
            syncStatus: "synced",
            mainSite: {
              ...(appt.mainSite || {}),
              patientCode: result?.patientCode || appt.mainSite?.patientCode || null,
            },
          });
        } catch (syncErr) {
          console.error(syncErr);
          await markSyncFailed(id, syncErr.message || syncErr);
          showToast("التعديل اتحفظ محليًا لكن المزامنة فشلت — أعد المحاولة");
          openDialog({ ...fresh, syncStatus: "failed", syncError: String(syncErr.message || syncErr) });
        }
      } catch (err) {
        console.error(err);
        showToast("فشل حفظ تعديل الفاتورة");
      }
    },
    { loadingText: "جاري الحفظ..." }
  );
}

async function savePayment() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || normalizeStatus(appt) !== "completed") return;

  const costEgp = visitInvoiceTotalEgp(appt.visit, appt);
  const paidEgp = readPaymentAmount(costEgp);
  if (paidEgp == null) return;

  const updatedAt = new Date().toISOString();
  await withBusy(
    savePaymentBtn,
    async () => {
      try {
        const visitPayload = {
          ...(appt.visit || {}),
          paidEgp,
          paymentStatus: computePaymentStatus(costEgp, paidEgp),
          paymentUpdatedAt: updatedAt,
          updatedAt,
          updatedBy: "doctor",
        };
        await setDoc(
          doc(db, APPOINTMENTS, id),
          {
            visit: visitPayload,
            syncStatus: "pending",
            syncError: "",
            updatedAt,
          },
          { merge: true }
        );
        await syncLeadFromAppointment(appt, {
          doctorStatus: "completed",
          visitPaidEgp: paidEgp,
          visitCostEgp: costEgp,
        });

        const fresh = { ...appt, status: "completed", visit: visitPayload };
        try {
          await syncAppointmentToMainSite(fresh);
          showToast(
            visitPayload.paymentStatus === "paid"
              ? "تم تسجيل السداد بالكامل"
              : `تم تسجيل دفعة ${paidEgp} ج · متبقي ${remainingBalance(costEgp, paidEgp)} ج`
          );
          openDialog({ ...fresh, syncStatus: "synced" });
        } catch (syncErr) {
          console.error(syncErr);
          await markSyncFailed(id, syncErr.message || syncErr);
          showToast("الدفعة اتحفظت محليًا لكن المزامنة فشلت");
          openDialog({ ...fresh, syncStatus: "failed", syncError: String(syncErr.message || syncErr) });
        }
      } catch (err) {
        console.error(err);
        showToast("فشل حفظ الدفعة");
      }
    },
    { loadingText: "جاري الحفظ..." }
  );
}

async function retryMainSiteSync() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || normalizeStatus(appt) !== "completed") return;

  syncStatusLine.textContent = "جاري المزامنة...";
  syncStatusLine.className = "sync-line is-pending";
  await withBusy(
    retrySyncBtn,
    async () => {
      try {
        const result = await syncAppointmentToMainSite(appt);
        const code = result?.patientCode ? ` · ${result.patientCode}` : "";
        showToast(`تمت المزامنة مع الموقع الرئيسي${code}`);
        apptDialog.close();
      } catch (err) {
        console.error(err);
        await markSyncFailed(id, err.message || err);
        showToast(`فشلت المزامنة: ${err.message || err}`);
      }
    },
    { loadingText: "جاري المزامنة..." }
  );
}

async function cancelAppointment() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt) return;
  const status = normalizeStatus(appt);
  if (status === "cancelled" || status === "completed") return;

  const ok = confirm(`إلغاء موعد ${appt.patientName || "المريض"}؟`);
  if (!ok) return;

  const updatedAt = new Date().toISOString();
  await withBusy(
    cancelApptBtn,
    async () => {
      try {
        await setDoc(
          doc(db, APPOINTMENTS, id),
          {
            status: "cancelled",
            updatedAt,
            cancelledAt: updatedAt,
            cancelledBy: "doctor",
          },
          { merge: true }
        );
        await syncLeadFromAppointment(appt, {
          booked: "no",
          visitDate: "",
          visitTime: "",
          doctorStatus: "cancelled",
        });
        apptDialog.close();
        showToast("تم إلغاء الموعد");
        notifyDoctor("تم إلغاء موعد", `${appt.patientName || "مريض"} — ${formatDateLabel(appt.visitDate)}`);
      } catch (err) {
        console.error(err);
        showToast("فشل إلغاء الموعد");
      }
    },
    { loadingText: "جاري الإلغاء..." }
  );
}

function canNotify() {
  return "Notification" in window && Notification.permission === "granted";
}

function notificationIconUrl() {
  return new URL(`${import.meta.env.BASE_URL}icons/icon-192.png`, window.location.origin).href;
}

function notificationBadgeUrl() {
  return new URL(`${import.meta.env.BASE_URL}icons/apple-touch-icon.png`, window.location.origin).href;
}

async function getSwRegistration() {
  if (window.__doctorSwRegistration) return window.__doctorSwRegistration;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    return ready || navigator.serviceWorker.getRegistration();
  } catch {
    return null;
  }
}

async function notifyDoctor(title, body, options = {}) {
  if (!canNotify()) return false;

  const payload = {
    body,
    icon: notificationIconUrl(),
    badge: notificationBadgeUrl(),
    lang: "ar",
    dir: "rtl",
    tag: options.tag || `doctor-${title}`.slice(0, 64),
    renotify: Boolean(options.renotify),
    requireInteraction: Boolean(options.requireInteraction),
    data: {
      url: new URL(`${import.meta.env.BASE_URL}doctor/`, window.location.origin).href,
      ...options.data,
    },
  };

  try {
    const reg = await getSwRegistration();
    if (reg && typeof reg.showNotification === "function") {
      await reg.showNotification(title, payload);
      return true;
    }
    const n = new Notification(title, payload);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch (err) {
    console.warn("notification failed", err);
    try {
      new Notification(title, payload);
      return true;
    } catch (fallbackErr) {
      console.warn(fallbackErr);
      return false;
    }
  }
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    showToast(
      isIosDevice()
        ? "على الآيفون: ثبّت التطبيق من Safari أولًا ثم فعّل الإشعارات من جواه"
        : "المتصفح لا يدعم الإشعارات"
    );
    return false;
  }

  if (isIosDevice() && !isStandaloneApp()) {
    showToast("ثبّت التطبيق على الشاشة الرئيسية من Safari ثم افتحه وفعّل الإشعارات");
    installSheet?.showModal();
    return false;
  }

  if (Notification.permission === "granted") {
    notifyBtn.textContent = "الإشعارات مفعّلة";
    const ok = await notifyDoctor(
      "مواعيد الطبيب",
      "الإشعارات شغالة — هتوصلك تنبيه عند حجز جديد أو موعد قريب",
      { tag: "doctor-test", renotify: true }
    );
    showToast(ok ? "تم إرسال إشعار تجريبي — لو ظهر يبقى الإشعارات تمام" : "الصلاحية موجودة لكن الإشعار اتفشل");
    return ok;
  }

  if (Notification.permission === "denied") {
    showToast("الإشعارات مرفوضة — افتح إعدادات الآيفون/التطبيق واسمح بالإشعارات");
    return false;
  }

  const result = await Notification.requestPermission();
  updateNotifyButton();
  if (result === "granted") {
    const ok = await notifyDoctor(
      "مواعيد الطبيب",
      "تم تفعيل الإشعارات بنجاح",
      { tag: "doctor-enabled", renotify: true }
    );
    showToast(ok ? "تم تفعيل الإشعارات وإرسال تجربة" : "تم التفعيل لكن الإشعار التجريبي اتفشل");
    return ok;
  }

  showToast("لم يتم تفعيل الإشعارات");
  return false;
}

function updateNotifyButton() {
  if (!("Notification" in window)) {
    if (isIosDevice() && !isStandaloneApp()) {
      notifyBtn.hidden = false;
      notifyBtn.textContent = "تفعيل الإشعارات";
      return;
    }
    notifyBtn.hidden = true;
    return;
  }
  notifyBtn.hidden = false;
  if (Notification.permission === "granted") {
    notifyBtn.textContent = "تجربة إشعار";
  } else {
    notifyBtn.textContent = "تفعيل الإشعارات";
  }
}

function isIosDevice() {
  const ua = navigator.userAgent || "";
  const iOS = /iphone|ipad|ipod/i.test(ua);
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

function isStandaloneApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

async function isDoctorPwaInstalled() {
  if (!("getInstalledRelatedApps" in navigator)) return null;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some(
      (app) =>
        (app.url && /doctor\.webmanifest/i.test(app.url)) ||
        (app.id && /\/doctor\/?/i.test(app.id))
    );
  } catch {
    return null;
  }
}

function updateInstallButton() {
  if (!installBtn) return;
  installBtn.hidden = false;
  installBtn.textContent = isIosDevice() ? "تثبيت على الآيفون" : "تثبيت التطبيق";

  // Hide only when this doctor app is confirmed installed (or launched as itself).
  isDoctorPwaInstalled().then((installed) => {
    if (!installBtn) return;
    if (installed === true) {
      installBtn.hidden = true;
      return;
    }
    // Fallback: standalone on /doctor/ without a pending install prompt usually means doctor is installed.
    // If the old call-center scope swallowed /doctor/, beforeinstallprompt stays absent AND
    // getInstalledRelatedApps returns false — keep the button so we can guide the user.
    if (installed === null && isStandaloneApp() && !deferredInstallPrompt) {
      installBtn.hidden = true;
    }
  });
}

async function handleInstallClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice?.outcome === "accepted") {
      installBtn.hidden = true;
      showToast("تم تثبيت مواعيد الطبيب");
    }
    return;
  }

  const doctorInstalled = await isDoctorPwaInstalled();
  if (doctorInstalled === true) {
    showToast("مواعيد الطبيب مثبتة بالفعل");
    return;
  }

  if (isStandaloneApp() && doctorInstalled !== true) {
    showToast(
      "احذف تطبيق الكول سنتر القديم، افتح رابط الطبيب من المتصفح، ثم ثبّته لوحده"
    );
    return;
  }

  if (isIosDevice()) {
    installSheet?.showModal();
    return;
  }

  showToast("من قائمة المتصفح اختَر تثبيت التطبيق / Install app");
}

function handleNewAndTodayNotifications(list) {
  const active = list.filter(isActive);
  const ids = new Set(active.map((a) => a.id));

  if (!initialSnapshot) {
    active.forEach((appt) => {
      if (!knownIds.has(appt.id)) {
        notifyDoctor(
          "حجز جديد بانتظار تأكيدك",
          `${appt.patientName || "مريض"} — ${formatDateLabel(appt.visitDate)} الساعة ${formatTime(appt.visitTime)}`
        );
        showToast(`حجز جديد: ${appt.patientName || "مريض"}`);
      }
    });
  }

  knownIds = ids;
  saveKnownIds();

  const todayCount = active.filter((a) => a.visitDate === todayISO()).length;
  const stamp = todayISO();
  if (todayCount > 0 && localStorage.getItem(NOTIFY_TODAY_KEY) !== stamp) {
    localStorage.setItem(NOTIFY_TODAY_KEY, stamp);
    notifyDoctor("مواعيد النهاردة", `عندك ${todayCount} موعد اليوم`);
  }

  initialSnapshot = false;
}

function bindUi() {
  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    if (viewMode === "day") {
      const d = parseISODate(selectedDate) || new Date();
      d.setDate(d.getDate() - 1);
      selectedDate = toISODate(d);
      cursor = startOfMonth(d);
    } else if (viewMode === "week") {
      const d = parseISODate(selectedDate) || new Date();
      d.setDate(d.getDate() - 7);
      selectedDate = toISODate(d);
      cursor = startOfMonth(d);
    } else {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    }
    renderAll();
  });

  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    if (viewMode === "day") {
      const d = parseISODate(selectedDate) || new Date();
      d.setDate(d.getDate() + 1);
      selectedDate = toISODate(d);
      cursor = startOfMonth(d);
    } else if (viewMode === "week") {
      const d = parseISODate(selectedDate) || new Date();
      d.setDate(d.getDate() + 7);
      selectedDate = toISODate(d);
      cursor = startOfMonth(d);
    } else {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    renderAll();
  });

  document.querySelectorAll(".view-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      viewMode = tab.dataset.view;
      document.querySelectorAll(".view-tabs .tab").forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      renderAll();
    });
  });

  hideCancelled.addEventListener("change", renderAll);
  jumpTodayBtn.addEventListener("click", () => {
    selectedDate = todayISO();
    cursor = startOfMonth(new Date());
    viewMode = "day";
    document.querySelectorAll(".view-tabs .tab").forEach((t) => {
      const active = t.dataset.view === "day";
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderAll();
  });

  notifyBtn.addEventListener("click", async () => {
    await withBusy(notifyBtn, () => requestNotifications());
    updateNotifyButton();
  });

  if (installBtn) {
    installBtn.addEventListener("click", () => {
      handleInstallClick();
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (installBtn) installBtn.hidden = true;
    showToast("تم تثبيت مواعيد الطبيب");
  });

  saveApptBtn.addEventListener("click", () => {
    saveAppointmentEdits();
  });

  confirmApptBtn.addEventListener("click", () => {
    confirmAppointment();
  });

  completeVisitBtn.addEventListener("click", () => {
    completeVisit();
  });

  if (saveVisitEditBtn) {
    saveVisitEditBtn.addEventListener("click", () => {
      saveCompletedVisitEdit();
    });
  }

  if (savePaymentBtn) {
    savePaymentBtn.addEventListener("click", () => {
      savePayment();
    });
  }

  if (shareInvoiceBtn) {
    shareInvoiceBtn.addEventListener("click", () => {
      shareCurrentInvoice();
    });
  }

  if (addInvoiceItemBtn) {
    addInvoiceItemBtn.addEventListener("click", () => {
      const items = readInvoiceItemRows();
      items.push({ name: "", amountEgp: 0 });
      renderInvoiceItemRows(items);
      invoiceItemsList?.querySelector(".invoice-item-row:last-child .item-name")?.focus();
    });
  }

  if (invoiceItemsList) {
    invoiceItemsList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove]");
      if (!btn) return;
      const items = readInvoiceItemRows();
      if (items.length <= 1) return;
      const index = Number(btn.getAttribute("data-remove"));
      items.splice(index, 1);
      renderInvoiceItemRows(items);
    });
    invoiceItemsList.addEventListener("input", () => {
      updateDoctorTotalsPreview();
    });
  }

  visitCaseCostEgp?.addEventListener("input", updateDoctorTotalsPreview);

  retrySyncBtn.addEventListener("click", () => {
    retryMainSiteSync();
  });

  cancelApptBtn.addEventListener("click", () => {
    cancelAppointment();
  });

  document.querySelectorAll('input[name="followUpBooked"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      setFollowUpBooked(getFollowUpBooked() ? "yes" : "no");
    });
  });

  if (doctorSearchInput) {
    doctorSearchInput.addEventListener("input", () => {
      renderSearchResults();
    });
  }
}

function startListening() {
  setSync("loading", "جاري تحميل المواعيد...");
  onSnapshot(
    collection(db, APPOINTMENTS),
    (snap) => {
      appointments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSync("ready", `متصل — ${appointments.length} موعد في السجل`);
      handleNewAndTodayNotifications(appointments);
      renderAll();
    },
    (err) => {
      console.error(err);
      setSync("error", "فشل الاتصال — تأكد من قواعد Firestore لـ appointments");
      showToast("تعذر تحميل المواعيد");
    }
  );
}

function minutesUntil(visitDate, visitTime) {
  if (!visitDate || !visitTime) return null;
  const [h, m] = String(visitTime).split(":").map(Number);
  const target = parseISODate(visitDate);
  if (!target || Number.isNaN(h) || Number.isNaN(m)) return null;
  target.setHours(h, m, 0, 0);
  return Math.round((target.getTime() - Date.now()) / 60000);
}

function checkUpcomingReminders() {
  if (!canNotify()) return;
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(UPCOMING_KEY) || "{}") || {};
  } catch {
    map = {};
  }

  forDate(todayISO())
    .filter((a) => {
      const s = normalizeStatus(a);
      return s === "confirmed" || s === "awaiting_doctor";
    })
    .forEach((appt) => {
      const mins = minutesUntil(appt.visitDate, appt.visitTime);
      if (mins == null || mins < 0 || mins > 30) return;
      if (map[appt.id] === todayISO()) return;
      map[appt.id] = todayISO();
      notifyDoctor(
        "موعد قريب",
        `${appt.patientName || "مريض"} خلال ${mins === 0 ? "دقائق" : `${mins} دقيقة`}`
      );
    });

  localStorage.setItem(UPCOMING_KEY, JSON.stringify(map));
}

updateNotifyButton();
updateInstallButton();
bindUi();
startListening();
renderAll();
setInterval(checkUpcomingReminders, 60_000);
setTimeout(checkUpcomingReminders, 4000);
