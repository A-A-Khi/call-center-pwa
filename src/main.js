import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "./firebase.js";

const AGENT_KEY = "callcenter_last_agent";
const COLLECTION = "leads";
const APPOINTMENTS = "appointments";
const PRIORITY_WEIGHT = { urgent: 3, high: 2, normal: 1 };

const form = document.getElementById("leadForm");
const leadId = document.getElementById("leadId");
const customerName = document.getElementById("customerName");
const phone = document.getElementById("phone");
const phoneHint = document.getElementById("phoneHint");
const followUpDate = document.getElementById("followUpDate");
const lastContactDate = document.getElementById("lastContactDate");
const preferredTime = document.getElementById("preferredTime");
const visitBookingPanel = document.getElementById("visitBookingPanel");
const visitDate = document.getElementById("visitDate");
const visitTime = document.getElementById("visitTime");
const service = document.getElementById("service");
const city = document.getElementById("city");
const source = document.getElementById("source");
const callStatus = document.getElementById("callStatus");
const priority = document.getElementById("priority");
const agentName = document.getElementById("agentName");
const details = document.getElementById("details");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const searchInput = document.getElementById("searchInput");
const interestFilter = document.getElementById("interestFilter");
const bookedFilter = document.getElementById("bookedFilter");
const contactedFilter = document.getElementById("contactedFilter");
const statusFilter = document.getElementById("statusFilter");
const priorityFilter = document.getElementById("priorityFilter");
const sourceFilter = document.getElementById("sourceFilter");
const agentFilter = document.getElementById("agentFilter");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const createdFrom = document.getElementById("createdFrom");
const createdTo = document.getElementById("createdTo");
const sortBy = document.getElementById("sortBy");
const exportScope = document.getElementById("exportScope");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const filtersToggle = document.getElementById("filtersToggle");
const filtersPanel = document.getElementById("filtersPanel");
const filtersBadge = document.getElementById("filtersBadge");
const quickFilters = document.getElementById("quickFilters");
const resultCount = document.getElementById("resultCount");
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
const mobileNav = document.getElementById("mobileNav");
const navListCount = document.getElementById("navListCount");

let leads = [];
let deferredPrompt = null;
let toastTimer = null;
let saving = false;
let activeQuick = "all";

agentName.value = localStorage.getItem(AGENT_KEY) || "";

