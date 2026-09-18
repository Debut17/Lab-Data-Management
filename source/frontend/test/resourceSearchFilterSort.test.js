import { readFileSync } from 'node:fs';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const pageHtml = readFileSync(
  path.join(process.cwd(), 'public', 'index.html'),
  'utf8',
);

let dom;
let doc;

beforeEach(() => {
  dom = new JSDOM(pageHtml, { runScripts: 'dangerously' });
  doc = dom.window.document;
});

afterEach(() => {
  dom.window.close();
});

function visibleNames() {
  return [...doc.querySelectorAll('#resourceGrid .card-title')].map(
    (title) => title.textContent,
  );
}

function visibleStatuses() {
  return [...doc.querySelectorAll('#resourceGrid .status-badge')].map(
    (badge) => badge.textContent,
  );
}

function visibleCategories() {
  return [...doc.querySelectorAll('#resourceGrid .category-tag')].map(
    (tag) => tag.textContent,
  );
}

function searchFor(term) {
  doc.getElementById('searchInput').value = term;
  dom.window.filterResources();
}

function chooseFrom(menuId, label) {
  const option = [...doc.querySelectorAll(`#${menuId} .sort-option`)].find(
    (candidate) => candidate.textContent.includes(label),
  );
  option.click();
  return option;
}

describe('US-2 search by resource name', () => {
  it('keeps only the resources whose name contains the search term', () => {
    searchFor('Centrifuge');

    expect(visibleNames()).toEqual(['High-Speed Centrifuge']);
    expect(doc.getElementById('resourceCount').innerText).toBe('(1 items)');
  });

  it('matches regardless of letter case', () => {
    searchFor('mass spectrometer');

    expect(visibleNames()).toEqual(['Mass Spectrometer']);
  });

  it('shows the empty state when no resource matches', () => {
    searchFor('Electron Telescope');

    expect(visibleNames()).toEqual([]);
    expect(doc.getElementById('emptyState').style.display).toBe('block');
  });
});

describe('US-2 filtering', () => {
  it('keeps only the resources in the selected category', () => {
    chooseFrom('categoryMenu', 'Facilities');

    expect(visibleNames()).toEqual(['Chemical Fume Hood A']);
    expect(doc.getElementById('categoryTriggerLabel').innerText).toBe('Facilities');
  });

  it('keeps only the resources in the selected status', () => {
    chooseFrom('statusMenu', 'Maintenance');

    expect(visibleNames()).toEqual(['Digital Fluorescence Microscope']);
    expect(doc.getElementById('statusTriggerLabel').innerText).toBe('Maintenance');
  });

  it('applies the category and status filters together', () => {
    chooseFrom('categoryMenu', 'Instruments');
    chooseFrom('statusMenu', 'Available');

    expect(visibleNames()).toEqual(['Precision pH Meter']);
  });
});

describe('US-2 sorting', () => {
  it('sorts by name from A to Z', () => {
    chooseFrom('sortMenu', 'Name (A–Z)');

    expect(visibleNames()).toEqual([
      'Autoclave Sterilizer',
      'Chemical Fume Hood A',
      'Digital Fluorescence Microscope',
      'High-Speed Centrifuge',
      'Mass Spectrometer',
      'Precision pH Meter',
    ]);
  });

  it('sorts by name from Z to A', () => {
    chooseFrom('sortMenu', 'Name (A–Z)');
    const ascending = visibleNames();

    chooseFrom('sortMenu', 'Name (Z–A)');

    expect(visibleNames()).toEqual([...ascending].reverse());
  });

  it('sorts by category', () => {
    chooseFrom('sortMenu', 'Category (A–Z)');

    const categories = visibleCategories();
    expect(categories).toEqual([...categories].sort());
    expect(categories[0]).toBe('Equipment');
  });

  it('orders availability by operational meaning instead of alphabetically', () => {
    chooseFrom('sortMenu', 'Availability: Available first');

    expect(visibleStatuses()).toEqual([
      'Available',
      'Available',
      'Available',
      'Available',
      'In Use',
      'Maintenance',
    ]);
  });

  it('keeps the selected sort applied while a search narrows the list', () => {
    chooseFrom('sortMenu', 'Name (Z–A)');
    searchFor('e');

    const names = visibleNames();
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual([...names].sort().reverse());
  });
});

describe('US-2 availability sorting stays relevant to the status filter', () => {
  function availabilityOptionsHidden() {
    return [...doc.querySelectorAll('.availability-sort-option')].map(
      (option) => option.hidden,
    );
  }

  it('offers availability sorting while every status is listed', () => {
    expect(availabilityOptionsHidden()).toEqual([false, false]);
  });

  it('hides availability sorting once a single status is selected', () => {
    chooseFrom('statusMenu', 'Available');

    expect(availabilityOptionsHidden()).toEqual([true, true]);
  });

  it('clears an active availability sort when the status filter narrows', () => {
    chooseFrom('sortMenu', 'Availability: Available first');
    chooseFrom('statusMenu', 'Available');

    expect(doc.getElementById('sortTriggerLabel').innerText).toBe('Sort by');
    expect(
      doc.querySelector('#sortMenu .sort-option[data-field=""]').classList.contains('active'),
    ).toBe(true);
  });

  it('keeps a name sort when the status filter narrows', () => {
    chooseFrom('sortMenu', 'Name (A–Z)');
    chooseFrom('statusMenu', 'Available');

    expect(doc.getElementById('sortTriggerLabel').innerText).toBe('Name (A–Z)');
    expect(visibleNames()).toEqual([...visibleNames()].sort());
  });

  it('offers availability sorting again when all statuses return', () => {
    chooseFrom('statusMenu', 'Available');
    chooseFrom('statusMenu', 'All Statuses');

    expect(availabilityOptionsHidden()).toEqual([false, false]);
  });
});
