const fileInput = document.getElementById('jsonFile');
const dropzone = document.getElementById('dropzone');
const fileInfo = document.getElementById('fileInfo');
const resultsPanel = document.getElementById('resultsPanel');
const emptyState = document.getElementById('emptyState');
const stats = document.getElementById('stats');
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const missingPhoneOnly = document.getElementById('missingPhoneOnly');
let businesses = [];
let visibleBusinesses = [];

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) readFile(file);
});
['dragenter','dragover'].forEach(name => dropzone.addEventListener(name, e => {
  e.preventDefault(); dropzone.classList.add('dragover');
}));
['dragleave','drop'].forEach(name => dropzone.addEventListener(name, e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
}));
dropzone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file) readFile(file);
});
document.getElementById('clearData').addEventListener('click', clearAll);
document.getElementById('loadSample').addEventListener('click', loadSample);
document.getElementById('exportCsv').addEventListener('click', exportCsv);
searchInput.addEventListener('input', renderTable);
categoryFilter.addEventListener('change', renderTable);
missingPhoneOnly.addEventListener('change', renderTable);

function readFile(file) {
  if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
    alert('Please choose a .json file.'); return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      businesses = normalizeInput(parsed);
      fileInfo.textContent = `${file.name} · ${businesses.length} business record(s) loaded`;
      prepareAndRender();
    } catch (err) {
      alert('Could not read this JSON file. Please check that it is valid JSON.');
    }
  };
  reader.onerror = () => alert('The file could not be read.');
  reader.readAsText(file);
}

