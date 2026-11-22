import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase.js";
import { DOC_SYNC } from "./sync-config.js";

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
const visitCompletePanel = document.getElementById("visitCompletePanel");
const visitServiceName = document.getElementById("visitServiceName");
const visitCostEgp = document.getElementById("visitCostEgp");
const visitPaidEgp = document.getElementById("visitPaidEgp");
const visitClinicalNotes = document.getElementById("visitClinicalNotes");
const completedSummary = document.getElementById("completedSummary");
const completedSummaryText = document.getElementById("completedSummaryText");
const syncStatusLine = document.getElementById("syncStatusLine");
const retrySyncBtn = document.getElementById("retrySyncBtn");
const statAwaiting = document.getElementById("statAwaiting");
const statConfirmed = document.getElementById("statConfirmed");
const statToday = document.getElementById("statToday");
const statCompleted = document.getElementById("statCompleted");

let appointments = [];
let viewMode = "month";
let cursor = startOfMonth(new Date());
let selectedDate = todayISO();
let toastTimer = null;
let knownIds = loadKnownIds();
let initialSnapshot = true;

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
    const money =
      status === "completed" && appt.visit?.paidEgp != null
        ? ` · مدفوع ${appt.visit.paidEgp} ج`
        : "";
    card.innerHTML = `
      <span class="appt-time">${formatTime(appt.visitTime)}</span>
      <span class="appt-body">
        <strong>${escapeHtml(appt.patientName || "بدون اسم")}</strong>
        <p>${escapeHtml(appt.service || appt.phone || "—")}${money}</p>
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

  visitServiceName.value = appt.visit?.serviceName || appt.service || "";
  visitCostEgp.value = appt.visit?.costEgp ?? "";
  visitPaidEgp.value = appt.visit?.paidEgp ?? "";
  visitClinicalNotes.value = appt.visit?.clinicalNotes || "";

  const locked = status === "cancelled" || status === "completed";
  setScheduleFieldsDisabled(locked);

  confirmApptBtn.hidden = status !== "awaiting_doctor";
  completeVisitBtn.hidden = status !== "confirmed";
  visitCompletePanel.hidden = status !== "confirmed";
  saveApptBtn.hidden = locked;
  cancelApptBtn.hidden = locked;
  saveApptBtn.textContent = "حفظ التعديل";

  retrySyncBtn.hidden = true;

  if (status === "completed") {
    dialogTitle.textContent = "زيارة مكتملة";
    completedSummary.hidden = false;
    const v = appt.visit || {};
    completedSummaryText.textContent = [
      v.serviceName || appt.service || "خدمة",
      v.costEgp != null ? `تكلفة ${v.costEgp} ج` : null,
      v.paidEgp != null ? `مدفوع ${v.paidEgp} ج` : null,
      v.clinicalNotes || null,
      appt.mainSite?.patientCode ? `كود ${appt.mainSite.patientCode}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
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

