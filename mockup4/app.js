(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const params = () => new URL(window.location.href).searchParams;
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase('en');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const pageLink = (page, values = {}) => {
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) query.set(key, value);
    });
    return page + (query.size ? '?' + query.toString() : '');
  };

  // The unenhanced page remains readable if motion or JavaScript is unavailable.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    document.documentElement.classList.add('js-motion');
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
  }

  const menuButton = $('.menu-toggle');
  const nav = $('#site-nav');
  if (menuButton && nav) {
    const setMenu = open => {
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      nav.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
    };
    setMenu(false);
    menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuButton.focus();
      }
    });
  }

  const newsletterDialog = $('#newsletter-dialog');
  const newsletterTrigger = $('.newsletter-trigger');
  if (newsletterDialog && newsletterTrigger) {
    newsletterTrigger.addEventListener('click', () => {
      menuButton?.setAttribute('aria-expanded', 'false');
      menuButton?.setAttribute('aria-label', 'Open navigation');
      nav?.classList.remove('open');
      document.body.classList.remove('menu-open');
      newsletterDialog.showModal();
    });
    $('.newsletter-close', newsletterDialog).addEventListener('click', () => newsletterDialog.close());
    newsletterDialog.addEventListener('close', () => {
      (window.matchMedia('(max-width: 900px)').matches ? menuButton : newsletterTrigger)?.focus();
    });
  }

  let catalogPromise;
  const loadCatalog = () => {
    if (!catalogPromise) {
      catalogPromise = fetch('assets/capabilities.json', { credentials: 'same-origin' })
        .then(response => {
          if (!response.ok) throw new Error('Capability list unavailable');
          return response.json();
        })
        .then(data => {
          if (!data || !Array.isArray(data.rows)) throw new Error('Invalid capability list');
          const fields = ['id', 'partNumber', 'description', 'manufacturer', 'ata', 'application'];
          const rows = data.rows.map(row => {
            if (!row || (typeof row !== 'object')) throw new Error('Invalid capability record');
            const record = Object.fromEntries(fields.map((field, index) => [field, String((Array.isArray(row) ? row[index] : row[field]) ?? '').trim()]));
            if (!record.partNumber || !record.description) throw new Error('Incomplete capability record');
            record.chapter = record.ata.match(/^(\d{2})/)?.[1] || '';
            record.search = normalize(fields.slice(1).map(field => record[field]).join(' '));
            return record;
          });
          return { rows, version: String(data.version || '').trim() };
        });
    }
    return catalogPromise;
  };

  const catalogForm = $('#catalog-form');
  if (catalogForm) {
    const queryInput = $('#catalog-query');
    const manufacturer = $('#manufacturer');
    const ata = $('#ata');
    const status = $('#catalog-status');
    const body = $('#catalog-body');
    const table = $('#catalog-table');
    const empty = $('#catalog-empty');
    const emptyQuote = $('#empty-quote');
    const previous = $('#prev-page');
    const next = $('#next-page');
    const pageStatus = $('#page-status');
    const pagination = previous.closest('.pagination');
    const pageSize = 15;
    let records = [];
    let currentPage = 0;
    let ready = false;
    let editingQuery = false;

    const selectValue = (select, value) => {
      // Keep unknown URL filters visible instead of silently broadening a search.
      if (value && !Array.from(select.options).some(option => option.value === value)) {
        const option = make('option', value);
        option.value = value;
        option.dataset.fromUrl = 'true';
        select.append(option);
      }
      select.value = value;
    };
    const readLocation = () => {
      const search = params();
      queryInput.value = search.get('q') || '';
      selectValue(manufacturer, search.get('manufacturer') || '');
      selectValue(ata, search.get('ata') || '');
      const requestedPage = Number(search.get('page'));
      currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0;
    };
    const syncLocation = mode => {
      const url = new URL(window.location.href);
      const values = { q: queryInput.value.trim(), manufacturer: manufacturer.value, ata: ata.value, page: currentPage > 0 ? String(currentPage + 1) : '' };
      Object.entries(values).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
      if (url.href !== window.location.href) window.history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', url);
    };
    const populate = (select, values, label) => {
      const current = select.value;
      const all = make('option', label);
      all.value = '';
      select.replaceChildren(all);
      values.forEach(value => {
        const option = make('option', value);
        option.value = value;
        select.append(option);
      });
      selectValue(select, current);
    };
    const render = () => {
      if (!ready) return;
      const query = normalize(queryInput.value);
      const tokens = query.split(/\s+/).filter(Boolean);
      const filtered = records.filter(record =>
        (!manufacturer.value || record.manufacturer === manufacturer.value) &&
        (!ata.value || record.chapter === ata.value) &&
        tokens.every(token => record.search.includes(token))
      );
      if (query) filtered.sort((a, b) => Number(normalize(b.partNumber) === query) - Number(normalize(a.partNumber) === query));
      const pages = Math.ceil(filtered.length / pageSize);
      currentPage = Math.max(0, Math.min(currentPage, pages - 1));
      const fragment = document.createDocumentFragment();
      filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).forEach(record => {
        const row = make('tr');
        const partCell = make('td');
        const partLink = make('a', record.partNumber, 'part-link');
        partLink.href = pageLink('component.html', { part: record.partNumber });
        partCell.append(partLink);
        row.append(partCell, make('td', record.description), make('td', record.manufacturer || '—'), make('td', record.application || '—'));
        const actionCell = make('td');
        const action = make('a', 'Quote', 'table-action');
        action.href = pageLink('quote.html', { part: record.partNumber, application: record.application });
        action.setAttribute('aria-label', 'Request a quote for part ' + record.partNumber);
        actionCell.append(action);
        row.append(actionCell);
        ['Part number', 'Component', 'Manufacturer', 'Application', ''].forEach((label, index) => { row.children[index].dataset.label = label; });
        fragment.append(row);
      });
      body.replaceChildren(fragment);
      const count = filtered.length;
      const start = count ? currentPage * pageSize + 1 : 0;
      const end = Math.min((currentPage + 1) * pageSize, count);
      status.textContent = count
        ? `${count.toLocaleString()} matching ${count === 1 ? 'record' : 'records'} · Showing ${start.toLocaleString()}–${end.toLocaleString()}`
        : 'No matching records in the published capability list. HSA can review your part number.';
      empty.hidden = count > 0;
      table.hidden = count === 0;
      if (pagination) pagination.hidden = count === 0;
      emptyQuote.href = pageLink('quote.html', { part: queryInput.value.trim() });
      pageStatus.textContent = pages ? `Page ${currentPage + 1} of ${pages}` : '';
      previous.disabled = currentPage === 0;
      next.disabled = !pages || currentPage >= pages - 1;
    };
    const change = (mode = 'push') => {
      if (!ready) return;
      currentPage = 0;
      render();
      syncLocation(mode);
    };

    readLocation();
    status.textContent = 'Loading the published capability list…';
    table.hidden = true;
    empty.hidden = true;
    previous.disabled = next.disabled = true;
    manufacturer.disabled = ata.disabled = true;
    if (pagination) pagination.hidden = true;
    loadCatalog().then(data => {
      records = data.rows;
      populate(manufacturer, [...new Set(records.map(record => record.manufacturer).filter(Boolean))].sort((a, b) => a.localeCompare(b)), 'All manufacturers');
      populate(ata, [...new Set(records.map(record => record.chapter).filter(Boolean))].sort(), 'All ATA chapters');
      const version = $('#catalog-version');
      if (version) version.textContent = data.version || 'Date not provided';
      manufacturer.disabled = ata.disabled = false;
      ready = true;
      render();
      syncLocation('replace');
    }).catch(() => {
      status.textContent = 'The capability list could not be loaded. Reload this page, or contact HSA with your part number for a review.';
      status.classList.add('is-error');
      pageStatus.textContent = 'Capability data unavailable';
      const version = $('#catalog-version');
      if (version) version.textContent = 'Unavailable';
    });

    catalogForm.addEventListener('submit', event => {
      event.preventDefault();
      editingQuery = false;
      change('push');
    });
    queryInput.addEventListener('input', () => {
      change(editingQuery ? 'replace' : 'push');
      editingQuery = true;
    });
    queryInput.addEventListener('blur', () => { editingQuery = false; });
    [manufacturer, ata].forEach(select => select.addEventListener('change', () => {
      editingQuery = false;
      change('push');
    }));
    $('#reset-filters')?.addEventListener('click', event => {
      event.preventDefault();
      queryInput.value = '';
      manufacturer.value = ata.value = '';
      editingQuery = false;
      change('push');
      queryInput.focus();
    });
    const movePage = direction => {
      if (!ready) return;
      currentPage += direction;
      editingQuery = false;
      render();
      syncLocation('push');
      status.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'nearest' });
    };
    previous.addEventListener('click', () => movePage(-1));
    next.addEventListener('click', () => movePage(1));
    window.addEventListener('popstate', () => {
      editingQuery = false;
      readLocation();
      render();
    });
  }

  const componentRecord = $('#component-record');
  if (componentRecord) {
    const part = (params().get('part') || '').trim();
    const title = $('#component-title');
    const subtitle = $('#component-subtitle');
    const quote = $('#component-quote');
    quote.href = pageLink('quote.html', { part });
    const explain = (heading, message) => {
      title.textContent = heading;
      subtitle.textContent = part ? 'Part number ' + part : 'Search by part number to view a published capability.';
      componentRecord.replaceChildren(make('p', message, 'record-notice'));
      const search = make('a', 'Search capabilities', 'text-link');
      search.href = pageLink('capabilities.html', { q: part });
      componentRecord.append(search);
    };
    if (!part) {
      explain('Find your component', 'Choose a part from the capability list, or send HSA a request to review your component.');
    } else {
      componentRecord.replaceChildren(make('p', 'Loading published capability information…'));
      loadCatalog().then(data => {
        const matches = data.rows.filter(record => normalize(record.partNumber) === normalize(part));
        if (!matches.length) {
          explain('Part review', 'This part number does not appear in the published capability list. Contact HSA to confirm whether support is available.');
          return;
        }
        const descriptions = [...new Set(matches.map(record => record.description))];
        const applications = [...new Set(matches.map(record => record.application).filter(Boolean))];
        title.textContent = descriptions.length === 1 ? descriptions[0] : 'Component capabilities';
        subtitle.textContent = `Part number ${matches[0].partNumber} · ${matches.length === 1 ? 'Published capability record' : matches.length + ' published capability records'}`;
        document.title = `${matches[0].partNumber} — ${title.textContent} | HSA`;
        quote.href = pageLink('quote.html', { part: matches[0].partNumber, application: applications.length === 1 ? applications[0] : '' });
        const fragment = document.createDocumentFragment();
        matches.forEach((record, index) => {
          const section = make('section', undefined, 'record-card');
          if (matches.length > 1) section.append(make('h2', 'Published record ' + (index + 1)));
          const details = make('dl', undefined, 'record-details');
          [['Part number', record.partNumber], ['Description', record.description], ['Manufacturer', record.manufacturer], ['ATA', record.ata], ['Application', record.application]].forEach(([label, value]) => {
            details.append(make('dt', label), make('dd', value || 'Not specified in the published list'));
          });
          section.append(details);
          fragment.append(section);
        });
        fragment.append(make('p', 'A listing does not confirm current availability, pricing or turnaround time. HSA will review your component and confirm the applicable scope of work.', 'record-notice'));
        componentRecord.replaceChildren(fragment);
      }).catch(() => explain('Component information unavailable', 'The capability list could not be loaded. Reload this page, or send HSA your part number for a review.'));
    }
  }

  const quoteForm = $('#quote-form');
  if (quoteForm) {
    const review = $('#quote-review');
    const summary = $('#quote-summary');
    const feedback = $('#quote-feedback');
    const email = $('#email-request');
    const field = name => quoteForm.elements.namedItem(name);
    const labels = {
      part: 'Part number', application: 'Aircraft / engine application', quantity: 'Quantity',
      service: 'Requested service', needed: 'Requested return date', name: 'Name', company: 'Company', email: 'Email', notes: 'Additional details'
    };
    let requestText = '';
    let requestPart = '';
    if (field('part')) field('part').value = params().get('part') || '';
    if (field('application')) field('application').value = params().get('application') || '';
    if (field('quantity') && !field('quantity').value) field('quantity').value = '1';

    quoteForm.addEventListener('input', event => {
      if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
    });
    quoteForm.addEventListener('submit', event => {
      event.preventDefault();
      Array.from(quoteForm.elements).forEach(element => {
        if (typeof element.setCustomValidity !== 'function') return;
        element.setCustomValidity('');
        if (element.required && typeof element.value === 'string' && !element.value.trim()) element.setCustomValidity('Please complete this field.');
      });
      if (!quoteForm.reportValidity()) return;
      const entries = Object.entries(labels).map(([key, label]) => {
        const control = field(key);
        let value = control?.value?.trim() || '';
        if (value && control.tagName === 'SELECT') value = control.selectedOptions[0].textContent.trim();
        return { key, label, value };
      }).filter(entry => entry.value);
      summary.replaceChildren();
      entries.forEach(({ label, value }) => summary.append(make('dt', label), make('dd', value)));
      requestPart = field('part')?.value.trim() || '';
      requestText = ['HSA — Quote request', '', 'Hello HSA team,', '', 'Please review the following component request:', '', ...entries.map(({ label, value }) => label + ': ' + value), '', 'Please confirm the applicable scope of work, pricing and turnaround time.'].join('\n');
      email.href = 'mailto:sales@hsaero.com?subject=' + encodeURIComponent('Quote request' + (requestPart ? ' — ' + requestPart : '')) + '&body=' + encodeURIComponent(requestText);
      quoteForm.hidden = true;
      review.hidden = false;
      feedback.textContent = 'Draft prepared. Your request has not been sent. You can download it or open an email to sales@hsaero.com.';
      review.setAttribute('tabindex', '-1');
      review.focus({ preventScroll: true });
      review.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
    });
    quoteForm.querySelector('button[type="submit"]').disabled = false;
    $('#edit-request')?.addEventListener('click', () => {
      review.hidden = true;
      quoteForm.hidden = false;
      feedback.textContent = 'You are editing your request. Nothing has been sent.';
      field('part')?.focus();
    });
    $('#download-request')?.addEventListener('click', () => {
      if (!requestText) return;
      const blob = new Blob([requestText + '\n'], { type: 'text/plain;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = make('a');
      link.href = blobUrl;
      link.download = 'HSA-quote-request' + (requestPart ? '-' + requestPart.replace(/[^a-z0-9_-]+/gi, '-').slice(0,60) : '') + '.txt';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      feedback.textContent = 'Your draft is ready to download. It has not been sent to HSA.';
    });
    email?.addEventListener('click', () => {
      feedback.textContent = 'Review and send the draft in your email app. This page does not send email. If no app opens, download the request and email it to sales@hsaero.com.';
    });
  }

  const unitPhoto = $('#unit-photo');
  const unitViewer = $('#unit-viewer');
  if (unitPhoto && unitViewer) {
    let view = 1;
    const count = $('#view-count');
    const originalAlt = 'Hydromechanical unit 441789';
    const showView = next => {
      view = ((next - 1 + 6) % 6) + 1;
      unitPhoto.src = `assets/hmu/view-${view}.webp`;
      unitPhoto.alt = `${originalAlt} — view ${view} of 6`;
      if (count) count.textContent = String(view).padStart(2, '0') + ' / 06';
    };
    $('#view-prev')?.addEventListener('click', () => showView(view - 1));
    $('#view-next')?.addEventListener('click', () => showView(view + 1));
    unitViewer.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        showView(view + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    });
    unitPhoto.addEventListener('error', () => {
      if (count) count.textContent = `View ${view} could not load. Try another view.`;
    });
    showView(1);
  }
})();