async function withBusy(button, fn, { loadingText } = {}) {
  if (!button || button.dataset.busy === "1") return;
  const originalText = button.textContent;
  button.dataset.busy = "1";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.classList.add("is-loading");
  if (loadingText) button.textContent = loadingText;
  try {
    return await fn();
  } finally {
    button.dataset.busy = "0";
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.classList.remove("is-loading");
    if (loadingText) button.textContent = originalText;
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function shiftISO(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function yesterdayISO() {
  return shiftISO(-1);
}

function createdDayKey(lead) {
  if (!lead.createdAt) return "unknown";
  const d = new Date(lead.createdAt);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isCreatedToday(lead) {
  return createdDayKey(lead) === todayISO();
}

function isCreatedYesterday(lead) {
  return createdDayKey(lead) === yesterdayISO();
}

function dayGroupLabel(dayKey) {
  if (dayKey === "unknown") return "بدون تاريخ تسجيل";
  if (dayKey === todayISO()) return "اليوم";
  if (dayKey === yesterdayISO()) return "أمس";
  const d = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function dayGroupModifier(dayKey) {
  if (dayKey === todayISO()) return "is-today";
  if (dayKey === yesterdayISO()) return "is-yesterday";
  return "";
}

function formatCreatedAt(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupLeadsByCreatedDay(rows) {
  const map = new Map();
  rows.forEach((lead) => {
    const key = createdDayKey(lead);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(lead);
  });

  return [...map.entries()].sort((a, b) => {
    if (a[0] === "unknown") return 1;
    if (b[0] === "unknown") return -1;
    return b[0].localeCompare(a[0]);
  });
}

function setMobileView(view) {
  document.body.dataset.view = view;
  if (!mobileNav) return;
  mobileNav.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function countActiveFilters() {
  let count = 0;
  if (searchInput.value.trim()) count += 1;
  if (interestFilter.value !== "all") count += 1;
  if (bookedFilter.value !== "all") count += 1;
  if (contactedFilter.value !== "all") count += 1;
  if (statusFilter.value !== "all") count += 1;
  if (priorityFilter.value !== "all") count += 1;
  if (sourceFilter.value !== "all") count += 1;
  if (agentFilter.value !== "all") count += 1;
  if (createdFrom?.value) count += 1;
  if (createdTo?.value) count += 1;
  if (dateFrom.value) count += 1;
  if (dateTo.value) count += 1;
  if (activeQuick !== "all") count += 1;
  return count;
}

function updateFiltersBadge() {
  if (!filtersBadge) return;
  const count = countActiveFilters();
  filtersBadge.hidden = count === 0;
  filtersBadge.textContent = String(count);
}

function setSyncState(state, message) {
  syncBar.dataset.state = state;
  syncText.textContent = message;
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

function contactedLabel(value) {
  return value === "yes" ? "تم التواصل" : "لم يتم";
}

function statusLabel(value) {
  const map = {
    answered: "تم الرد",
    no_answer: "لم يرد",
    busy: "مشغول",
    callback: "أعد الاتصال",
    wrong_number: "رقم خطأ",
  };
  return map[value] || "تم الرد";
}

function priorityLabel(value) {
  if (value === "urgent") return "عاجل";
  if (value === "high") return "مهم";
  return "عادي";
}

function sourceLabel(value) {
  const map = {
    ads: "إعلان",
    referral: "توصية",
    website: "موقع",
    cold: "اتصال بارد",
    other: "أخرى",
  };
  return map[value] || "—";
}

function badgeClass(value) {
  if (value === "yes" || value === "answered") return "badge-yes";
  if (value === "maybe" || value === "callback" || value === "high") return "badge-maybe";
  if (value === "urgent") return "badge-urgent";
  if (value === "no_answer" || value === "busy" || value === "wrong_number") return "badge-no";
  return "badge-no";
}

function formatDate(value) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function formatTime(value) {
  if (!value) return "";
  const [h, m] = String(value).split(":");
  if (h == null || m == null) return value;
  return `${h}:${m}`;
}

function formatVisitSlot(lead) {
  if (lead.booked !== "yes" || !lead.visitDate) return "";
  const datePart = formatDate(lead.visitDate);
  const timePart = formatTime(lead.visitTime);
  return timePart ? `${datePart} · ${timePart}` : datePart;
}

function isVisitToday(lead) {
  return lead.booked === "yes" && lead.visitDate === todayISO();
}

function syncVisitPanel() {
  const booked = getSelected("booked") === "yes";
  if (visitBookingPanel) visitBookingPanel.hidden = !booked;
  if (visitDate) visitDate.required = booked;
  if (visitTime) visitTime.required = booked;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function isOverdue(lead) {
  if (!lead.followUpDate || lead.booked === "yes") return false;
  return lead.followUpDate < todayISO();
}

function isTodayFollowUp(lead) {
  return lead.followUpDate === todayISO();
}

function isHot(lead) {
  return lead.interested === "yes" && lead.booked !== "yes";
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
  setSelected("contacted", "no");
  callStatus.value = "answered";
  priority.value = "normal";
  lastContactDate.value = "";
  if (visitDate) visitDate.value = "";
  if (visitTime) visitTime.value = "";
  agentName.value = agent;
  phoneHint.hidden = true;
  saveBtn.textContent = "حفظ العميل";
  cancelEditBtn.hidden = true;
  syncVisitPanel();
}

function uniqueValues(getter) {
  return [...new Set(leads.map(getter).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "ar")
  );
}

function refreshSuggestions() {
  const fillList = (id, values) => {
    const list = document.getElementById(id);
    list.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
  };
  fillList("serviceSuggestions", uniqueValues((l) => l.service));
  fillList("citySuggestions", uniqueValues((l) => l.city));
  fillList("agentSuggestions", uniqueValues((l) => l.agentName));

  const current = agentFilter.value;
  agentFilter.innerHTML =
    `<option value="all">كل الموظفين</option>` +
    uniqueValues((l) => l.agentName)
      .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
      .join("");
  if ([...agentFilter.options].some((o) => o.value === current)) {
    agentFilter.value = current;
  }
}

function matchesQuick(lead) {
  switch (activeQuick) {
    case "created_today":
      return isCreatedToday(lead);
    case "created_yesterday":
      return isCreatedYesterday(lead);
    case "today":
      return isTodayFollowUp(lead);
    case "overdue":
      return isOverdue(lead);
    case "hot":
      return isHot(lead);
    case "targets":
      return lead.interested === "yes" || lead.interested === "maybe";
    case "callback":
      return lead.callStatus === "callback" || lead.callStatus === "no_answer";
    case "not_contacted":
      return lead.contacted !== "yes";
    case "priority":
      return lead.priority === "high" || lead.priority === "urgent";
    default:
      return true;
  }
}

function getFilteredLeads() {
  const q = searchInput.value.trim().toLowerCase();
  const interest = interestFilter.value;
  const booked = bookedFilter.value;
  const contacted = contactedFilter.value;
  const status = statusFilter.value;
  const prio = priorityFilter.value;
  const src = sourceFilter.value;
  const agent = agentFilter.value;
  const from = dateFrom.value;
  const to = dateTo.value;
  const createdStart = createdFrom?.value || "";
  const createdEnd = createdTo?.value || "";

  let rows = leads.filter((lead) => {
    const hay = [
      lead.customerName,
      lead.phone,
      lead.service,
      lead.city,
      lead.details,
      lead.agentName,
      sourceLabel(lead.source),
      statusLabel(lead.callStatus),
      contactedLabel(lead.contacted),
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery = !q || hay.includes(q);
    const matchesInterest = interest === "all" || lead.interested === interest;
    const matchesBooked = booked === "all" || lead.booked === booked;
    const leadContacted = lead.contacted === "yes" ? "yes" : "no";
    const matchesContacted = contacted === "all" || leadContacted === contacted;
    const matchesStatus = status === "all" || (lead.callStatus || "answered") === status;
    const matchesPriority = prio === "all" || (lead.priority || "normal") === prio;
    const matchesSource = src === "all" || lead.source === src;
    const matchesAgent = agent === "all" || lead.agentName === agent;
    const matchesFrom = !from || (lead.followUpDate && lead.followUpDate >= from);
    const matchesTo = !to || (lead.followUpDate && lead.followUpDate <= to);
    const dayKey = createdDayKey(lead);
    const matchesCreatedFrom =
      !createdStart || (dayKey !== "unknown" && dayKey >= createdStart);
    const matchesCreatedTo =
      !createdEnd || (dayKey !== "unknown" && dayKey <= createdEnd);
    return (
      matchesQuery &&
      matchesInterest &&
      matchesBooked &&
      matchesContacted &&
      matchesStatus &&
      matchesPriority &&
      matchesSource &&
      matchesAgent &&
      matchesFrom &&
      matchesTo &&
      matchesCreatedFrom &&
      matchesCreatedTo &&
      matchesQuick(lead)
    );
  });

  rows = sortLeads(rows);
  return rows;
}

function sortLeads(rows) {
  const mode = sortBy.value;
  const copy = [...rows];
  copy.sort((a, b) => {
    if (mode === "name") {
      return String(a.customerName || "").localeCompare(String(b.customerName || ""), "ar");
    }
    if (mode === "priority") {
      return (PRIORITY_WEIGHT[b.priority] || 1) - (PRIORITY_WEIGHT[a.priority] || 1);
    }
    if (mode === "followup_asc") {
      return String(a.followUpDate || "9999").localeCompare(String(b.followUpDate || "9999"));
    }
    if (mode === "followup_desc") {
      return String(b.followUpDate || "").localeCompare(String(a.followUpDate || ""));
    }
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return copy;
}

function getExportLeads() {
  const scope = exportScope.value;
  if (scope === "all") return sortLeads([...leads]);
  if (scope === "targets") {
    return sortLeads(leads.filter((l) => l.interested === "yes" || l.interested === "maybe"));
  }
  if (scope === "today") return sortLeads(leads.filter(isTodayFollowUp));
  if (scope === "hot") return sortLeads(leads.filter(isHot));
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
  document.getElementById("statToday").textContent = String(leads.filter(isTodayFollowUp).length);
  document.getElementById("statOverdue").textContent = String(leads.filter(isOverdue).length);
  const createdTodayEl = document.getElementById("statCreatedToday");
  if (createdTodayEl) {
    createdTodayEl.textContent = String(leads.filter(isCreatedToday).length);
  }
  if (navListCount) {
    navListCount.textContent = String(leads.length);
  }
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

function buildLeadCard(lead) {
  const overdue = isOverdue(lead);
  const today = isTodayFollowUp(lead);
  const visitToday = isVisitToday(lead);
  const status = lead.callStatus || "answered";
  const prio = lead.priority || "normal";
  const card = document.createElement("article");
  card.className = `lead-card${overdue ? " row-overdue" : ""}${today || visitToday ? " row-today" : ""}`;
  card.innerHTML = `
    <div class="lead-card-top">
      <div>
        <h3>${escapeHtml(lead.customerName)}</h3>
        <a class="phone-link" href="tel:${escapeHtml(lead.phone)}" dir="ltr">${escapeHtml(lead.phone)}</a>
        <p class="lead-card-registered">التسجيل: ${escapeHtml(formatCreatedAt(lead.createdAt))}</p>
      </div>
      <div class="lead-card-badges">
        <span class="badge ${badgeClass(lead.contacted === "yes" ? "yes" : "no")}">${contactedLabel(lead.contacted === "yes" ? "yes" : "no")}</span>
        <span class="badge ${badgeClass(status)}">${statusLabel(status)}</span>
        <span class="badge ${badgeClass(lead.interested)}">${interestLabel(lead.interested)}</span>
        <span class="badge ${badgeClass(prio)}">${priorityLabel(prio)}</span>
      </div>
    </div>
    <dl class="lead-card-meta">
      <div><dt>آخر تواصل</dt><dd>${escapeHtml(formatDate(lead.lastContactDate))}</dd></div>
      <div><dt>المتابعة</dt><dd>${escapeHtml(formatDate(lead.followUpDate))}${today ? " · اليوم" : ""}${overdue ? " · متأخر" : ""}</dd></div>
      <div><dt>موعد الزيارة</dt><dd>${escapeHtml(formatVisitSlot(lead) || "—")}${isVisitToday(lead) ? " · اليوم" : ""}</dd></div>
      <div><dt>المدينة</dt><dd>${escapeHtml(lead.city || "—")}</dd></div>
      <div><dt>الخدمة</dt><dd>${escapeHtml(lead.service || "—")}</dd></div>
      <div><dt>الحجز</dt><dd>${bookedLabel(lead.booked)}</dd></div>
      <div><dt>المصدر</dt><dd>${escapeHtml(sourceLabel(lead.source))}</dd></div>
      <div><dt>الموظف</dt><dd>${escapeHtml(lead.agentName || "—")}</dd></div>
    </dl>
    ${lead.details ? `<p class="lead-card-details">${escapeHtml(lead.details)}</p>` : ""}
    ${actionButtons(lead.id)}
  `;
  return card;
}

function buildLeadRow(lead) {
  const overdue = isOverdue(lead);
  const today = isTodayFollowUp(lead);
  const visitToday = isVisitToday(lead);
  const visitSlot = formatVisitSlot(lead);
  const status = lead.callStatus || "answered";
  const prio = lead.priority || "normal";
  const contacted = lead.contacted === "yes" ? "yes" : "no";
  const tr = document.createElement("tr");
  if (overdue) tr.classList.add("row-overdue");
  if (today || visitToday) tr.classList.add("row-today");
  tr.innerHTML = `
    <td>
      <strong>${escapeHtml(lead.customerName)}</strong>
      ${lead.agentName ? `<div class="muted-note">${escapeHtml(lead.agentName)}</div>` : ""}
      <div class="muted-note">التسجيل: ${escapeHtml(formatCreatedAt(lead.createdAt))}</div>
    </td>
    <td dir="ltr"><a class="phone-link" href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a></td>
    <td><span class="badge ${badgeClass(contacted)}">${contactedLabel(contacted)}</span></td>
    <td>${escapeHtml(formatDate(lead.lastContactDate))}</td>
    <td><span class="badge ${badgeClass(status)}">${statusLabel(status)}</span></td>
    <td><span class="badge ${badgeClass(lead.interested)}">${interestLabel(lead.interested)}</span></td>
    <td>
      <span class="badge ${badgeClass(lead.booked)}">${bookedLabel(lead.booked)}</span>
      ${visitSlot ? `<div class="visit-slot">${escapeHtml(visitSlot)}</div>` : ""}
    </td>
    <td><span class="badge ${badgeClass(prio)}">${priorityLabel(prio)}</span></td>
    <td>
      ${escapeHtml(formatDate(lead.followUpDate))}
      ${today ? '<div class="tag-mini">متابعة اليوم</div>' : ""}
      ${overdue ? '<div class="tag-mini danger">متأخر</div>' : ""}
      ${lead.preferredTime ? `<div class="muted-note">${escapeHtml(lead.preferredTime)}</div>` : ""}
      ${visitSlot ? `<div class="visit-slot">${escapeHtml(visitSlot)}${visitToday ? " · اليوم" : ""}</div>` : ""}
    </td>
    <td>${escapeHtml(lead.city || "—")}</td>
    <td>
      ${escapeHtml(lead.service || "—")}
      ${lead.source ? `<div class="muted-note">${escapeHtml(sourceLabel(lead.source))}</div>` : ""}
    </td>
    <td>${actionButtons(lead.id)}</td>
  `;
  return tr;
}

function renderTable() {
  const rows = getFilteredLeads();
  const groups = groupLeadsByCreatedDay(rows);
  leadsBody.innerHTML = "";
  leadsCards.innerHTML = "";
  emptyState.classList.toggle("visible", rows.length === 0);

  const todayCount = rows.filter(isCreatedToday).length;
  const yesterdayCount = rows.filter(isCreatedYesterday).length;
  const createdStart = createdFrom?.value || "";
  const createdEnd = createdTo?.value || "";
  let createdRangeText = "";
  if (createdStart || createdEnd) {
    const fromLabel = createdStart ? formatDate(createdStart) : "البداية";
    const toLabel = createdEnd ? formatDate(createdEnd) : "الآن";
    createdRangeText = ` — تسجيل ${fromLabel} → ${toLabel}: ${rows.length} حالة`;
  }

  resultCount.textContent =
    `المعروض: ${rows.length} من ${leads.length}` +
    (createdRangeText ||
      (rows.length
        ? ` — اليوم ${todayCount} · أمس ${yesterdayCount} · ${groups.length} يوم`
        : ""));

  updateFiltersBadge();

  groups.forEach(([dayKey, dayLeads]) => {
    const modifier = dayGroupModifier(dayKey);
    const label = dayGroupLabel(dayKey);

    const dayRow = document.createElement("tr");
    dayRow.className = `day-row${modifier === "is-yesterday" ? " yesterday" : ""}`;
    dayRow.innerHTML = `<th colspan="12">${escapeHtml(label)} — ${dayLeads.length} بطاقة</th>`;
    leadsBody.appendChild(dayRow);
    dayLeads.forEach((lead) => leadsBody.appendChild(buildLeadRow(lead)));

    const group = document.createElement("section");
    group.className = "day-group";
    group.setAttribute("aria-label", `${label}، ${dayLeads.length} بطاقة`);
    group.innerHTML = `
      <button type="button" class="day-group-header ${modifier}" data-created-day="${escapeHtml(dayKey)}" title="عرض بطاقات هذا اليوم فقط">
        <h3 class="day-group-title">${escapeHtml(label)}</h3>
        <span class="day-group-count">${dayLeads.length}</span>
      </button>
    `;
    dayLeads.forEach((lead) => group.appendChild(buildLeadCard(lead)));
    leadsCards.appendChild(group);

    dayRow.querySelector("th").dataset.createdDay = dayKey;
    dayRow.style.cursor = "pointer";
    dayRow.title = "عرض بطاقات هذا اليوم فقط";
  });
}

function filterByCreatedDay(dayKey) {
  if (!dayKey || dayKey === "unknown" || !createdFrom || !createdTo) return;
  createdFrom.value = dayKey;
  createdTo.value = dayKey;
  activeQuick = "all";
  quickFilters.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.quick === "all");
  });
  if (filtersPanel) {
    filtersPanel.removeAttribute("hidden");
    filtersToggle?.setAttribute("aria-expanded", "true");
  }
  renderTable();
  showToast(`عرض تسجيلات ${dayGroupLabel(dayKey)}`);
}

function refresh() {
  refreshSuggestions();
  updateStats();
  renderTable();
}

function checkDuplicatePhone() {
  const value = normalizePhone(phone.value);
  if (value.length < 8) {
    phoneHint.hidden = true;
    return;
  }
  const dupes = leads.filter(
    (l) => normalizePhone(l.phone) === value && l.id !== leadId.value
  );
  if (!dupes.length) {
    phoneHint.hidden = true;
    return;
  }
  phoneHint.hidden = false;
  phoneHint.textContent = `تنبيه: الرقم مسجل قبل كده (${dupes[0].customerName})`;
}

async function upsertLead(payload, id) {
  if (id) {
    await setDoc(doc(db, COLLECTION, id), payload, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return ref.id;
}

async function syncAppointment(leadDocId, payload) {
  const apptRef = doc(db, APPOINTMENTS, leadDocId);
  const booked = payload.booked === "yes";

  let existingData = null;
  try {
    const existing = await getDoc(apptRef);
    if (existing.exists()) existingData = existing.data();
  } catch (err) {
    console.warn("appointment status read failed", err);
  }

  if (!booked || !payload.visitDate || !payload.visitTime) {
    // لا نمسح زيارة مكتملة من سجل الدكتور
    if (existingData?.status === "completed") return;
    await deleteDoc(apptRef);
    return;
  }

  // لو الزيارة على نفس الـ lead مكتملة، اعمل موعد جديد بدل overwrite
  if (existingData?.status === "completed") {
    await addDoc(collection(db, APPOINTMENTS), {
      leadId: leadDocId,
      patientName: payload.customerName,
      phone: payload.phone,
      city: payload.city || "",
      service: payload.service || "",
      visitDate: payload.visitDate,
      visitTime: payload.visitTime,
      status: "awaiting_doctor",
      agentName: payload.agentName || "",
      details: payload.details || "",
      source: "call_center",
      parentAppointmentId: leadDocId,
      createdAt: payload.createdAt || payload.updatedAt,
      updatedAt: payload.updatedAt,
    });
    return;
  }

  // لا نرجّع حالة الموعد لو الدكتور أكّده
  let status = "awaiting_doctor";
  const prev = existingData?.status;
  if (prev === "confirmed") status = prev;
  else if (prev === "cancelled") status = "awaiting_doctor";

  await setDoc(
    apptRef,
    {
      leadId: leadDocId,
      patientName: payload.customerName,
      phone: payload.phone,
      city: payload.city || "",
      service: payload.service || "",
      visitDate: payload.visitDate,
      visitTime: payload.visitTime,
      status,
      agentName: payload.agentName || "",
      details: payload.details || "",
      source: "call_center",
      createdAt: payload.createdAt || payload.updatedAt,
      updatedAt: payload.updatedAt,
    },
    { merge: true }
  );
}

async function removeLead(id) {
  await deleteDoc(doc(db, COLLECTION, id));
  await deleteDoc(doc(db, APPOINTMENTS, id));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (saving) return;

  const name = customerName.value.trim();
  const phoneValue = phone.value.trim();
  if (!name || !phoneValue) {
    showToast("الاسم ورقم الهاتف مطلوبان");
    return;
  }

  const bookedValue = getSelected("booked") || "no";
  if (bookedValue === "yes") {
    syncVisitPanel();
    if (!visitDate.value || !visitTime.value) {
      showToast("حدد تاريخ وساعة الزيارة قبل الحفظ");
      if (!visitDate.value) visitDate.focus();
      else visitTime.focus();
      return;
    }
  }

  const contactedValue = getSelected("contacted") || "no";
  let lastContactValue = lastContactDate.value;
  if (contactedValue === "yes" && !lastContactValue) {
    lastContactValue = todayISO();
  }

  const isNew = !leadId.value;
  const existing = isNew ? null : leads.find((l) => l.id === leadId.value);
  const nowIso = new Date().toISOString();

  const payload = {
    customerName: name,
    phone: phoneValue,
    interested: getSelected("interested"),
    booked: bookedValue,
    contacted: contactedValue,
    lastContactDate: lastContactValue,
    callStatus: callStatus.value || "answered",
    priority: priority.value || "normal",
    followUpDate: followUpDate.value,
    preferredTime: preferredTime.value.trim(),
    visitDate: bookedValue === "yes" ? visitDate.value : "",
    visitTime: bookedValue === "yes" ? visitTime.value : "",
    service: service.value.trim(),
    city: city.value.trim(),
    source: source.value,
    agentName: agentName.value.trim(),
    details: details.value.trim(),
    updatedAt: nowIso,
  };

  if (isNew) {
    payload.createdAt = nowIso;
  }

  if (agentName.value.trim()) {
    localStorage.setItem(AGENT_KEY, agentName.value.trim());
  }

  saving = true;
  await withBusy(
    saveBtn,
    async () => {
      try {
        const savedId = await upsertLead(payload, leadId.value || null);
        try {
          await syncAppointment(savedId, {
            ...payload,
            createdAt: payload.createdAt || existing?.createdAt || nowIso,
          });
        } catch (apptErr) {
          console.error(apptErr);
          showToast(
            "تم حفظ العميل، لكن فشل تسجيل الموعد — حدّث قواعد Firestore لمجموعة appointments"
          );
          setupPanel.hidden = false;
          resetForm(true);
          customerName.focus();
          return;
        }
        const visitMsg =
          bookedValue === "yes"
            ? ` — زيارة ${formatDate(payload.visitDate)} الساعة ${formatTime(payload.visitTime)}`
            : "";
        showToast(
          (isNew ? "تم حفظ العميل للفريق كله" : "تم تحديث بيانات العميل") + visitMsg
        );
        resetForm(true);
        customerName.focus();
      } catch (err) {
        console.error(err);
        showToast("فشل الحفظ — تأكد من قواعد Firestore");
        setupPanel.hidden = false;
      }
    },
  );
  saving = false;
  if (!leadId.value) saveBtn.textContent = "حفظ العميل";
});

resetBtn.addEventListener("click", () => {
  resetForm(true);
  customerName.focus();
});

cancelEditBtn.addEventListener("click", () => {
  resetForm(true);
  showToast("تم إلغاء التعديل");
});

phone.addEventListener("input", checkDuplicatePhone);

async function handleLeadAction(e) {
  const editId = e.target.getAttribute("data-edit");
  const deleteId = e.target.getAttribute("data-delete");

  if (editId) {
    const lead = leads.find((l) => l.id === editId);
    if (!lead) return;
    leadId.value = lead.id;
    customerName.value = lead.customerName;
    phone.value = lead.phone;
    setSelected("interested", lead.interested || "yes");
    setSelected("booked", lead.booked || "no");
    setSelected("contacted", lead.contacted === "yes" ? "yes" : "no");
    callStatus.value = lead.callStatus || "answered";
    priority.value = lead.priority || "normal";
    followUpDate.value = lead.followUpDate || "";
    lastContactDate.value = lead.lastContactDate || "";
    preferredTime.value = lead.preferredTime || "";
    visitDate.value = lead.visitDate || "";
    visitTime.value = lead.visitTime || "";
    service.value = lead.service || "";
    city.value = lead.city || "";
    source.value = lead.source || "";
    agentName.value = lead.agentName || agentName.value;
    details.value = lead.details || "";
    syncVisitPanel();
    checkDuplicatePhone();
    saveBtn.textContent = "تحديث العميل";
    cancelEditBtn.hidden = false;
    setMobileView("form");
    customerName.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (deleteId) {
    const lead = leads.find((l) => l.id === deleteId);
    if (!lead) return;
    const ok = confirm(`حذف العميل "${lead.customerName}" من سجل الفريق؟`);
    if (!ok) return;
    const deleteBtn = e.target.closest("button") || e.target;
    await withBusy(
      deleteBtn,
      async () => {
        try {
          await removeLead(deleteId);
          if (leadId.value === deleteId) resetForm(true);
          showToast("تم حذف العميل من السجل المشترك");
        } catch (err) {
          console.error(err);
          showToast("فشل الحذف");
        }
      },
      { loadingText: "جاري الحذف..." }
    );
  }
}

leadsBody.addEventListener("click", (e) => {
  const dayCell = e.target.closest(".day-row th, .day-row");
  if (dayCell) {
    const dayKey = dayCell.dataset.createdDay || dayCell.querySelector("th")?.dataset.createdDay;
    if (dayKey) {
      filterByCreatedDay(dayKey);
      return;
    }
  }
  handleLeadAction(e);
});

leadsCards.addEventListener("click", (e) => {
  const dayBtn = e.target.closest("[data-created-day]");
  if (dayBtn) {
    filterByCreatedDay(dayBtn.dataset.createdDay);
    return;
  }
  handleLeadAction(e);
});

[
  searchInput,
  interestFilter,
  bookedFilter,
  contactedFilter,
  statusFilter,
  priorityFilter,
  sourceFilter,
  agentFilter,
  createdFrom,
  createdTo,
  dateFrom,
  dateTo,
  sortBy,
].filter(Boolean).forEach((el) => {
  el.addEventListener("input", renderTable);
  el.addEventListener("change", renderTable);
});

form.querySelectorAll('input[name="contacted"]').forEach((el) => {
  el.addEventListener("change", () => {
    if (getSelected("contacted") === "yes" && !lastContactDate.value) {
      lastContactDate.value = todayISO();
    }
  });
});

form.querySelectorAll('input[name="booked"]').forEach((el) => {
  el.addEventListener("change", () => {
    syncVisitPanel();
    if (getSelected("booked") === "yes" && !visitDate.value) {
      visitDate.value = todayISO();
    }
  });
});

syncVisitPanel();

if (filtersToggle && filtersPanel) {
  filtersToggle.addEventListener("click", () => {
    const open = filtersPanel.hasAttribute("hidden");
    filtersPanel.toggleAttribute("hidden", !open);
    filtersToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

if (mobileNav) {
  mobileNav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    setMobileView(btn.dataset.view);
  });
}

quickFilters.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-quick]");
  if (!btn) return;
  activeQuick = btn.dataset.quick;
  quickFilters.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip === btn);
  });
  renderTable();
});

clearFiltersBtn.addEventListener("click", () => {
  searchInput.value = "";
  interestFilter.value = "all";
  bookedFilter.value = "all";
  contactedFilter.value = "all";
  statusFilter.value = "all";
  priorityFilter.value = "all";
  sourceFilter.value = "all";
  agentFilter.value = "all";
  if (createdFrom) createdFrom.value = "";
  if (createdTo) createdTo.value = "";
  dateFrom.value = "";
  dateTo.value = "";
  sortBy.value = "newest";
  exportScope.value = "filtered";
  activeQuick = "all";
  quickFilters.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.quick === "all");
  });
  renderTable();
  showToast("تم مسح الفلاتر");
});

function toSheetRows(list) {
  return list.map((lead, index) => ({
    "#": index + 1,
    "اسم العميل": lead.customerName,
    "رقم الهاتف": lead.phone,
    التواصل: contactedLabel(lead.contacted === "yes" ? "yes" : "no"),
    "تاريخ آخر تواصل": lead.lastContactDate || "",
    "حالة المكالمة": statusLabel(lead.callStatus || "answered"),
    "مهتم بالخدمة": interestLabel(lead.interested),
    "تم الحجز": bookedLabel(lead.booked),
    "تاريخ الزيارة": lead.booked === "yes" ? lead.visitDate || "" : "",
    "ساعة الزيارة": lead.booked === "yes" ? lead.visitTime || "" : "",
    الأولوية: priorityLabel(lead.priority || "normal"),
    "يوم المتابعة": lead.followUpDate || "",
    "وقت مناسب": lead.preferredTime || "",
    "المدينة / المنطقة": lead.city || "",
    "الخدمة / العرض": lead.service || "",
    المصدر: sourceLabel(lead.source),
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
    { المؤشر: "مهتمين", القيمة: list.filter((l) => l.interested === "yes").length },
    { المؤشر: "محتملين", القيمة: list.filter((l) => l.interested === "maybe").length },
    { المؤشر: "محجوز", القيمة: list.filter((l) => l.booked === "yes").length },
    { المؤشر: "مهتم وغير محجوز", القيمة: list.filter(isHot).length },
    { المؤشر: "متابعة اليوم", القيمة: list.filter(isTodayFollowUp).length },
    { المؤشر: "متأخر", القيمة: list.filter(isOverdue).length },
    { المؤشر: "أعد الاتصال / لم يرد", القيمة: list.filter((l) => l.callStatus === "callback" || l.callStatus === "no_answer").length },
    { المؤشر: "تم التواصل", القيمة: list.filter((l) => l.contacted === "yes").length },
    { المؤشر: "لم يتم التواصل", القيمة: list.filter((l) => l.contacted !== "yes").length },
  ];
}

function fileStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
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
      headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `عملاء-الكول-سنتر_${fileStamp()}.csv`);
  showToast("تم تصدير CSV");
}

function exportXlsx() {
  const list = getExportLeads();
  if (!list.length) {
    showToast("لا توجد بيانات للتصدير");
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSheetRows(list)), "كل العملاء");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows(list)), "ملخص");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(toSheetRows(list.filter((l) => l.interested === "yes" || l.interested === "maybe"))),
    "المحتملين"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(toSheetRows(list.filter(isHot))),
    "مهتم وغير محجوز"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(toSheetRows(list.filter(isTodayFollowUp))),
    "متابعة اليوم"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(toSheetRows(list.filter(isOverdue))),
    "متأخر"
  );
  XLSX.writeFile(wb, `عملاء-الكول-سنتر_${fileStamp()}.xlsx`);
  showToast("تم تصدير Excel بالجداول");
}

exportCsvBtn.addEventListener("click", () =>
  withBusy(exportCsvBtn, async () => exportCsv(), { loadingText: "جاري التصدير..." })
);
exportXlsxBtn.addEventListener("click", () =>
  withBusy(exportXlsxBtn, async () => exportXlsx(), { loadingText: "جاري التصدير..." })
);

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

setSyncState("loading", "جاري مزامنة سجل الفريق...");

onSnapshot(
  collection(db, COLLECTION),
  (snapshot) => {
    leads = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    refresh();
    setupPanel.hidden = true;
    setSyncState("online", `متصل — سجل مشترك للفريق (${leads.length})`);
  },
  (err) => {
    console.error(err);
    setupPanel.hidden = false;
    setSyncState("error", "فشل الاتصال — راجع قواعد Firestore");
  }
);