async function syncLeadFromAppointment(apptId, patch) {
  const leadRef = doc(db, LEADS, apptId);
  try {
    await updateDoc(leadRef, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("lead sync skipped", err);
  }
}

function syncStatusLabel(syncStatus) {
  if (syncStatus === "synced") return "تمت المزامنة مع الموقع الرئيسي";
  if (syncStatus === "failed") return "فشلت المزامنة — يمكن إعادة المحاولة";
  if (syncStatus === "pending") return "جاري/بانتظار المزامنة مع الموقع الرئيسي";
  return "لم تتم المزامنة بعد";
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
      cost_egp: Number(visit.costEgp) || 0,
      paid_egp: Number(visit.paidEgp) || 0,
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
  if (!appt.visit?.serviceName) {
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

  saveApptBtn.disabled = true;
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
    await syncLeadFromAppointment(id, {
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
  } finally {
    saveApptBtn.disabled = false;
  }
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
  confirmApptBtn.disabled = true;
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
    await syncLeadFromAppointment(id, {
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
  } finally {
    confirmApptBtn.disabled = false;
  }
}

async function completeVisit() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || normalizeStatus(appt) !== "confirmed") return;

  const serviceName = visitServiceName.value.trim();
  const costEgp = Number(visitCostEgp.value);
  const paidEgp = Number(visitPaidEgp.value);
  const clinicalNotes = visitClinicalNotes.value.trim();

  if (!serviceName) {
    showToast("اكتب الخدمة المقدمة");
    visitServiceName.focus();
    return;
  }
  if (!Number.isFinite(costEgp) || costEgp < 0) {
    showToast("أدخل تكلفة صحيحة");
    visitCostEgp.focus();
    return;
  }
  if (!Number.isFinite(paidEgp) || paidEgp < 0) {
    showToast("أدخل المبلغ المدفوع");
    visitPaidEgp.focus();
    return;
  }
  if (paidEgp > costEgp) {
    showToast("المدفوع أكبر من التكلفة");
    visitPaidEgp.focus();
    return;
  }

  const updatedAt = new Date().toISOString();
  completeVisitBtn.disabled = true;
  try {
    const visitPayload = {
      serviceName,
      costEgp,
      paidEgp,
      clinicalNotes,
      completedAt: updatedAt,
      completedBy: "doctor",
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
    await syncLeadFromAppointment(id, {
      booked: "yes",
      doctorStatus: "completed",
      visitServiceName: serviceName,
      visitCostEgp: costEgp,
      visitPaidEgp: paidEgp,
    });

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
      apptDialog.close();
      const code = result?.patientCode ? ` · ${result.patientCode}` : "";
      showToast(`تم تسجيل الزيارة ومزامنتها مع الموقع الرئيسي${code}`);
      notifyDoctor(
        "زيارة مكتملة ومتزامنة",
        `${appt.patientName || "مريض"} · ${serviceName} · ${paidEgp} ج`
      );
    } catch (syncErr) {
      console.error(syncErr);
      await markSyncFailed(id, syncErr.message || syncErr);
      showToast("الزيارة اتسجلت محليًا لكن المزامنة فشلت — افتح الموعد وأعد المحاولة");
      // keep dialog open with refreshed state via snapshot
    }
  } catch (err) {
    console.error(err);
    showToast("فشل تسجيل الزيارة");
  } finally {
    completeVisitBtn.disabled = false;
  }
}

async function retryMainSiteSync() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || normalizeStatus(appt) !== "completed") return;

  retrySyncBtn.disabled = true;
  syncStatusLine.textContent = "جاري المزامنة...";
  syncStatusLine.className = "sync-line is-pending";
  try {
    const result = await syncAppointmentToMainSite(appt);
    const code = result?.patientCode ? ` · ${result.patientCode}` : "";
    showToast(`تمت المزامنة مع الموقع الرئيسي${code}`);
    apptDialog.close();
  } catch (err) {
    console.error(err);
    await markSyncFailed(id, err.message || err);
    showToast(`فشلت المزامنة: ${err.message || err}`);
  } finally {
    retrySyncBtn.disabled = false;
  }
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
  cancelApptBtn.disabled = true;
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
    await syncLeadFromAppointment(id, {
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
  } finally {
    cancelApptBtn.disabled = false;
  }
}

function canNotify() {
  return "Notification" in window && Notification.permission === "granted";
}

function notifyDoctor(title, body) {
  if (!canNotify()) return;
  try {
    new Notification(title, {
      body,
      icon: "./icons/icon-192.png",
      lang: "ar",
      dir: "rtl",
      tag: `doctor-${title}-${body}`.slice(0, 80),
    });
  } catch (err) {
    console.warn(err);
  }
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("المتصفح لا يدعم الإشعارات");
    return false;
  }
  if (Notification.permission === "granted") {
    notifyBtn.textContent = "الإشعارات مفعّلة";
    showToast("الإشعارات مفعّلة بالفعل");
    return true;
  }
  if (Notification.permission === "denied") {
    showToast("الإشعارات مرفوضة من إعدادات المتصفح");
    return false;
  }
  const result = await Notification.requestPermission();
  if (result === "granted") {
    notifyBtn.textContent = "الإشعارات مفعّلة";
    showToast("تم تفعيل إشعارات المواعيد");
    notifyDoctor("مواعيد الطبيب", "هتوصلك تنبيهات الحجوزات الجديدة ومواعيد اليوم");
    return true;
  }
  showToast("لم يتم تفعيل الإشعارات");
  return false;
}

function updateNotifyButton() {
  if (!("Notification" in window)) {
    notifyBtn.hidden = true;
    return;
  }
  if (Notification.permission === "granted") {
    notifyBtn.textContent = "الإشعارات مفعّلة";
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

function updateInstallButton() {
  if (!installBtn) return;
  if (isStandaloneApp()) {
    installBtn.hidden = true;
    return;
  }
  installBtn.hidden = false;
  installBtn.textContent = isIosDevice() ? "تثبيت على الآيفون" : "تثبيت التطبيق";
}

async function handleInstallClick() {
  if (isStandaloneApp()) {
    showToast("التطبيق مثبت بالفعل");
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice?.outcome === "accepted") {
      installBtn.hidden = true;
      showToast("تم تثبيت التطبيق");
    }
    return;
  }

  if (isIosDevice()) {
    installSheet?.showModal();
    return;
  }

  showToast("من قائمة المتصفح اختَر تثبيت التطبيق / Add to Home Screen");
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

  notifyBtn.addEventListener("click", () => {
    requestNotifications();
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

  retrySyncBtn.addEventListener("click", () => {
    retryMainSiteSync();
  });

  cancelApptBtn.addEventListener("click", () => {
    cancelAppointment();
  });

  visitCostEgp.addEventListener("change", () => {
    if (visitPaidEgp.value === "" && visitCostEgp.value !== "") {
      visitPaidEgp.value = visitCostEgp.value;
    }
  });
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
