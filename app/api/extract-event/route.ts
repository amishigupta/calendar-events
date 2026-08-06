import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { todayIsoDate } from "@/lib/date";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

function buildExtractionPrompt(): string {
  const today = todayIsoDate();
  return `You are an assistant that extracts calendar event details from an image (such as a flyer, screenshot, invitation, or poster).

Today's date is ${today}. Use it as a reference point when a date is shown without a year (e.g. "4/14" with no year) — infer the most likely year (typically the nearest upcoming or current occurrence) rather than giving up.

Look at the image and extract the event details. Respond with ONLY valid JSON (no markdown code fences, no explanation, no extra text) matching exactly this shape:

{
  "title": string | null,
  "dates": string[],           // one entry per distinct date the event occurs on, each in YYYY-MM-DD format. Empty array if no date is visible.
  "startTime": string | null,  // format HH:MM, 24-hour. Applies to all dates unless the image shows otherwise.
  "endTime": string | null,    // format HH:MM, 24-hour, null if not shown
  "location": string | null,
  "description": string | null,
  "meetingLink": string | null,  // full URL to a Zoom, Google Meet, or other video-call link shown in the image, if any
  "recurrence": string | null    // RFC 5545 RRULE string describing a repeating pattern, if the image describes one. Otherwise null.
}

Rules:
- If a field is not visible or cannot be confidently determined from the image, set it to null (or an empty array for "dates").
- If the image lists multiple distinct dates for the same event (e.g. "4/14 AND 4/16"), include one entry per date in "dates" — do not merge them into a range and do not drop any of them.
- Every entry in "dates" must be in YYYY-MM-DD format.
- startTime and endTime must be in 24-hour HH:MM format (e.g. "09:00", "17:30"); if a phrase like "7:00 to 8:00 PM" describes the recurring time, put 19:00 in startTime and 20:00 in endTime rather than in "recurrence".
- meetingLink must be the full URL (e.g. "https://zoom.us/j/123456789" or "https://meet.google.com/abc-defg-hij"). If only a meeting ID or phone dial-in is shown with no URL, set meetingLink to null.

Recurrence rules (for phrases like "every Friday", "weekly on Mondays and Wednesdays", "every other Tuesday", "monthly on the first Sunday", or a bounded run like "the week of March 2nd"):
- Express the pattern as a single RFC 5545 RRULE string starting with "RRULE:", e.g. "RRULE:FREQ=WEEKLY;BYDAY=FR" or "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261225T000000Z".
- "dates" should contain only the single anchor/start date the recurrence begins from (the DTSTART), not every occurrence.
- If the image gives an end point for the recurrence (e.g. "through May", "until the 20th", "the week of March 2nd" meaning Mon–Fri that week), include an UNTIL= clause in the RRULE with that end date in YYYYMMDD"T000000Z" format. If no end point is given, omit UNTIL (open-ended).
- "the week of <date>" (a single bounded week, not an ongoing series) should be expressed as "RRULE:FREQ=DAILY;UNTIL=<end of that week>" with "dates" set to the Monday (or first day mentioned) of that week — not treated as a single one-off date.
- If the event happens on one or more specific, non-repeating dates with no described pattern, leave "recurrence" as null and use "dates" as normal.
- Do not wrap the JSON in markdown code fences.
- Do not include any text before or after the JSON object.`;
}

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

const SCALAR_EVENT_FIELDS: Exclude<keyof ExtractedEvent, "dates">[] = [
  "title",
  "startTime",
  "endTime",
  "location",
  "description",
  "meetingLink",
  "recurrence",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RRULE_RE = /^RRULE:FREQ=/i;

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function normalizeEvent(raw: unknown): ExtractedEvent {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = {} as ExtractedEvent;

  for (const field of SCALAR_EVENT_FIELDS) {
    const value = source[field];
    result[field] = typeof value === "string" && value.trim() !== "" ? value : null;
  }

  const rawDates = source.dates;
  result.dates = Array.isArray(rawDates)
    ? rawDates.filter((d): d is string => typeof d === "string" && DATE_RE.test(d))
    : [];

  if (result.recurrence && !RRULE_RE.test(result.recurrence)) {
    result.recurrence = null;
  }

  return result;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function getImageFromRequest(
  req: NextRequest
): Promise<{ mimeType: string; data: string } | null> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("image");
    if (!file || !(file instanceof File)) return null;
    const arrayBuffer = await file.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    return { mimeType, data };
  }

  if (contentType.includes("application/json")) {
    const body = await req.json();
    const image = body?.image;
    const mimeType = body?.mimeType;
    if (typeof image !== "string" || image.length === 0) return null;

    if (image.startsWith("data:")) {
      return parseDataUrl(image);
    }

    return { mimeType: typeof mimeType === "string" && mimeType ? mimeType : "image/jpeg", data: image };
  }

  return null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let image: { mimeType: string; data: string } | null;
  try {
    image = await getImageFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Failed to parse request body." }, { status: 400 });
  }

  if (!image) {
    return NextResponse.json(
      {
        error:
          "No image provided. Send multipart/form-data with an 'image' file field, or JSON with an 'image' field (data URL or base64 string).",
      },
      { status: 400 }
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent([
      { text: buildExtractionPrompt() },
      { inlineData: { mimeType: image.mimeType, data: image.data } },
    ]);

    const responseText = result.response.text();
    const jsonText = stripCodeFences(responseText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { error: "Gemini returned a response that was not valid JSON.", raw: responseText },
        { status: 502 }
      );
    }

    const event = normalizeEvent(parsed);
    return NextResponse.json(event);
  } catch (err) {
    if (err instanceof GoogleGenerativeAIFetchError && err.status === 429) {
      return NextResponse.json(
        {
          error:
            "Gemini API rate limit reached (free-tier daily quota for this model is exhausted). Wait a bit and try again, or switch GEMINI_MODEL to a different model.",
        },
        { status: 429 }
      );
    }

    const message = err instanceof Error ? err.message : "Unknown error calling Gemini API.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
