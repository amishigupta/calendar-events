const fs = require("fs");
const path = require("path");

const ENDPOINT = process.env.EXTRACT_EVENT_URL || "http://localhost:3000/api/extract-event";
const IMAGE_FILE = path.join(__dirname, "image-base64.txt");

async function main() {
  const raw = fs.readFileSync(IMAGE_FILE, "utf8").trim();

  const body = raw.startsWith("data:")
    ? { image: raw }
    : { image: raw, mimeType: "image/jpeg" };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`Request failed (${res.status}):`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("Error running test-extract.js:", err.message);
  process.exit(1);
});
