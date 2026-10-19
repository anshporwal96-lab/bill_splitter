/*
 * TableSplit calculation module.
 *
 * All money is handled as integer paise so that per-person amounts always add
 * up exactly to the bill total (no floating point drift, no lost paise).
 * Works in the browser (window.SplitMath) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SplitMath = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const toPaise = (rupees) => Math.round(Number(rupees) * 100);

  /**
   * Split `total` (integer) across `weights` using the largest-remainder
   * method, so the parts always sum to exactly `total`.
   * Falls back to an equal split when every weight is zero.
   */
  function allocate(total, weights) {
    const count = weights.length;
    if (!count) return [];
    let sum = weights.reduce((a, b) => a + b, 0);
    const w = sum > 0 ? weights : weights.map(() => 1);
    if (sum <= 0) sum = count;

    const exact = w.map((weight) => (total * weight) / sum);
    const parts = exact.map(Math.floor);
    let leftover = total - parts.reduce((a, b) => a + b, 0);
    const order = exact
      .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (let i = 0; leftover > 0; i = (i + 1) % count, leftover--) parts[order[i].index] += 1;
    return parts;
  }

  /**
   * @param {object} input
   * @param {{id:string,name:string}[]} input.people
   * @param {{name:string,price:number,quantity?:number,people:string[]}[]} input.items  price is rupees per unit
   * @param {number} input.taxRate       percent, applied after discount
   * @param {number} input.tipRate       percent, applied after discount
   * @param {number} input.discountRate  percent off the food total
   * @param {"equal"|"proportional"} input.shareMode  how tax and tip are shared
   */
  function calculateSplit({ people, items, taxRate = 0, tipRate = 0, discountRate = 0, shareMode = "equal" }) {
    const ids = people.map((person) => person.id);
    const pct = (value) => Math.min(100, Math.max(0, Number(value) || 0));
    const rate = (value) => Math.max(0, Number(value) || 0);

    const gross = ids.map(() => 0); // food per person before discount
    const lines = ids.map(() => []); // dish shares per person
    let unassignedGross = 0;
    let foodTotal = 0;

    items.forEach((item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const lineTotal = toPaise(item.price) * quantity;
      foodTotal += lineTotal;
      const eaters = [...new Set(item.people)].map((id) => ids.indexOf(id)).filter((index) => index >= 0);
      if (!eaters.length) {
        unassignedGross += lineTotal;
        return;
      }
      const shares = allocate(lineTotal, eaters.map(() => 1));
      eaters.forEach((personIndex, i) => {
        gross[personIndex] += shares[i];
        lines[personIndex].push({ name: item.name, quantity, share: shares[i], sharedWith: eaters.length });
      });
    });

    const discount = Math.round((foodTotal * pct(discountRate)) / 100);
    const discountedFood = foodTotal - discount;

    // Discount is spread in proportion to what each person (and any unassigned food) ordered.
    const discountParts = allocate(discount, [...gross, unassignedGross]);
    const net = gross.map((value, i) => value - discountParts[i]);
    const unassigned = unassignedGross - discountParts[ids.length];

    const tax = Math.round((discountedFood * rate(taxRate)) / 100);
    const tip = Math.round((discountedFood * rate(tipRate)) / 100);
    const shareWeights = shareMode === "proportional" ? net : net.map(() => 1);
    const taxParts = allocate(tax, shareWeights);
    const tipParts = allocate(tip, shareWeights);

    const perPerson = people.map((person, i) => ({
      id: person.id,
      name: person.name,
      gross: gross[i],
      discount: discountParts[i],
      food: net[i],
      tax: taxParts[i] || 0,
      tip: tipParts[i] || 0,
      total: net[i] + (taxParts[i] || 0) + (tipParts[i] || 0),
      lines: lines[i],
    }));

    // With nobody at the table, tax and tip have nowhere to go; keep the grand total honest anyway.
    const grandTotal = discountedFood + tax + tip;
    return { foodTotal, discount, discountedFood, tax, tip, grandTotal, unassigned, perPerson };
  }

  return { toPaise, allocate, calculateSplit };
});
