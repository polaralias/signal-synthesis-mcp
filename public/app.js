const el = (id) => document.getElementById(id);

function show(id) {
  ["view-dashboard", "view-provision"].forEach(v => el(v).classList.add("hidden"));
  el(id).classList.remove("hidden");
}

function setBanner(configured) {
  const banner = el("masterKeyBanner");
  const icon = el("masterKeyIcon");
  const title = el("masterKeyTitle");
  const body = el("masterKeyBody");
  const snippet = el("masterKeySnippet");

  banner.classList.remove("hidden");

  if (configured) {
    icon.textContent = "✅";
    title.textContent = "Server configured";
    body.textContent = "MASTER_KEY is set. OAuth and API key provisioning are available.";
    snippet.textContent = "";
    snippet.classList.add("hidden");
  } else {
    icon.textContent = "❌";
    title.textContent = "Setup required";
    body.textContent = "Set MASTER_KEY to enable token signing/encryption and secure key issuance.";
    snippet.textContent =
`Local:
  export MASTER_KEY="your-long-random-secret"

Docker Compose:
  environment:
    - MASTER_KEY=your-long-random-secret`;
    snippet.classList.remove("hidden");
  }
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
  return data;
}

function buildForm(schema) {
  const form = el("provisionForm");
  form.innerHTML = "";

  const fields = schema.fields || [];
  for (const f of fields) {
    const wrap = document.createElement("div");

    const label = document.createElement("label");
    label.className = "block text-sm font-medium text-gray-700 mb-1";
    label.textContent = f.label || f.name;

    const input = document.createElement("input");
    input.name = f.name;
    input.type = f.type || "text";
    input.required = !!f.required;
    input.className = "w-full px-3 py-2 rounded-lg border bg-white";
    input.autocomplete = "off";

    wrap.appendChild(label);
    wrap.appendChild(input);
    form.appendChild(wrap);
  }
}

async function main() {
  el("goProvision").addEventListener("click", async () => {
    el("provisionError").classList.add("hidden");
    el("provisionSuccess").classList.add("hidden");

    const schema = await fetchJson("/api/config-schema");
    buildForm(schema);
    show("view-provision");
  });

  el("backToDashboard").addEventListener("click", () => show("view-dashboard"));

  el("submitProvision").addEventListener("click", async (e) => {
    e.preventDefault();
    el("provisionError").classList.add("hidden");
    el("provisionSuccess").classList.add("hidden");

    const fd = new FormData(el("provisionForm"));
    const payload = {};
    for (const [k, v] of fd.entries()) payload[k] = v;

    try {
      const out = await fetchJson("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      el("apiKeyOut").value = out.apiKey || "";
      el("provisionSuccess").classList.remove("hidden");
    } catch (err) {
      el("provisionError").textContent = err.message || String(err);
      el("provisionError").classList.remove("hidden");
    }
  });

  el("copyKey").addEventListener("click", async () => {
    const v = el("apiKeyOut").value;
    if (!v) return;
    await navigator.clipboard.writeText(v);
  });

  try {
    const status = await fetchJson("/api/master-key-status");
    setBanner(!!status.configured);
  } catch {
    setBanner(false);
  }

  show("view-dashboard");
}

main();
