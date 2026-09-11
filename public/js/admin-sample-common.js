// Shared UI helpers for the admin sample prototypes (admin-inquiries-sample.js, admin-sanctions-sample.js).
// Reuses window.requestJson from js/api.js; must load before the page-specific script.
'use strict';

let toastTimer = null;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function showPageError(message) {
  const el = document.getElementById('page-error');
  el.textContent = message;
  el.hidden = false;
}

function showGate() {
  document.getElementById('login-gate').hidden = false;
  document.getElementById('app').hidden = true;
}

function showApp() {
  document.getElementById('login-gate').hidden = true;
  document.getElementById('app').hidden = false;
}

document.getElementById('sample-login').addEventListener('click', async () => {
  try {
    await window.requestJson('/__preview/login', { method: 'POST' });
    checkAndLoad();
  } catch (err) {
    toast('로그인 실패: ' + (err && err.message || ''));
  }
});
