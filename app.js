(function () {
  "use strict";

  const { toPaise, calculateSplit } = window.SplitMath;
  const { parseBillLines } = window.BillParser;

  const STORAGE_KEY = "tablesplit-state-v2";
  const LEGACY_PEOPLE_KEY = "tablesplit-people";
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const DEFAULTS = { taxRate: 10, tipRate: 10, discountRate: 0, shareMode: "equal" };

  // Every person gets their own plate colour. `on` is the readable text colour on top of it.
  const PLATES = [
    { bg: "#ffb400", on: "#1b1400" }, // marigold
    { bg: "#d93a22", on: "#ffffff" }, // chilli
    { bg: "#178a4a", on: "#ffffff" }, // leaf
    { bg: "#3f51d9", on: "#ffffff" }, // indigo
    { bg: "#d3277f", on: "#ffffff" }, // rani pink
    { bg: "#0b8590", on: "#ffffff" }, // teal
    { bg: "#7b4ddb", on: "#ffffff" }, // violet
    { bg: "#1478cc", on: "#ffffff" }, // sky
  ];

  const $ = (id) => document.getElementById(id);
  const numberFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (paise) => `₹${numberFormat.format(paise / 100)}`;
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const state = { people: [], items: [], ...DEFAULTS };
  let selected = new Set(); // diner ids ticked in the dish form
  let focusId = null; // person whose plate is open in the detail panel
  let editingId = null;
  let detectedItems = [];
  let lastResult = null;
  let statusTimer = null;

  const personById = (id) => state.people.find((p) => p.id === id);
  const colorVars = (person) => {
    const plate = PLATES[person.color % PLATES.length];
    return `--c:${plate.bg};--on:${plate.on}`;
  };

  function nextColor() {
    const used = new Set(state.people.map((p) => p.color));
    for (let i = 0; i < PLATES.length; i++) if (!used.has(i)) return i;
    return state.people.length % PLATES.length;
  }

  /* ---------- persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* storage can be blocked (private mode); the app still works for this visit */
    }
  }

  function cleanRate(value, fallback, max = Infinity) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.min(max, number) : fallback;
  }

  function addPersonRecord(id, name, color) {
    const valid = Number.isInteger(color) && color >= 0;
    state.people.push({ id, name: name.trim().slice(0, 24), color: valid ? color % PLATES.length : nextColor() });
  }

  function restore(saved) {
    if (!saved || typeof saved !== "object") return;
    state.people = [];
    (Array.isArray(saved.people) ? saved.people : [])
      .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && p.name.trim())
      .forEach((p) => addPersonRecord(p.id, p.name, p.color));
    const ids = new Set(state.people.map((p) => p.id));
    state.items = (Array.isArray(saved.items) ? saved.items : [])
      .filter((i) => i && typeof i.name === "string" && Number(i.price) > 0)
      .map((i) => ({
        id: typeof i.id === "string" ? i.id : uid(),
        name: i.name.slice(0, 40),
        price: Number(i.price),
        quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
        category: i.category === "nonveg" ? "nonveg" : "veg",
        people: Array.isArray(i.people) ? i.people.filter((id) => ids.has(id)) : [],
      }));
    state.taxRate = cleanRate(saved.taxRate, DEFAULTS.taxRate);
    state.tipRate = cleanRate(saved.tipRate, DEFAULTS.tipRate);
    state.discountRate = cleanRate(saved.discountRate, DEFAULTS.discountRate, 100);
    state.shareMode = saved.shareMode === "proportional" ? "proportional" : "equal";
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return restore(JSON.parse(raw));
      // Carry over the people list saved by the first version of the app.
      const legacy = JSON.parse(localStorage.getItem(LEGACY_PEOPLE_KEY) || "[]");
      if (Array.isArray(legacy)) {
        legacy.filter((p) => p && typeof p.name === "string" && p.name.trim()).forEach((p) => addPersonRecord(uid(), p.name));
      }
    } catch (error) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (ignored) { /* nothing to do */ }
    }
  }

  /* ---------- rendering ---------- */

  function syncControls() {
    $("taxRate").value = state.taxRate;
    $("tipRate").value = state.tipRate;
    $("discountRate").value = state.discountRate;
    document.querySelectorAll('input[name="shareMode"]').forEach((radio) => { radio.checked = radio.value === state.shareMode; });
  }

  function renderPeople() {
    $("personCount").textContent = plural(state.people.length, "person", "people");
    renderChips();
  }

  function renderChips() {
    selected = new Set([...selected].filter((id) => personById(id)));
    $("itemPeople").innerHTML = state.people.length
      ? state.people.map((person) => `<label class="chip" style="${colorVars(person)}"><input type="checkbox" value="${escapeHtml(person.id)}" ${selected.has(person.id) ? "checked" : ""} /><span>${escapeHtml(person.name)}</span></label>`).join("")
      : '<span class="chip-empty">Add people first</span>';
    const everyone = $("selectEveryone");
    everyone.hidden = !state.people.length;
    everyone.textContent = state.people.length && selected.size === state.people.length ? "Clear" : "Everyone";
  }

  function renderItems() {
    $("itemCount").textContent = plural(state.items.length, "item", "items");
    $("itemsList").innerHTML = state.items.length
      ? state.items.map((item) => {
          const eaters = item.people.map(personById).filter(Boolean);
          const line = toPaise(item.price) * item.quantity;
          const dots = eaters.map((p) => `<i class="dot" style="${colorVars(p)}"></i>`).join("");
          return `<div class="item-row${item.id === editingId ? " is-editing" : ""}">
            <span class="diet ${item.category}" role="img" aria-label="${item.category === "veg" ? "Vegetarian" : "Non-vegetarian"}"></span>
            <div class="item-text"><div class="item-name">${escapeHtml(item.name)}</div><div class="item-meta">${dots ? `<span class="eaters">${dots}</span>` : ""}<span class="summary-detail${eaters.length ? "" : " warn"}">${escapeHtml(eaters.length ? eaters.map((p) => p.name).join(", ") : "No one assigned")}</span></div></div>
            <div class="item-amount"><span class="item-price">${money(line)}</span>${item.quantity > 1 ? `<span class="summary-detail">${item.quantity} × ${money(toPaise(item.price))}</span>` : ""}</div>
            <div class="item-actions"><button class="icon-button" type="button" aria-label="Edit ${escapeHtml(item.name)}" data-edit-item="${escapeHtml(item.id)}">Edit</button>
              <button class="delete-button" type="button" aria-label="Remove ${escapeHtml(item.name)}" data-remove-item="${escapeHtml(item.id)}">&times;</button></div>
          </div>`;
        }).join("")
      : '<p class="empty-state">Dishes you add will be listed here.</p>';
  }

  const hasBill = () => state.people.length > 0 && state.items.length > 0;

  function compute() {
    return calculateSplit({
      people: state.people,
      items: state.items,
      taxRate: state.taxRate,
      tipRate: state.tipRate,
      discountRate: state.discountRate,
      shareMode: state.shareMode,
    });
  }

  function renderTable(result) {
    const people = result.perPerson;
    const maxTotal = Math.max(0, ...people.map((p) => p.total));
    if (!people.some((p) => p.id === focusId)) focusId = people.length ? people[0].id : null;

    // Plates grow with what each person owes, so the table shows who ate most at a glance.
    $("peopleList").innerHTML = people.length
      ? people.map((person) => {
          const meta = personById(person.id);
          const size = maxTotal > 0 ? Math.round(98 + 54 * Math.sqrt(person.total / maxTotal)) : 118;
          const name = escapeHtml(person.name);
          return `<div class="plate-wrap" style="--d:${size}px;${colorVars(meta)}">
            <button type="button" class="plate${person.id === focusId ? " is-focus" : ""}" data-plate="${escapeHtml(person.id)}" aria-pressed="${person.id === focusId}" aria-label="${name}${maxTotal > 0 ? `, ${money(person.total)}` : ""}. Show what is on this plate">
              <span class="plate-name">${name}</span>${maxTotal > 0 ? `<span class="plate-amount">${money(person.total)}</span>` : ""}
            </button>
            <button type="button" class="plate-remove" aria-label="Remove ${name}" data-remove-person="${escapeHtml(person.id)}">&times;</button>
          </div>`;
        }).join("")
      : '<div class="ghost-plates" aria-hidden="true"><i></i><i></i><i></i></div><p class="empty-state">Add the people sharing this bill. Each person gets a plate.</p>';

    const focus = people.find((p) => p.id === focusId);
    let html = "";
    if (focus) {
      const name = escapeHtml(focus.name);
      const dishLines = focus.lines.map((line) => `<li><span>${escapeHtml(line.name)}${line.quantity > 1 ? ` ×${line.quantity}` : ""}${line.sharedWith > 1 ? ` <small>shared by ${line.sharedWith}</small>` : ""}</span><span>${money(line.share)}</span></li>`).join("");
      html += `<div class="detail-card" style="${colorVars(personById(focus.id))}">
        <div class="detail-head"><h3>${name}’s plate</h3><strong>${money(focus.total)}</strong></div>
        ${focus.lines.length
          ? `<ul class="breakdown">${dishLines}
              ${focus.discount ? `<li class="muted"><span>Discount</span><span>−${money(focus.discount)}</span></li>` : ""}
              <li class="muted"><span>Tax</span><span>${money(focus.tax)}</span></li>
              <li class="muted"><span>Tip</span><span>${money(focus.tip)}</span></li>
            </ul>
            <p class="detail-note">Tax and tip ${state.shareMode === "proportional" ? "follow what each person ordered." : "are shared equally."}</p>`
          : `<p class="empty-state">Nothing on this plate yet. Tick ${name} on a dish to add it.</p>`}
      </div>`;
    }
    const orphans = state.items.filter((item) => !item.people.length).map((item) => item.name);
    if (result.unassigned > 0) {
      html += `<div class="warning" role="status"><strong>${money(result.unassigned)}</strong> isn’t on anyone’s plate (${escapeHtml(orphans.join(", "))}). Edit ${orphans.length === 1 ? "that dish" : "those dishes"} so every rupee has an owner.</div>`;
    }
    $("summaryTable").innerHTML = html;
    $("summaryTable").hidden = !html;
  }

  function renderSummary() {
    const result = (lastResult = compute());

    $("totals").innerHTML = [
      `<div><span>Food</span><strong>${money(result.foodTotal)}</strong></div>`,
      result.discount ? `<div><span>Discount <small>(${state.discountRate}%)</small></span><strong>−${money(result.discount)}</strong></div>` : "",
      `<div><span>Tax <small>(${state.taxRate}%)</small></span><strong>${money(result.tax)}</strong></div>`,
      `<div><span>Tip <small>(${state.tipRate}%)</small></span><strong>${money(result.tip)}</strong></div>`,
      `<div class="grand-total"><span>Total bill</span><strong><mark>${money(result.grandTotal)}</mark></strong></div>`,
    ].join("");

    renderTable(result);

    const copy = $("copyButton");
    const share = $("whatsappButton");
    copy.disabled = !hasBill();
    share.setAttribute("aria-disabled", String(!hasBill()));
    share.classList.toggle("is-disabled", !hasBill());
    share.href = hasBill() ? `https://wa.me/?text=${encodeURIComponent(buildSummaryText(result))}` : "#";
  }

  function renderAll() {
    renderPeople();
    renderItems();
    renderSummary();
  }

  function buildSummaryText(result) {
    const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const lines = [`TableSplit, ${date}`, ""];
    result.perPerson.forEach((person) => lines.push(`${person.name}: ${money(person.total)}`));
    if (result.unassigned > 0) lines.push(`Unassigned food: ${money(result.unassigned)}`);
    lines.push("", `Food ${money(result.foodTotal)}`);
    if (result.discount) lines.push(`Discount (${state.discountRate}%) −${money(result.discount)}`);
    lines.push(`Tax (${state.taxRate}%) ${money(result.tax)}`, `Tip (${state.tipRate}%) ${money(result.tip)}`);
    lines.push(`Total ${money(result.grandTotal)}`, `Tax and tip ${state.shareMode === "proportional" ? "split by food ordered" : "split equally"}.`);
    return lines.join("\n");
  }

  /* ---------- small helpers ---------- */

  function showError(id, message) {
    $(id).textContent = message;
  }

  function setActionStatus(message) {
    $("actionStatus").textContent = message;
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(() => { $("actionStatus").textContent = ""; }, 3500);
  }

  function clearItemForm() {
    $("itemName").value = "";
    $("itemPrice").value = "";
    $("itemQuantity").value = "1";
    document.querySelector('input[name="category"][value="veg"]').checked = true;
    selected = new Set();
    renderChips();
  }

  function exitEdit() {
    editingId = null;
    $("itemSubmit").textContent = "Add dish";
    $("cancelEdit").hidden = true;
    clearItemForm();
    renderItems();
  }

  /* ---------- people ---------- */

  $("personForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("personName").value.trim().replace(/\s+/g, " ");
    if (!name) return showError("personError", "Enter a name to add.");
    if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return showError("personError", `${name} is already at the table. Add a last initial to tell them apart.`);
    }
    showError("personError", "");
    addPersonRecord(uid(), name);
    save();
    $("personName").value = "";
    renderAll();
    $("personName").focus();
  });
  $("personName").addEventListener("input", () => showError("personError", ""));

  function removePerson(id) {
    const person = personById(id);
    if (!person) return;
    const dishes = state.items.filter((item) => item.people.includes(id)).length;
    if (dishes && !window.confirm(`Remove ${person.name}? ${plural(dishes, "dish is", "dishes are")} on their plate.`)) return;
    state.people = state.people.filter((p) => p.id !== id);
    state.items.forEach((item) => { item.people = item.people.filter((pid) => pid !== id); });
    if (focusId === id) focusId = null;
    save();
    renderAll();
  }

  /* ---------- items ---------- */

  $("itemPeople").addEventListener("change", (event) => {
    const box = event.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) selected.add(box.value); else selected.delete(box.value);
    showError("itemError", "");
    renderChips();
    $("itemPeople").querySelector(`input[value="${CSS.escape(box.value)}"]`)?.focus();
  });

  $("selectEveryone").addEventListener("click", () => {
    selected = selected.size === state.people.length ? new Set() : new Set(state.people.map((p) => p.id));
    showError("itemError", "");
    renderChips();
  });

  $("itemForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("itemName").value.trim();
    const price = Number($("itemPrice").value);
    const quantity = Math.max(1, Math.floor(Number($("itemQuantity").value) || 1));
    let problem = null;
    let focusField = null;
    if (!name) { problem = "Enter the dish or drink name."; focusField = "itemName"; }
    else if (!(price > 0)) { problem = "Enter a price above zero."; focusField = "itemPrice"; }
    else if (!state.people.length) { problem = "Add at least one person first."; focusField = "personName"; }
    else if (!selected.size) { problem = "Tap the names of everyone who ate this."; }
    if (problem) {
      showError("itemError", problem);
      if (focusField) $(focusField).focus();
      return;
    }
    showError("itemError", "");
    const item = {
      id: editingId || uid(),
      name,
      price: Math.round(price * 100) / 100,
      quantity,
      category: document.querySelector('input[name="category"]:checked').value,
      people: state.people.filter((p) => selected.has(p.id)).map((p) => p.id),
    };
    const existing = state.items.findIndex((i) => i.id === editingId);
    if (editingId && existing >= 0) state.items[existing] = item;
    else state.items.push(item);
    save();
    if (editingId) exitEdit(); else clearItemForm();
    renderItems();
    renderSummary();
    $("itemName").focus();
  });
  ["itemName", "itemPrice", "itemQuantity"].forEach((id) => $(id).addEventListener("input", () => showError("itemError", "")));

  function startEdit(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    editingId = id;
    $("itemName").value = item.name;
    $("itemPrice").value = item.price;
    $("itemQuantity").value = item.quantity;
    document.querySelector(`input[name="category"][value="${item.category}"]`).checked = true;
    selected = new Set(item.people);
    renderChips();
    $("itemSubmit").textContent = "Save dish";
    $("cancelEdit").hidden = false;
    showError("itemError", "");
    renderItems();
    $("itemForm").scrollIntoView({ behavior: "smooth", block: "center" });
    $("itemName").focus();
  }

  $("cancelEdit").addEventListener("click", exitEdit);

  function removeItem(id) {
    if (id === editingId) exitEdit();
    state.items = state.items.filter((i) => i.id !== id);
    save();
    renderItems();
    renderSummary();
  }

  document.addEventListener("click", (event) => {
    const plateButton = event.target.closest("[data-plate]");
    const personButton = event.target.closest("[data-remove-person]");
    const itemButton = event.target.closest("[data-remove-item]");
    const editButton = event.target.closest("[data-edit-item]");
    if (plateButton) {
      focusId = plateButton.dataset.plate;
      renderSummary();
      document.querySelector(`[data-plate="${CSS.escape(focusId)}"]`)?.focus();
    } else if (personButton) removePerson(personButton.dataset.removePerson);
    else if (itemButton) removeItem(itemButton.dataset.removeItem);
    else if (editButton) startEdit(editButton.dataset.editItem);
  });

  /* ---------- tax, tip, discount, sharing ---------- */

  [["taxRate", "taxRate", Infinity], ["tipRate", "tipRate", Infinity], ["discountRate", "discountRate", 100]].forEach(([id, key, max]) => {
    $(id).addEventListener("input", () => {
      state[key] = cleanRate($(id).value, 0, max);
      save();
      renderSummary();
    });
    $(id).addEventListener("blur", () => { $(id).value = state[key]; });
  });

  document.querySelectorAll('input[name="shareMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.shareMode = radio.value;
      save();
      renderSummary();
    });
  });

  $("copyButton").addEventListener("click", async () => {
    if (!hasBill()) return;
    const text = buildSummaryText(lastResult);
    try {
      await navigator.clipboard.writeText(text);
      setActionStatus("Summary copied. Paste it into your group chat.");
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch (ignored) { /* fall through */ }
      area.remove();
      setActionStatus(copied ? "Summary copied. Paste it into your group chat." : "Couldn’t copy automatically. Use Share on WhatsApp instead.");
    }
  });

  $("whatsappButton").addEventListener("click", (event) => {
    if (!hasBill()) event.preventDefault();
  });

  $("resetButton").addEventListener("click", () => {
    if (state.items.length && !window.confirm("Start a new bill? Dishes and rates reset, but everyone stays at the table.")) return;
    Object.assign(state, DEFAULTS, { items: [] });
    detectedItems = [];
    $("detectedList").innerHTML = "";
    $("scanStatus").textContent = "";
    $("scanNote").hidden = true;
    showError("itemError", "");
    setActionStatus("");
    save();
    syncControls();
    exitEdit();
    renderSummary();
  });

  /* ---------- bill photo scanning ---------- */

  let tesseractPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!tesseractPromise) {
      tesseractPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = TESSERACT_URL;
        script.onload = resolve;
        script.onerror = () => { tesseractPromise = null; script.remove(); reject(new Error("load failed")); };
        document.head.appendChild(script);
      });
    }
    return tesseractPromise;
  }

  $("billImage").addEventListener("change", async (event) => {
    const input = event.target;
    const image = input.files[0];
    if (!image) return;
    $("detectedList").innerHTML = "";
    $("scanNote").hidden = true;
    $("scanStatus").textContent = "Loading the scanner…";
    try {
      await loadTesseract();
    } catch (error) {
      $("scanStatus").textContent = "The scanner is unavailable. Check your internet connection and try again.";
      input.value = "";
      return;
    }
    $("scanStatus").textContent = "Finding food items… this can take a few seconds.";
    try {
      const result = await Tesseract.recognize(image, "eng", {
        logger: (message) => {
          if (message.status === "recognizing text" && message.progress) {
            $("scanStatus").textContent = `Finding food items… ${Math.round(message.progress * 100)}%`;
          }
        },
      });
      detectedItems = parseBillLines(result.data.text);
      renderDetectedItems();
      $("scanNote").hidden = !detectedItems.length;
      $("scanStatus").textContent = detectedItems.length
        ? `${plural(detectedItems.length, "food item", "food items")} found. Review each one before adding.`
        : "No food items found. Try a sharper, better-lit photo.";
    } catch (error) {
      $("scanStatus").textContent = "Couldn’t find food items in that image. Try a clearer photo.";
    } finally {
      input.value = ""; // lets the same photo be chosen again
    }
  });

  function renderDetectedItems() {
    $("detectedList").innerHTML = detectedItems.map((item, index) => `<div class="detected-row">
      <span>${item.quantity > 1 ? `Qty: ${item.quantity} · ` : ""}${escapeHtml(item.name)}</span><strong>${money(toPaise(item.price))}</strong><button type="button" ${item.used ? "disabled" : `data-use-detected="${index}"`}>${item.used ? "Used" : "Use"}</button>
    </div>`).join("");
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-use-detected]");
    if (!button) return;
    const item = detectedItems[Number(button.dataset.useDetected)];
    if (!item) return;
    if (editingId) exitEdit();
    $("itemName").value = item.name;
    $("itemPrice").value = item.price.toFixed(2);
    $("itemQuantity").value = item.quantity;
    $("itemName").focus();
    item.used = true;
    renderDetectedItems();
    $("scanStatus").textContent = `${item.name} marked as used. Tap who ate it, then add the dish.`;
  });

  /* ---------- start ---------- */

  load();
  syncControls();
  renderAll();
})();
