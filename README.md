# TableSplit

A small, dependency-free restaurant bill splitter. Add each diner, add dishes with
veg/non-veg labels, select everyone who shared each dish, and set the tax and tip
rates in rupees. Choose a 10%, 15%, or 20% restaurant discount (or no discount)
to apply it before tax and tip. The dish cost is split between its selected diners,
while tax and tip are split equally between all diners. A bill photo can also be
scanned in the browser using OCR; only likely food-item lines and their prices
are extracted, shown for review, and then added to the bill.

Open `index.html` in a browser to use it. No build step or server is required.