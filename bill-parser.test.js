const test = require("node:test");
const assert = require("node:assert/strict");
const { parseBillLines, parsePrice } = require("./bill-parser.js");

test("parsePrice handles Indian-style thousands and decimals", () => {
  assert.equal(parsePrice("1,250.00"), 1250);
  assert.equal(parsePrice("12,50"), 12.5);
  assert.equal(parsePrice("80"), 80);
  assert.ok(Number.isNaN(parsePrice("1,2,3")));
});

test("keeps food lines and drops totals, taxes and metadata", () => {
  const text = [
    "Bill No 4821",
    "Paneer Tikka 220.00",
    "Butter Naan 45",
    "Subtotal 265.00",
    "CGST 2.5% 6.63",
    "Grand Total 278.25",
  ].join("\n");
  assert.deepEqual(parseBillLines(text), [
    { name: "Paneer Tikka", price: 220, quantity: 1 },
    { name: "Butter Naan", price: 45, quantity: 1 },
  ]);
});

test("does not discard dishes whose names merely contain a keyword", () => {
  const names = parseBillLines(["Vegetable Biryani 240", "Cashew Curry 310", "Cardamom Tea 60", "Dates Shake 120"].join("\n")).map((i) => i.name);
  assert.deepEqual(names, ["Vegetable Biryani", "Cashew Curry", "Cardamom Tea", "Dates Shake"]);
});

test("reads quantities written as '2 x Item' and '2 Item'", () => {
  assert.deepEqual(parseBillLines("2 x Butter Naan 90"), [{ name: "Butter Naan", price: 90, quantity: 2 }]);
  assert.deepEqual(parseBillLines("3 Masala Dosa 210"), [{ name: "Masala Dosa", price: 210, quantity: 3 }]);
});

test("strips serial numbers and reads thousands separators", () => {
  assert.deepEqual(parseBillLines("1. Chicken Biryani 1,250.00"), [{ name: "Chicken Biryani", price: 1250, quantity: 1 }]);
  assert.deepEqual(parseBillLines("2) Lassi ₹80"), [{ name: "Lassi", price: 80, quantity: 1 }]);
});

test("ignores lines with no price or no real name", () => {
  assert.deepEqual(parseBillLines("Thank you for dining with us\n12\n--- 45"), []);
});
