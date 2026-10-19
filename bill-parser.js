/*
 * Turns OCR text from a restaurant bill into likely food items.
 * Works in the browser (window.BillParser) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BillParser = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // Whole-word matches only, so "Vegetable biryani" isn't mistaken for the word "table".
  const EXCLUDED_LINE = new RegExp(
    "\\b(?:sub\\s?total|grand total|total due|amount due|total|tax|gst|cgst|sgst|igst|vat|service charge|discount|tip|change|cash|card|thank you|thanks|thank|invoice|receipt|bill no|order no|table|date|time|phone|tel|address|www|veg total|non.?veg total|server|waiter|waitress|guest|covers?|ref(?:erence)?|cashier|payment|method|receipt no)\\b",
    "i"
  );
  const METADATA_ONLY = /^(?:mr|mrs|ms|server|guest|guests|ref|reference|total|subtotal|tax|gst|amount|due|cash|card|date|time|no|number)$/i;

  function parsePrice(token) {
    const value = token.trim();
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(value)) return Number(value.replace(/,/g, "")); // 1,250.00
    if (/^\d+,\d{1,2}$/.test(value)) return Number(value.replace(",", ".")); // 12,50
    if (/^\d+(\.\d{1,2})?$/.test(value)) return Number(value);
    return NaN;
  }

  function parseBillLines(text) {
    return String(text)
      .split(/\r?\n/)
      .map((raw) => raw.replace(/\s+/g, " ").trim())
      .map((line) => {
        const priceMatch = line.match(/(?:₹|rs\.?|inr|\$)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*$/i);
        if (!priceMatch || EXCLUDED_LINE.test(line)) return null;
        const price = parsePrice(priceMatch[1]);
        let rest = line.slice(0, priceMatch.index).replace(/[|:*\-–]+$/, "").trim();
        let quantity = 1;
        const quantityMatch = rest.match(/^(\d{1,3})\s*[x×*]\s*(.+)$/i) || rest.match(/^(\d{1,2})\s+([a-z].+)$/i);
        if (quantityMatch) {
          quantity = Number(quantityMatch[1]);
          rest = quantityMatch[2];
        } else {
          rest = rest.replace(/^(?:#?\d+\s*[.)\-]|#\d+)\s*/, ""); // serial numbers like "1." or "2)"
        }
        const name = rest.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
        const valid = /[a-z]{3,}/i.test(name) && !METADATA_ONLY.test(name) && name.length >= 3 && price > 0 && quantity >= 1;
        return valid ? { name, price, quantity } : null;
      })
      .filter(Boolean);
  }

  return { parseBillLines, parsePrice };
});
