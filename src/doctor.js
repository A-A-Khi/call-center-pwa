import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase.js";

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
const toast = document.getElementById("toast");
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
const statConfirmed = document.getElementById("statConfirmed");
const statToday = document.getElementById("statToday");
const statCancelled = document.getElementById("statCancelled");

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

function statusLabel(status) {
  if (status === "cancelled") return "ملغى";
  return "مؤكد";
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

function activeAppointments() {
  return appointments.filter((a) => a.status !== "cancelled");
}

function forDate(dateISO, { includeCancelled = false } = {}) {
  return appointments
    .filter((a) => a.visitDate === dateISO)
    .filter((a) => includeCancelled || a.status !== "cancelled")
    .sort((a, b) => String(a.visitTime || "").localeCompare(String(b.visitTime || "")));
}

function countsForDate(dateISO) {
  const day = appointments.filter((a) => a.visitDate === dateISO);
  return {
    confirmed: day.filter((a) => a.status !== "cancelled").length,
    cancelled: day.filter((a) => a.status === "cancelled").length,
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
      ? counts.confirmed
      : counts.confirmed + counts.cancelled;
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
    const confirmedDots = Math.min(counts.confirmed, 3);
    for (let i = 0; i < confirmedDots; i += 1) dots.push('<span class="dot"></span>');
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
    const card = document.createElement("button");
    card.type = "button";
    card.className = `appt-card${appt.status === "cancelled" ? " is-cancelled" : ""}`;
    card.style.animationDelay = `${index * 0.04}s`;
    card.innerHTML = `
      <span class="appt-time">${formatTime(appt.visitTime)}</span>
      <span class="appt-body">
        <strong>${escapeHtml(appt.patientName || "بدون اسم")}</strong>
        <p>${escapeHtml(appt.service || appt.phone || "—")}</p>
      </span>
      <span class="appt-status ${appt.status === "cancelled" ? "cancelled" : ""}">
        ${statusLabel(appt.status)}
      </span>
    `;
    card.addEventListener("click", () => openDialog(appt));
    agendaList.appendChild(card);
  });
}

function renderStats() {
  const confirmed = activeAppointments().length;
  const todayCount = forDate(todayISO()).length;
  const cancelled = appointments.filter((a) => a.status === "cancelled").length;
  statConfirmed.textContent = String(confirmed);
  statToday.textContent = String(todayCount);
  statCancelled.textContent = String(cancelled);

  if (todayCount > 0) {
    todayBanner.hidden = false;
    todayBannerTitle.textContent = `عندك ${todayCount} موعد اليوم`;
    const next = forDate(todayISO())[0];
    todayBannerText.textContent = next
      ? `أقرب موعد الساعة ${formatTime(next.visitTime)} — ${next.patientName}`
      : "راجع الجدول للتفاصيل";
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

function openDialog(appt) {
  editApptId.value = appt.id;
  editPatientName.textContent = appt.patientName || "بدون اسم";
  editPhoneLink.textContent = appt.phone || "—";
  editPhoneLink.href = appt.phone ? `tel:${appt.phone}` : "#";
  editService.textContent = [appt.service, appt.city].filter(Boolean).join(" · ") || "—";
  editVisitDate.value = appt.visitDate || "";
  editVisitTime.value = appt.visitTime || "";
  editDetails.value = appt.details || "";
  dialogStatus.textContent = statusLabel(appt.status);
  dialogTitle.textContent =
    appt.status === "cancelled" ? "موعد ملغى" : "تعديل الموعد";
  cancelApptBtn.hidden = appt.status === "cancelled";
  saveApptBtn.disabled = appt.status === "cancelled";
  editVisitDate.disabled = appt.status === "cancelled";
  editVisitTime.disabled = appt.status === "cancelled";
  editDetails.disabled = appt.status === "cancelled";
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
    // lead قد يكون محذوف — الموعد أهم للدكتور
    console.warn("lead sync skipped", err);
  }
}

async function saveAppointmentEdits() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || appt.status === "cancelled") return;

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
        status: "confirmed",
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

async function cancelAppointment() {
  const id = editApptId.value;
  const appt = appointments.find((a) => a.id === id);
  if (!appt || appt.status === "cancelled") return;

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

function handleNewAndTodayNotifications(list) {
  const confirmed = list.filter((a) => a.status !== "cancelled");
  const ids = new Set(confirmed.map((a) => a.id));

  if (!initialSnapshot) {
    confirmed.forEach((appt) => {
      if (!knownIds.has(appt.id)) {
        notifyDoctor(
          "حجز جديد",
          `${appt.patientName || "مريض"} — ${formatDateLabel(appt.visitDate)} الساعة ${formatTime(appt.visitTime)}`
        );
        showToast(`حجز جديد: ${appt.patientName || "مريض"}`);
      }
    });
  }

  knownIds = ids;
  saveKnownIds();

  const todayCount = confirmed.filter((a) => a.visitDate === todayISO()).length;
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

  saveApptBtn.addEventListener("click", () => {
    saveAppointmentEdits();
  });

  cancelApptBtn.addEventListener("click", () => {
    cancelAppointment();
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

  forDate(todayISO()).forEach((appt) => {
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
bindUi();
startListening();
renderAll();
setInterval(checkUpcomingReminders, 60_000);
setTimeout(checkUpcomingReminders, 4000);
