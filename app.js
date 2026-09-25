const state = { people: [], items: [] };
let detectedItems = [];
const PEOPLE_STORAGE_KEY = "tablesplit-people";
const $ = (id) => document.getElementById(id);
const money = (value) => `₹${value.toFixed(2)}`;

function savePeople() {
  localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(state.people));
}

function loadPeople() {
  try {
    const savedPeople = JSON.parse(localStorage.getItem(PEOPLE_STORAGE_KEY) || "[]");
    if (Array.isArray(savedPeople)) {
      state.people = savedPeople
        .filter((person) => person && typeof person.name === "string")
        .map((person) => ({ name: person.name.trim() }))
        .filter((person) => person.name);
    }
  } catch (error) {
    localStorage.removeItem(PEOPLE_STORAGE_KEY);
  }
}

function renderPeople() {
  $("personCount").textContent = `${state.people.length} ${state.people.length === 1 ? "person" : "people"}`;
  $("peopleList").innerHTML = state.people.length
    ? state.people.map((person, index) => `<div class="person-row">
        <div class="person-info"><span class="avatar">${escapeHtml(person.name.slice(0, 2).toUpperCase())}</span><span class="person-name">${escapeHtml(person.name)}</span></div>
        <button class="delete-button" type="button" aria-label="Remove ${escapeHtml(person.name)}" data-remove-person="${index}">&times;</button>
      </div>`).join("")
    : '<p class="empty-state">Add everyone sharing the bill.</p>';

  const select = $("itemPeople");
  select.innerHTML = state.people.map((person, index) => `<option value="${index}">${escapeHtml(person.name)}</option>`).join("");
  state.items.forEach((item) => item.people = item.people.filter((index) => index < state.people.length));
  renderItems();
  renderSummary();
}

function renderItems() {
  $("itemCount").textContent = `${state.items.length} ${state.items.length === 1 ? "item" : "items"}`;
  $("itemsList").innerHTML = state.items.length
    ? state.items.map((item, index) => {
      const eaters = item.people.map((personIndex) => state.people[personIndex]?.name).filter(Boolean).join(", ");
      return `<div class="item-row">
        <div class="item-info"><span class="item-tag ${item.category}">${item.category === "veg" ? "VEG" : "NON-VEG"}</span><div><div class="item-name">${escapeHtml(item.name)}</div><span class="summary-detail">${escapeHtml(eaters || "No one assigned")}</span></div></div>
        <div class="item-info"><span class="item-price">${item.quantity > 1 ? `Qty: ${item.quantity} · ` : ""}${money(item.price * (item.quantity || 1))}</span><button class="delete-button" type="button" aria-label="Remove ${escapeHtml(item.name)}" data-remove-item="${index}">&times;</button></div>
      </div>`;
    }).join("")
    : '<p class="empty-state">Your dishes will show up here.</p>';
}

function renderSummary() {
  const subtotal = state.items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const taxRate = Math.max(0, Number($("taxRate").value) || 0);
  const tipRate = Math.max(0, Number($("tipRate").value) || 0);
  const discountRate = Math.max(0, Number($("discountRate").value) || 0);
  const discount = subtotal * discountRate / 100;
  const discountedSubtotal = subtotal - discount;
  const tax = discountedSubtotal * taxRate / 100;
  const tip = discountedSubtotal * tipRate / 100;
  const sharedChargePerPerson = state.people.length ? (tax + tip) / state.people.length : 0;
  $("discountStatus").textContent = discountRate ? `${discountRate}% discount applied to food.` : "Choose a restaurant offer.";
  $("totals").innerHTML = `<div><span>Food total</span><strong>${money(subtotal)}</strong></div>
    <div><span>Discount applied <small>(${discountRate}%)</small></span><strong>−${money(discount)}</strong></div>
    <div><span>Tax <small id="taxLabel">(${taxRate}%)</small></span><strong>${money(tax)}</strong></div>
    <div><span>Tip <small id="tipLabel">(${tipRate}%)</small></span><strong>${money(tip)}</strong></div>
    <div class="grand-total"><span>Total bill</span><strong>${money(subtotal + tax + tip)}</strong></div>`;

  $("summaryTable").innerHTML = state.people.length
    ? state.people.map((person, personIndex) => {
      const dishes = state.items.filter((item) => item.people.includes(personIndex));
      const food = dishes.reduce((sum, item) => sum + (item.price * (item.quantity || 1)) / item.people.length, 0) * (1 - discountRate / 100);
      return `<div class="summary-row"><div><span class="summary-person">${escapeHtml(person.name)}</span><span class="summary-detail">${dishes.length ? `${dishes.length} ${dishes.length === 1 ? "item" : "items"} · tax and tip shared equally` : "No items assigned"}</span></div><span class="summary-amount">${money(food + sharedChargePerPerson)}</span></div>`;
    }).join("")
    : '<p class="empty-state">Add people and items to see the split.</p>';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

$("personForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("personName").value.trim();
  if (!name) return;
  state.people.push({ name });
  savePeople();
  $("personName").value = "";
  renderPeople();
  $("personName").focus();
});

