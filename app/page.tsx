"use client";

import { useEffect, useRef, useState } from "react";
import { buildCalendarUrls } from "@/lib/calendarUrl";

type ExtractedEvent = {
  title: string | null;
  dates: string[];
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  meetingLink: string | null;
  recurrence: string | null;
};

type FormState = {
  title: string;
  dates: string[];
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  meetingLink: string;
  recurrence: string;
};

function formatDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toFormState(event: ExtractedEvent): FormState {
  return {
    title: event.title ?? "",
    dates: event.dates.length > 0 ? event.dates : [],
    startTime: event.startTime ?? "",
    endTime: event.endTime ?? "",
    location: event.location ?? "",
    description: event.description ?? "",
    meetingLink: event.meetingLink ?? "",
    recurrence: event.recurrence ?? "",
  };
}

export default function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setForm(null);
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/extract-event", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      setForm(toFormState(data as ExtractedEvent));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong extracting the event.");
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof Omit<FormState, "dates">>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateDate(index: number, value: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const dates = [...prev.dates];
      dates[index] = value;
      return { ...prev, dates };
    });
  }

  function addDate() {
    setForm((prev) => (prev ? { ...prev, dates: [...prev.dates, ""] } : prev));
  }

  function removeDate(index: number) {
    setForm((prev) => {
      if (!prev) return prev;
      const dates = prev.dates.filter((_, i) => i !== index);
      return { ...prev, dates };
    });
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setForm(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Extract Event from Image</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload a flyer, screenshot, or invite and we&apos;ll pull out the event details.
          </p>
        </div>

        <label
          htmlFor="image-upload"
          className="relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-8 text-center active:bg-gray-100"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Selected event image preview"
              className="max-h-64 w-full rounded-lg object-contain"
            />
          ) : (
            <>
              <span className="text-4xl">📷</span>
              <span className="text-sm font-medium text-gray-700">Tap to choose an image</span>
              <span className="text-xs text-gray-400">Camera or photo library</span>
            </>
          )}
          <input
            ref={fileInputRef}
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>

        {previewUrl && (
          <button
            type="button"
            onClick={reset}
            className="self-center text-sm text-gray-500 underline underline-offset-2"
          >
            Choose a different image
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-6 text-gray-600">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            <span className="text-sm font-medium">Extracting event details…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {form && !loading && (
          <form className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="title" className="text-xs font-medium text-gray-500">
                Title
              </label>
              <input
                id="title"
                type="text"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="Event title"
                className="rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Dates</span>
              <div className="flex flex-col gap-2">
                {form.dates.map((date, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => updateDate(index, e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => removeDate(index)}
                      aria-label="Remove date"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDate}
                  className="self-start text-sm font-medium text-blue-600"
                >
                  + Add date
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="recurrence" className="text-xs font-medium text-gray-500">
                Recurrence
              </label>
              <input
                id="recurrence"
                type="text"
                value={form.recurrence}
                onChange={(e) => updateField("recurrence", e.target.value)}
                placeholder="e.g. RRULE:FREQ=WEEKLY;BYDAY=FR"
                spellCheck={false}
                className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
              />
              <span className="text-xs text-gray-400">
                For repeating events (&quot;every Friday&quot;, &quot;weekly&quot;, etc.) — matches
                Google Calendar&apos;s recurrence rule format. Leave blank for a one-time event.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="startTime" className="text-xs font-medium text-gray-500">
                  Start time
                </label>
                <input
                  id="startTime"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => updateField("startTime", e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="endTime" className="text-xs font-medium text-gray-500">
                  End time
                </label>
                <input
                  id="endTime"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => updateField("endTime", e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="location" className="text-xs font-medium text-gray-500">
                Location
              </label>
              <input
                id="location"
                type="text"
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder="Location"
                className="rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="meetingLink" className="text-xs font-medium text-gray-500">
                Meeting link
              </label>
              <input
                id="meetingLink"
                type="url"
                inputMode="url"
                value={form.meetingLink}
                onChange={(e) => updateField("meetingLink", e.target.value)}
                placeholder="Zoom / Google Meet URL"
                className="rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900"
              />
              {form.meetingLink && (
                <a
                  href={form.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start text-xs font-medium text-blue-600 underline underline-offset-2"
                >
                  Open link
                </a>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-xs font-medium text-gray-500">
                Description
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Description"
                rows={3}
                className="resize-none rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900"
              />
            </div>

            {(() => {
              const calendarUrls = buildCalendarUrls(form);
              if (calendarUrls.length === 1) {
                return (
                  <a
                    href={calendarUrls[0].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white active:bg-blue-700"
                  >
                    Export to Google Calendar
                  </a>
                );
              }
              return (
                <div className="mt-2 flex flex-col gap-2">
                  <span className="text-xs text-gray-500">
                    This event has multiple dates — Google Calendar needs a separate event per
                    date, so export each one:
                  </span>
                  {calendarUrls.map(({ date, url }) => (
                    <a
                      key={date}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white active:bg-blue-700"
                    >
                      Export {formatDateLabel(date)}
                    </a>
                  ))}
                </div>
              );
            })()}
          </form>
        )}
      </main>
    </div>
  );
}