function normalizeInput(data) {
  // LeadFlow exports may be an array, one object, or an object containing an array.
  if (Array.isArray(data)) return data.filter(isObject).map(cleanBusiness);
  if (!isObject(data)) throw new Error('JSON should contain an object or array.');
  for (const key of ['data','items','results','places','businesses']) {
    if (Array.isArray(data[key])) return data[key].filter(isObject).map(cleanBusiness);
  }
  return [cleanBusiness(data)];
}
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function firstValue(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      if (typeof value === 'object') continue;
      return String(value).trim();
    }
  }
  return '';
}
function findSocial(obj, pattern) {
  const found = [];
  const visited = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { value.forEach(walk); return; }
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string') {
        const keyLooksSocial = pattern.test(key);
        const url = child.trim();
        const urlLooksSocial = /instagram\.com/i.test(url);
        if ((keyLooksSocial || urlLooksSocial) && /^https?:\/\//i.test(url)) found.push(url);
      } else if (child && typeof child === 'object') walk(child);
    }
  }
  walk(obj);
  return [...new Set(found)];
}
function cleanUrl(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function cleanBusiness(obj) {
  const title = firstValue(obj, ['title','name','businessName','companyName','company','storeName']);
  const company = firstValue(obj, ['companyName','businessName','company','storeName']) || title;
  const phone = firstValue(obj, ['phone','phoneNumber','telephone','mobile','contactNumber','phoneUnformatted']);
  const street = firstValue(obj, ['street','streetAddress']);
  const city = firstValue(obj, ['city','town']);
  const state = firstValue(obj, ['state','region']);
  const postal = firstValue(obj, ['postalCode','zipCode','postcode']);
  const fullAddress = firstValue(obj, ['address','fullAddress','formattedAddress','locationText']);
  const location = fullAddress || [street, city, state, postal].filter(Boolean).join(', ');
  const website = cleanUrl(firstValue(obj, ['website','websiteUrl','webSite','domain']));
  const category = firstValue(obj, ['categoryName','category','primaryCategory']) ||
    (Array.isArray(obj.categories) ? obj.categories.join(', ') : '');
  const products = extractProducts(obj);
  const instagram = findSocial(obj, /instagram|social|profile|url/i)
    .filter(url => /instagram\.com/i.test(url));
  // Keep the raw category as useful fallback when a specific product list is not supplied.
  return {
    name: title || company || 'Unnamed business',
    company: company || title,
    phone,
    location: location || [city, state, postal].filter(Boolean).join(', '),
    website,
    instagram: instagram[0] || '',
    category,
    products: products.join(', '),
    searchText: ''
  };
}
function extractProducts(obj) {
  const result = [];
  const keys = ['products','productNames','productCategories','services','specialties','itemsOffered'];
  for (const key of keys) {
    const value = obj?.[key];
    if (Array.isArray(value)) value.forEach(item => {
      if (typeof item === 'string') result.push(item.trim());
      else if (isObject(item)) {
        const name = firstValue(item, ['name','title','productName','category']);
        if (name) result.push(name);
      }
    });
    else if (typeof value === 'string' && value.trim()) result.push(value.trim());
  }
  return [...new Set(result.filter(Boolean))];
}
function prepareAndRender() {
  businesses = businesses.map(b => ({...b, searchText: Object.values(b).join(' ').toLowerCase()}));
  const categories = [...new Set(businesses.map(b => b.category).filter(Boolean))].sort();
  categoryFilter.innerHTML = '<option value="">All categories</option>' +
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  stats.hidden = false;
  resultsPanel.hidden = false;
  emptyState.hidden = true;
  document.getElementById('businessCount').textContent = businesses.length;
  document.getElementById('phoneCount').textContent = businesses.filter(b => b.phone).length;
  document.getElementById('websiteCount').textContent = businesses.filter(b => b.website).length;
  document.getElementById('instagramCount').textContent = businesses.filter(b => b.instagram).length;
  renderTable();
}
function renderTable() {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  visibleBusinesses = businesses.filter(b =>
    (!query || b.searchText.includes(query)) &&
    (!category || b.category === category) &&
    (!missingPhoneOnly.checked || !b.phone)
  );
  tableBody.innerHTML = '';
  if (!visibleBusinesses.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="no-data">No matching businesses found.</td></tr>';
  } else {
    visibleBusinesses.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="company">${escapeHtml(b.name)}</div>${b.company && b.company !== b.name ? `<div class="muted">${escapeHtml(b.company)}</div>` : ''}</td>
        <td>${b.phone ? `<a class="link" href="tel:${escapeHtml(b.phone.replace(/[^+\\d]/g,''))}">${escapeHtml(b.phone)}</a>` : '<span class="no-data">Not found</span>'}</td>
        <td>${b.location ? `<span>${escapeHtml(b.location)}</span>` : '<span class="no-data">Not found</span>'}</td>
        <td>${b.website ? `<a class="link" href="${escapeHtml(b.website)}" target="_blank" rel="noopener noreferrer">Open website ↗</a>` : '<span class="no-data">Not found</span>'}</td>
        <td>${b.instagram ? `<a class="link" href="${escapeHtml(b.instagram)}" target="_blank" rel="noopener noreferrer">Instagram ↗</a>` : '<span class="no-data">Not found</span>'}</td>
        <td>${b.products ? `<div>${escapeHtml(b.products)}</div>` : ''}${b.category ? `<span class="category">${escapeHtml(b.category)}</span>` : ''}${!b.products && !b.category ? '<span class="no-data">Not found</span>' : ''}</td>`;
      tableBody.appendChild(tr);
    });
  }
  document.getElementById('resultCount').textContent = `${visibleBusinesses.length} of ${businesses.length} businesses`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function exportCsv() {
  if (!visibleBusinesses.length) { alert('There are no rows to export.'); return; }
  const headers = ['Name','Company name','Contact number','Location','Website','Instagram','Products','Category'];
  const rows = visibleBusinesses.map(b => [b.name,b.company,b.phone,b.location,b.website,b.instagram,b.products,b.category]);
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'cleaned-LeadFlow-leads.csv'; a.click();
  URL.revokeObjectURL(url);
}
function clearAll() {
  businesses = []; visibleBusinesses = [];
  fileInput.value = ''; fileInfo.textContent = 'No file selected';
  searchInput.value = ''; categoryFilter.innerHTML = '<option value="">All categories</option>';
  missingPhoneOnly.checked = false;
  stats.hidden = true; resultsPanel.hidden = true; emptyState.hidden = false;
}
function loadSample() {
  businesses = [cleanBusiness({
    title:'SRI VANITHA COVERING',
    categoryName:'Jewelry store',
    address:'51, Raju Naidu St, Sivananda Colony, Tatabad, Coimbatore, Tamil Nadu 641012, India',
    website:'http://www.srivanithacovering.in/',
    phone:'+91 91711 12414',
    categories:['Jewelry store']
  })];
  fileInfo.textContent = 'Sample data loaded · 1 business record';
  prepareAndRender();
}
