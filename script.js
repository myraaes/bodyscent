/* ==========================================================================
   Body Scent — script.js (shared by every page)
   Each feature starts only if its elements exist on the current page:
     product.html : #filter-bar, #product-list
     order.html   : #orderForm, #customerName, #contact, #items, #total, #note
     admin.html   : #ordersTable tbody
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- Config ---------- */
  const PRODUCTS_URL = 'products.json';

  const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbyIyiGm7rC_EPFluQi6SV4q4Sf4XXESC_gOZBan7xM_nCsYYMbQrOk_lCs_D2LyGhxjrA/exec';

  const ORDERS_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1sRSatohaOWduUDWlFfU9XHRkgVCu218qNjE2bb-3UPxHcdyU2AWGM1KZkip_tHux2fUjdUtqDaR_/pub?gid=0&single=true&output=csv';

  const MOODS = [
    { key: 'all',       label: 'ทั้งหมด' },
    { key: 'fresh',     label: 'Fresh' },
    { key: 'sweet',     label: 'Sweet' },
    { key: 'confident', label: 'Confident' },
    { key: 'romance',   label: 'Romance' }
  ];

  const TYPE_LABELS = {
    spray:  'น้ำหอมฉีดตัว',
    rollon: 'โรลออน'
  };

  /* ---------- Helpers ---------- */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function moodLabel(key) {
    const found = MOODS.find(function (m) { return m.key === key; });
    return found ? found.label : key;
  }

  function isValidMood(key) {
    return MOODS.some(function (m) { return m.key === key; });
  }

  /* ==========================================================================
     1) product.html — product cards + mood filter
     ========================================================================== */
  function initProductPage() {
    const filterBar = document.getElementById('filter-bar');
    const list = document.getElementById('product-list');
    if (!filterBar || !list) return;

    let products = [];
    let activeMood = 'all';

    function showMessage(text) {
      list.replaceChildren();
      const msg = el('p', 'muted', text);
      msg.style.gridColumn = '1 / -1';
      list.appendChild(msg);
    }

    function buildOrderUrl(product) {
      const itemName = product.size
        ? product.name + ' ' + product.size
        : product.name;
      const params = new URLSearchParams({
        item: itemName,
        price: String(product.price)
      });
      return 'order.html?' + params.toString();
    }

    function buildCard(product) {
      const card = el('article', 'product-card mood-' + product.mood);

      const media = el('div', 'product-card__media');
      const img = document.createElement('img');
      img.src = product.image;
      img.alt = product.name;
      img.loading = 'lazy';
      img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
      media.appendChild(img);

      const meta = el('div', 'product-card__meta');
      meta.appendChild(el('span', 'mood-dot'));
      meta.appendChild(el('span', '', moodLabel(product.mood)));
      const sizeText = product.size || TYPE_LABELS[product.type] || '';
      const size = el('span', '', sizeText);
      size.style.marginLeft = 'auto';
      meta.appendChild(size);

      const name = el('h3', 'product-card__name', product.name);

      const foot = el('div', 'product-card__foot');
      const price = el('span', 'price', Number(product.price).toLocaleString('th-TH'));
      price.appendChild(el('small', '', 'บาท'));
      const buy = el('a', 'btn btn--bronze btn--sm', 'สั่งซื้อ');
      buy.href = buildOrderUrl(product);
      foot.appendChild(price);
      foot.appendChild(buy);

      card.appendChild(media);
      card.appendChild(meta);
      card.appendChild(name);
      card.appendChild(foot);
      return card;
    }

    function render() {
      const shown = activeMood === 'all'
        ? products
        : products.filter(function (p) { return p.mood === activeMood; });

      if (!shown.length) {
        showMessage('ยังไม่มีสินค้าในหมวดนี้');
        return;
      }
      const fragment = document.createDocumentFragment();
      shown.forEach(function (p) { fragment.appendChild(buildCard(p)); });
      list.replaceChildren(fragment);
    }

    function updateButtons() {
      filterBar.querySelectorAll('.filter-btn').forEach(function (btn) {
        const active = btn.dataset.mood === activeMood;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }

    function setMood(mood, updateUrl) {
      activeMood = isValidMood(mood) ? mood : 'all';
      updateButtons();
      render();
      if (updateUrl) {
        const url = new URL(window.location.href);
        if (activeMood === 'all') url.searchParams.delete('mood');
        else url.searchParams.set('mood', activeMood);
        history.replaceState(null, '', url);
      }
    }

    function buildFilterBar() {
      filterBar.replaceChildren();
      MOODS.forEach(function (m) {
        const btn = el('button', 'filter-btn' + (m.key !== 'all' ? ' mood-' + m.key : ''));
        btn.type = 'button';
        btn.dataset.mood = m.key;
        if (m.key !== 'all') btn.appendChild(el('span', 'mood-dot'));
        btn.appendChild(document.createTextNode(m.label));
        btn.addEventListener('click', function () { setMood(m.key, true); });
        filterBar.appendChild(btn);
      });
    }

    buildFilterBar();
    showMessage('กำลังโหลดสินค้า...');

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        const initial = new URLSearchParams(window.location.search).get('mood');
        setMood(initial ? initial.toLowerCase() : 'all', false);
      })
      .catch(function (error) {
        console.error(error);
        showMessage('โหลดข้อมูลสินค้าไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง');
      });
  }

  /* ==========================================================================
     2) order.html — prefill from URL + submit to Apps Script
     ========================================================================== */
  function initOrderPage() {
    const form = document.getElementById('orderForm');
    if (!form) return;

    const fields = {
      customerName: document.getElementById('customerName'),
      contact:      document.getElementById('contact'),
      items:        document.getElementById('items'),
      total:        document.getElementById('total'),
      note:         document.getElementById('note')
    };

    // Prefill item + price from ?item=...&price=...
    const params = new URLSearchParams(window.location.search);
    const item = params.get('item');
    const price = params.get('price');
    if (fields.items && item !== null) fields.items.value = item;
    if (fields.total && price !== null) fields.total.value = price;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const payload = {
        customerName: fields.customerName.value.trim(),
        contact:      fields.contact.value.trim(),
        items:        fields.items.value.trim(),
        total:        fields.total.value.trim(),
        note:         fields.note ? fields.note.value.trim() : ''
      };

      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        if (submitBtn) submitBtn.disabled = false;
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      });
    });
  }

  /* ==========================================================================
     3) admin.html — orders table from published Google Sheet CSV
     ========================================================================== */

  // Minimal CSV parser: quoted fields, escaped quotes (""), commas and
  // line breaks inside quotes, CRLF / LF, and a leading BOM.
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    // Drop completely empty lines
    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ''; });
    });
  }

  function initAdminPage() {
    const tbody = document.querySelector('#ordersTable tbody');
    if (!tbody) return;

    const COLUMNS = 6; // date, name, contact, items, total, note

    function showRow(text) {
      tbody.replaceChildren();
      const tr = document.createElement('tr');
      const td = el('td', 'muted', text);
      td.colSpan = COLUMNS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showRow('กำลังโหลดรายการสั่งซื้อ...');

    fetch(ORDERS_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        const rows = parseCSV(text);
        const orders = rows.slice(1).reverse(); // skip header, newest first

        if (!orders.length) {
          showRow('ยังไม่มีรายการสั่งซื้อ');
          return;
        }

        const fragment = document.createDocumentFragment();
        orders.forEach(function (cells) {
          const tr = document.createElement('tr');
          for (let i = 0; i < COLUMNS; i++) {
            // textContent keeps customer-entered text from being run as HTML
            tr.appendChild(el('td', '', (cells[i] || '').trim()));
          }
          fragment.appendChild(tr);
        });
        tbody.replaceChildren(fragment);
      })
      .catch(function (error) {
        console.error(error);
        showRow('โหลดรายการสั่งซื้อไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง');
      });
  }

  /* ---------- Start ---------- */
  function init() {
    initProductPage();
    initOrderPage();
    initAdminPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
