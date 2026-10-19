# TableSplit

A small, dependency-free restaurant bill splitter. Everyone pays for what they
actually ate, and the tax, tip and any discount are shared fairly.

Open `index.html` in a browser to use it. No build step or server is required.

## Features

- **A plate per person.** Everyone at the table gets a plate in their own colour that grows with what
  they owe. Tap a plate to see exactly what is on it.
- **Per-dish splitting.** Add diners, add dishes (price, quantity, veg/non-veg) and
  tap the names of everyone who shared each one. A dish is divided only between its eaters.
- **Exact to the paisa.** All money is calculated in integer paise with
  largest-remainder rounding, so each person's total always adds up to the bill total.
- **Discount, tax and tip.** Type any discount percentage (0 to 100). It comes off the
  food first; tax and tip are then worked out on the discounted food total.
- **Two ways to share tax and tip.** Split them equally, or in proportion to what each
  person ordered.
- **Edit as you go.** Fix a dish with the Edit button instead of deleting and re-adding it.
  Dishes nobody is assigned to are flagged so no money goes missing.
- **Share the result.** Copy a plain-text summary, or send it straight to WhatsApp.
- **Remembers your table.** People, dishes, rates and options are saved in your browser, so a
  refresh doesn't lose the bill. "Start new bill" clears the dishes and keeps the people.
- **Scan a bill photo.** OCR (Tesseract.js, loaded on first use) reads the photo on your device,
  picks out likely food lines and prices, and lets you review each one before adding it.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | Styling |
| `fonts/` | Bricolage Grotesque, self-hosted (SIL Open Font License), so the app works offline |
| `app.js` | UI, saved state and bill scanning |
| `split.js` | The money math, usable in the browser and in Node |
| `split.test.js` | Unit tests for the money math |

## Tests

Requires Node 18 or newer. No packages to install.

```sh
npm test
```
