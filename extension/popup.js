// Update this if the deployed API URL ever changes (must also be updated in manifest.json's host_permissions).
const API_BASE_URL = "https://calendar-events-phi.vercel.app";

const els = {
  captureBtn: document.getElementById("capture-btn"),
  preview: document.getElementById("preview"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  form: document.getElementById("form"),
  title: document.getElementById("title"),
  datesList: document.getElementById("dates-list"),
  addDateBtn: document.getElementById("add-date-btn"),
  recurrence: document.getElementById("recurrence"),
  startTime: document.getElementById("startTime"),
  endTime: document.getElementById("endTime"),
  location: document.getElementById("location"),
  meetingLink: document.getElementById("meetingLink"),
  description: document.getElementById("description"),
  exportBtn: document.getElementById("export-btn"),
};

let dates = [];

function setLoading(loading) {
  els.status.style.display = loading ? "flex" : "none";
  els.captureBtn.disabled = loading;
}

function showError(message) {
  els.error.textContent = message;
  els.error.style.display = "block";
}

function clearError() {
  els.error.style.display = "none";
  els.error.textContent = "";
}

function renderDates() {
  els.datesList.innerHTML = "";
  dates.forEach((date, index) => {
    const row = document.createElement("div");
    row.className = "date-row";

    const input = document.createElement("input");
    input.type = "date";
    input.value = date;
    input.addEventListener("input", (e) => {
      dates[index] = e.target.value;
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", "Remove date");
    removeBtn.addEventListener("click", () => {
      dates.splice(index, 1);
      renderDates();
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    els.datesList.appendChild(row);
  });
}

els.addDateBtn.addEventListener("click", () => {
  dates.push("");
  renderDates();
});

function populateForm(event) {
  els.title.value = event.title ?? "";
  dates = Array.isArray(event.dates) ? [...event.dates] : [];
  renderDates();
  els.recurrence.value = event.recurrence ?? "";
  els.startTime.value = event.startTime ?? "";
  els.endTime.value = event.endTime ?? "";
  els.location.value = event.location ?? "";
  els.meetingLink.value = event.meetingLink ?? "";
  els.description.value = event.description ?? "";
  els.form.style.display = "flex";
}

els.captureBtn.addEventListener("click", () => {
  clearError();
  els.form.style.display = "none";

  chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      showError(chrome.runtime.lastError?.message || "Failed to capture the current tab.");
      return;
    }

    els.preview.src = dataUrl;
    els.preview.style.display = "block";
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/extract-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      populateForm(data);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Something went wrong extracting the event.");
    } finally {
      setLoading(false);
    }
  });
});

// --- Google Calendar URL builder (mirrors lib/calendarUrl.ts + lib/date.ts) ---

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toCompactDate(date) {
  return date.replace(/-/g, "");
}

function addOneDay(date) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function toCompactDateTime(date, time) {
  return `${toCompactDate(date)}T${time.replace(":", "")}00`;
}

function buildSingleEventUrl(event, date) {
  const hasTimes = TIME_RE.test(event.startTime) && TIME_RE.test(event.endTime);
  const datesParam = hasTimes
    ? `${toCompactDateTime(date, event.startTime)}/${toCompactDateTime(date, event.endTime)}`
    : `${toCompactDate(date)}/${toCompactDate(addOneDay(date))}`;

  const detailsParts = [
    event.description.trim(),
    event.meetingLink?.trim() ? `Join: ${event.meetingLink.trim()}` : "",
  ].filter(Boolean);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: datesParam,
  });

  if (event.location.trim()) params.set("location", event.location.trim());
  if (detailsParts.length > 0) params.set("details", detailsParts.join("\n\n"));
  if (event.recurrence?.trim()) params.set("recur", event.recurrence.trim());

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Google Calendar's prefill URL only represents one event at a time. When an
// event has multiple disjoint dates and no recurrence rule, there's no single
// URL for that — so this returns one URL per date instead of dropping all but
// the first.
function buildCalendarUrls(event) {
  const validDates = event.dates.filter((d) => DATE_RE.test(d));

  if (event.recurrence?.trim() || validDates.length <= 1) {
    const anchorDate = validDates[0] ?? todayIsoDate();
    return [{ date: anchorDate, url: buildSingleEventUrl(event, anchorDate) }];
  }

  return validDates.map((date) => ({ date, url: buildSingleEventUrl(event, date) }));
}

els.exportBtn.addEventListener("click", () => {
  const entries = buildCalendarUrls({
    title: els.title.value,
    dates,
    startTime: els.startTime.value,
    endTime: els.endTime.value,
    location: els.location.value,
    description: els.description.value,
    meetingLink: els.meetingLink.value,
    recurrence: els.recurrence.value,
  });
  entries.forEach(({ url }) => chrome.tabs.create({ url }));
});
