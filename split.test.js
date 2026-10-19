const test = require("node:test");
const assert = require("node:assert/strict");
const { allocate, calculateSplit, toPaise } = require("./split.js");

const people = [
  { id: "a", name: "Asha" },
  { id: "b", name: "Bilal" },
  { id: "c", name: "Chen" },
];
const sum = (values) => values.reduce((a, b) => a + b, 0);

test("toPaise avoids floating point drift", () => {
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(toPaise(19.99), 1999);
});

test("allocate always sums to the total", () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(sum(allocate(1001, [3, 5, 7, 11])), 1001);
  assert.deepEqual(allocate(10, [0, 0]), [5, 5]);
  assert.deepEqual(allocate(5, []), []);
});

test("shared dish is split only between its eaters", () => {
  const result = calculateSplit({
    people,
    items: [{ name: "Naan", price: 100, quantity: 2, people: ["a", "b"] }],
  });
  assert.equal(result.foodTotal, 20000);
  assert.equal(result.perPerson[0].food, 10000);
  assert.equal(result.perPerson[1].food, 10000);
  assert.equal(result.perPerson[2].food, 0);
});

test("per-person totals add up exactly to the bill, even with awkward numbers", () => {
  const result = calculateSplit({
    people,
    items: [
      { name: "Thali", price: 333.33, quantity: 1, people: ["a", "b", "c"] },
      { name: "Lassi", price: 77.77, quantity: 3, people: ["a", "c"] },
      { name: "Kebab", price: 199.99, quantity: 1, people: ["b"] },
    ],
    taxRate: 5,
    tipRate: 7.5,
    discountRate: 15,
  });
  assert.equal(sum(result.perPerson.map((p) => p.total)), result.grandTotal);
  assert.equal(result.unassigned, 0);
});

test("proportional mode charges tax and tip by food ordered", () => {
  const result = calculateSplit({
    people: people.slice(0, 2),
    items: [
      { name: "Big", price: 300, people: ["a"] },
      { name: "Small", price: 100, people: ["b"] },
    ],
    taxRate: 10,
    shareMode: "proportional",
  });
  assert.equal(result.perPerson[0].tax, 3000);
  assert.equal(result.perPerson[1].tax, 1000);
});

test("equal mode splits tax and tip evenly", () => {
  const result = calculateSplit({
    people: people.slice(0, 2),
    items: [
      { name: "Big", price: 300, people: ["a"] },
      { name: "Small", price: 100, people: ["b"] },
    ],
    taxRate: 10,
    tipRate: 10,
    shareMode: "equal",
  });
  assert.equal(result.perPerson[0].tax, 2000);
  assert.equal(result.perPerson[1].tax, 2000);
  assert.equal(result.perPerson[0].tip, 2000);
});

test("discount is applied before tax and tip", () => {
  const result = calculateSplit({
    people: people.slice(0, 1),
    items: [{ name: "Meal", price: 1000, people: ["a"] }],
    taxRate: 10,
    tipRate: 10,
    discountRate: 20,
  });
  assert.equal(result.discount, 20000);
  assert.equal(result.tax, 8000);
  assert.equal(result.tip, 8000);
  assert.equal(result.grandTotal, 96000);
  assert.equal(result.perPerson[0].total, 96000);
});

test("items nobody is assigned to are reported, not silently dropped", () => {
  const result = calculateSplit({
    people,
    items: [
      { name: "Orphan", price: 120, people: ["gone"] },
      { name: "Soup", price: 60, people: ["a"] },
    ],
  });
  assert.equal(result.unassigned, 12000);
  assert.equal(sum(result.perPerson.map((p) => p.total)) + result.unassigned, result.grandTotal);
});

test("handles an empty table and out-of-range rates", () => {
  const empty = calculateSplit({ people: [], items: [], taxRate: -5, discountRate: 500 });
  assert.equal(empty.grandTotal, 0);
  const capped = calculateSplit({
    people: people.slice(0, 1),
    items: [{ name: "x", price: 10, people: ["a"] }],
    discountRate: 500,
  });
  assert.equal(capped.discountedFood, 0);
});