$("itemForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("itemName").value.trim();
  const price = Number($("itemPrice").value);
  const quantity = Math.max(1, Math.floor(Number($("itemQuantity").value) || 1));
  const people = [...$("itemPeople").selectedOptions].map((option) => Number(option.value));
  if (!name || !Number.isFinite(price) || price <= 0 || !people.length) {
    $("itemName").reportValidity();
    if (!name) $("itemName").focus();
    else if (!Number.isFinite(price) || price <= 0) $("itemPrice").focus();
    else $("itemPeople").focus();
    return;
  }
  state.items.push({ name, price, quantity, category: document.querySelector('input[name="category"]:checked').value, people });
  $("itemName").value = "";
  $("itemPrice").value = "";
  $("itemQuantity").value = "1";
  $("itemPeople").selectedIndex = -1;
  renderItems();
  renderSummary();
});

document.addEventListener("click", (event) => {
  const personButton = event.target.closest("[data-remove-person]");
  const itemButton = event.target.closest("[data-remove-item]");
  if (personButton) {
    const removedIndex = Number(personButton.dataset.removePerson);
    state.people.splice(removedIndex, 1);
    savePeople();
    state.items.forEach((item) => item.people = item.people.filter((index) => index !== removedIndex).map((index) => index > removedIndex ? index - 1 : index));
    renderPeople();
  }
  if (itemButton) {
    state.items.splice(Number(itemButton.dataset.removeItem), 1);
    renderItems();
    renderSummary();
  }
});

$("taxRate").addEventListener("input", renderSummary);
$("tipRate").addEventListener("input", renderSummary);
$("discountRate").addEventListener("change", renderSummary);
$("billImage").addEventListener("change", scanBill);
$("resetButton").addEventListener("click", () => {
  state.people.length = 0;
  state.items.length = 0;
  localStorage.removeItem(PEOPLE_STORAGE_KEY);
  $("taxRate").value = 10;
  $("tipRate").value = 10;
  $("discountRate").value = 0;
  loadPeople();
  renderPeople();
});

async function scanBill(event) {
    const image = event.target.files[0];
    if (!image) return;
    if (!window.Tesseract) {
      $("scanStatus").textContent = "The scanner is unavailable. Check your internet connection and try again.";
      return;
    }
    $("scanStatus").textContent = "Finding food items… this can take a few seconds.";
    $("detectedList").innerHTML = "";
    try {
      const result = await Tesseract.recognize(image, "eng", {
        logger: (message) => {
          if (message.status === "recognizing text" && message.progress) {
            $("scanStatus").textContent = `Finding food items… ${Math.round(message.progress * 100)}%`;
          }
        }
      });
      detectedItems = parseBillLines(result.data.text);
      renderDetectedItems();
      $("scanStatus").textContent = detectedItems.length
        ? `${detectedItems.length} food item${detectedItems.length === 1 ? "" : "s"} found. Review each one before adding.`
        : "No food items found. Try a sharper, better-lit photo.";
    } catch (error) {
      $("scanStatus").textContent = "Couldn’t find food items in that image. Try a clearer photo.";
    }
}

function parseBillLines(text) {
    const excluded = /subtotal|grand total|total due|amount due|total|tax|gst|service charge|discount|tip|change|cash|card|thank|invoice|receipt|bill no|order no|table|date|time|phone|tel|address|www|thank you|veg total|non.?veg total|server|waiter|waitress|guest|covers?|ref(?:erence)?|cashier|payment|method|receipt no/i;
    return text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim())
      .map((line) => {
        const priceMatch = line.match(/(?:₹|rs\.?|inr|\$)?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*$/i);
        if (!priceMatch || excluded.test(line)) return null;
        const beforePrice = line.slice(0, priceMatch.index).replace(/^[\d.)#-]+\s*/, "").replace(/[|:*-]+$/, "").trim();
        const quantityMatch = beforePrice.match(/^(\d+)\s*[x×*]\s*(.+)$/i);
        const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
        const name = quantityMatch ? quantityMatch[2].trim() : beforePrice;
        const price = Number(priceMatch[1].replace(",", "."));
        const normalizedName = name.replace(/[^\w\s]/g, "").trim();
        const hasFoodText = /[a-z]{3,}/i.test(normalizedName);
        const metadataOnly = /^(?:mr|mrs|ms|server|guest|guests|ref|reference|total|subtotal|tax|gst|amount|due|cash|card|date|time|no|number)$/i.test(normalizedName);
        return hasFoodText && !metadataOnly && normalizedName.length >= 3 && Number.isFinite(price) && price > 0
          ? { name: normalizedName, price, quantity }
          : null;
      }).filter(Boolean);
}

function renderDetectedItems() {
    $("detectedList").innerHTML = detectedItems.map((item, index) => `<div class="detected-row">
      <span>${item.quantity > 1 ? `Qty: ${item.quantity} · ` : ""}${escapeHtml(item.name)}</span><strong>${money(item.price)}</strong><button type="button" ${item.used ? "disabled" : `data-use-detected="${index}"`}>${item.used ? "Used" : "Use"}</button>
    </div>`).join("");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-use-detected]");
  if (!button) return;
  const item = detectedItems[Number(button.dataset.useDetected)];
  if (!item) return;
  $("itemName").value = item.name;
  $("itemPrice").value = item.price.toFixed(2);
  $("itemQuantity").value = item.quantity;
  $("itemName").focus();
  item.used = true;
  renderDetectedItems();
  $("scanStatus").textContent = `${item.name} marked as Used. Assign diners and add it to the bill.`;
});

renderPeople();
