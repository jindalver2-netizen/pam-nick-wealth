/**
 * DhanRakshak — Main Application
 * Single-page app with hash routing, all views, toast/modal, voice input.
 */
import {
  db, seedDefaults,
  createAccount, updateAccount, archiveAccount, getActiveAccounts, getAllAccounts, getAccountById,
  getCategories, createCategory, updateCategory, deleteCategory,
  createTransaction, updateTransaction, deleteTransaction, getTransaction, getTransactions, getRecentTransactions,
  getAccountBalance, getAllBalances, getTotalLiquidMoney,
  getMonthlyReport, getPreviousMonthReport,
  createAsset, updateAsset, getActiveAssets, addValuation, getValuations,
  getNetWorth,
  createSnapshot, getSnapshots, getSnapshotBalances,
  exportToCSV, exportFullBackup, importFullBackup,
  getSetting, setSetting,
  seedSampleData, clearAllData
} from './db.js';
import { parseEntry, parseBankSMS } from './parser.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// ── Utility Helpers ───────────────────────────────────────────────────

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '₹0';
  const abs = Math.abs(amount);
  if (abs >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

function getMonthName(m) {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const ASSET_TYPE_LABELS = {
  fd: 'Fixed Deposit', pf: 'Provident Fund', ppf: 'PPF',
  mutual_fund: 'Mutual Fund', stock: 'Stocks', gold: 'Gold',
  silver: 'Silver', real_estate: 'Real Estate', other: 'Other'
};

const ASSET_TYPE_ICONS = {
  fd: '🏦', pf: '🏛️', ppf: '🏛️', mutual_fund: '📈',
  stock: '📊', gold: '🥇', silver: '🥈', real_estate: '🏗️', other: '📦'
};

const ACCOUNT_TYPE_ICONS = {
  cash: '💵', bank: '🏦', wallet: '👛', upi: '📱', other: '💳'
};

// ── Chart Colors ──────────────────────────────────────────────────────

const CHART_COLORS = [
  '#7c6cf0', '#34d399', '#f87171', '#fbbf24', '#60a5fa',
  '#fb923c', '#a78bfa', '#f472b6', '#38bdf8', '#4ade80',
  '#facc15', '#fb7185', '#818cf8', '#2dd4bf', '#c084fc',
];

// ── Toast System ──────────────────────────────────────────────────────

function showToast(message, type = 'info', { undoFn, duration = 3500 } = {}) {
  const container = $('#toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    ${undoFn ? '<span class="toast-undo">Undo</span>' : ''}
    <button class="toast-close">✕</button>
  `;

  container.appendChild(toast);

  const close = () => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 200); };
  toast.querySelector('.toast-close').onclick = close;
  if (undoFn) toast.querySelector('.toast-undo').onclick = () => { undoFn(); close(); };

  setTimeout(close, duration);
}

// ── Modal System ──────────────────────────────────────────────────────

function showModal(html) {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = html;
  overlay.classList.remove('hidden');

  const closeBtn = content.querySelector('.modal-close');
  if (closeBtn) closeBtn.onclick = closeModal;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-content').innerHTML = '';
}

// ── Router ────────────────────────────────────────────────────────────

const routes = {
  '/': renderHome,
  '/transactions': renderTransactions,
  '/accounts': renderAccounts,
  '/investments': renderInvestments,
  '/reports': renderReports,
  '/settings': renderSettings,
};

function navigate(hash) {
  window.location.hash = hash;
}

function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  return hash;
}

async function handleRoute() {
  const route = getRoute();
  const view = routes[route] || routes['/'];
  const container = $('#view-container');

  // Update nav active state
  $$('.nav-item, .bnav-item').forEach(el => {
    const v = el.getAttribute('data-view');
    const isActive =
      (route === '/' && v === 'home') ||
      route === '/' + v;
    el.classList.toggle('active', isActive);
  });

  container.style.animation = 'none';
  container.offsetHeight; // trigger reflow
  container.style.animation = '';

  await view(container);
}

// ── Voice Input ───────────────────────────────────────────────────────

let recognition = null;
let isRecording = false;

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-IN';
  return recognition;
}

function toggleVoice(inputEl, micBtn) {
  if (!recognition) {
    showToast('Voice input is not supported in this browser.', 'warning');
    return;
  }

  if (isRecording) {
    recognition.stop();
    isRecording = false;
    micBtn.classList.remove('recording');
    return;
  }

  isRecording = true;
  micBtn.classList.add('recording');

  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    inputEl.value = text;
    inputEl.dispatchEvent(new Event('input'));
    isRecording = false;
    micBtn.classList.remove('recording');
  };

  recognition.onerror = () => {
    isRecording = false;
    micBtn.classList.remove('recording');
    showToast('Could not recognize speech. Try again.', 'error');
  };

  recognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove('recording');
  };

  recognition.start();
}

// ── Quick Entry Component ─────────────────────────────────────────────

function renderQuickEntry() {
  return `
    <div class="quick-entry-wrapper" id="quick-entry-wrapper">
      <div class="quick-entry-box">
        <input type="text" id="quick-entry-input" placeholder="Type: 50 chai PhonePe  or  5000 income cash"
               autocomplete="off" autofocus>
        <button class="btn-mic" id="btn-mic" title="Voice input">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
        <button class="btn-send" id="btn-send" title="Save entry">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div class="quick-entry-hint">
        Examples: <strong>50 chai PhonePe</strong> · <strong>5000 income cash</strong> · <strong>2000 transferred cash to HDFC</strong>
      </div>
      <div id="qe-preview-container"></div>
    </div>
  `;
}

async function initQuickEntry() {
  const input = $('#quick-entry-input');
  const micBtn = $('#btn-mic');
  const sendBtn = $('#btn-send');
  const previewContainer = $('#qe-preview-container');

  if (!input) return;

  let currentParsed = null;
  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const val = input.value.trim();
      if (!val) { previewContainer.innerHTML = ''; currentParsed = null; return; }

      const accounts = await getActiveAccounts();
      const categories = await getCategories();
      const parsed = parseEntry(val, accounts, categories);
      currentParsed = parsed;

      if (parsed && !parsed.error) {
        renderPreview(parsed, previewContainer);
      } else if (parsed?.error) {
        previewContainer.innerHTML = `<div class="qe-preview" style="color:var(--red)">${escapeHtml(parsed.error)}</div>`;
      }
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentParsed && !currentParsed.error) {
      saveQuickEntry(currentParsed, input, previewContainer);
    }
    if (e.key === 'Escape') {
      previewContainer.innerHTML = '';
      currentParsed = null;
      input.value = '';
    }
  });

  sendBtn.addEventListener('click', () => {
    if (currentParsed && !currentParsed.error) {
      saveQuickEntry(currentParsed, input, previewContainer);
    } else if (input.value.trim()) {
      showToast('Could not parse your entry. Please check the format.', 'warning');
    }
  });

  micBtn.addEventListener('click', () => toggleVoice(input, micBtn));
}

function renderPreview(parsed, container) {
  const accounts = parsed;
  const typeLabel = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
  const typeClass = parsed.type;

  let details = `
    <div class="qe-preview-row"><span class="label">Type</span><span class="value"><span class="badge ${typeClass}">${typeLabel}</span></span></div>
    <div class="qe-preview-row"><span class="label">Amount</span><span class="value">${formatCurrency(parsed.amount)}</span></div>
  `;

  if (parsed.description) {
    details += `<div class="qe-preview-row"><span class="label">Description</span><span class="value">${escapeHtml(parsed.description)}</span></div>`;
  }
  if (parsed.categoryName) {
    details += `<div class="qe-preview-row"><span class="label">Category</span><span class="value">${escapeHtml(parsed.categoryName)}</span></div>`;
  }
  if (parsed.type === 'transfer') {
    details += `<div class="qe-preview-row"><span class="label">From</span><span class="value">${escapeHtml(parsed.accountName || '?')}</span></div>`;
    details += `<div class="qe-preview-row"><span class="label">To</span><span class="value">${escapeHtml(parsed.toAccountName || '?')}</span></div>`;
  } else {
    details += `<div class="qe-preview-row"><span class="label">Account</span><span class="value">${escapeHtml(parsed.accountName || 'Not matched')}</span></div>`;
  }

  if (parsed.needsClarification.length > 0) {
    details += `<div class="qe-preview-row" style="color:var(--yellow)"><span class="label">⚠️ Missing</span><span class="value">${parsed.needsClarification.join(', ')}</span></div>`;
  }

  container.innerHTML = `
    <div class="qe-preview">
      ${details}
      <div class="qe-preview-actions">
        <button class="btn btn-primary btn-sm" id="qe-save">Save ↵</button>
        <button class="btn btn-secondary btn-sm" id="qe-edit">Edit Details</button>
        <button class="btn btn-ghost btn-sm" id="qe-cancel">Cancel</button>
      </div>
    </div>
  `;

  container.querySelector('#qe-save')?.addEventListener('click', () => {
    const input = $('#quick-entry-input');
    saveQuickEntry(parsed, input, container);
  });

  container.querySelector('#qe-edit')?.addEventListener('click', () => {
    showTransactionModal(parsed);
    container.innerHTML = '';
  });

  container.querySelector('#qe-cancel')?.addEventListener('click', () => {
    container.innerHTML = '';
    const input = $('#quick-entry-input');
    if (input) { input.value = ''; input.focus(); }
  });
}

async function saveQuickEntry(parsed, inputEl, previewContainer) {
  if (!parsed || parsed.error) return;

  if (parsed.needsClarification.length > 0 && !parsed.accountId) {
    showTransactionModal(parsed);
    previewContainer.innerHTML = '';
    return;
  }

  try {
    const txnId = await createTransaction({
      type: parsed.type,
      amount: parsed.amount,
      description: parsed.description,
      categoryId: parsed.categoryId,
      accountId: parsed.accountId,
      toAccountId: parsed.toAccountId,
      date: parsed.date,
    });

    showToast(`${parsed.type === 'income' ? 'Income' : parsed.type === 'expense' ? 'Expense' : 'Transfer'} of ${formatCurrency(parsed.amount)} saved!`, 'success', {
      undoFn: async () => {
        await deleteTransaction(txnId);
        showToast('Transaction undone.', 'info');
        handleRoute();
      }
    });

    inputEl.value = '';
    previewContainer.innerHTML = '';
    handleRoute(); // refresh current view
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  }
}

// ── Transaction Modal (Edit / New) ────────────────────────────────────

async function showTransactionModal(data = {}) {
  const accounts = await getActiveAccounts();
  const expCats = await getCategories('expense');
  const incCats = await getCategories('income');
  const isEdit = !!data.id;

  const accOptions = accounts.map(a => `<option value="${a.id}" ${data.accountId === a.id ? 'selected' : ''}>${a.icon || ''} ${escapeHtml(a.name)}</option>`).join('');
  const toAccOptions = accounts.map(a => `<option value="${a.id}" ${data.toAccountId === a.id ? 'selected' : ''}>${a.icon || ''} ${escapeHtml(a.name)}</option>`).join('');

  const catOptionsForType = (type) => {
    const cats = type === 'income' ? incCats : expCats;
    return cats.map(c => `<option value="${c.id}" ${data.categoryId === c.id ? 'selected' : ''}>${c.icon || ''} ${escapeHtml(c.name)}</option>`).join('');
  };

  const dateVal = data.date ? new Date(data.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit' : 'New'} Transaction</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="txn-form">
      <div class="tabs" id="txn-type-tabs">
        <button type="button" class="tab-btn ${(data.type || 'expense') === 'expense' ? 'active' : ''}" data-type="expense">Expense</button>
        <button type="button" class="tab-btn ${data.type === 'income' ? 'active' : ''}" data-type="income">Income</button>
        <button type="button" class="tab-btn ${data.type === 'transfer' ? 'active' : ''}" data-type="transfer">Transfer</button>
      </div>
      <input type="hidden" id="txn-type" value="${data.type || 'expense'}">
      ${isEdit ? `<input type="hidden" id="txn-id" value="${data.id}">` : ''}

      <div class="form-group">
        <label>Amount (₹)</label>
        <input type="number" id="txn-amount" class="form-control" value="${data.amount || ''}" placeholder="0" required step="any" min="0">
      </div>

      <div class="form-group">
        <label>Description</label>
        <input type="text" id="txn-desc" class="form-control" value="${escapeHtml(data.description || '')}" placeholder="What was this for?">
      </div>

      <div class="form-group" id="txn-category-group">
        <label>Category</label>
        <select id="txn-category" class="form-control">
          <option value="">Select category</option>
          ${catOptionsForType(data.type || 'expense')}
        </select>
      </div>

      <div class="form-group" id="txn-account-group">
        <label id="txn-account-label">${data.type === 'transfer' ? 'From Account' : 'Account'}</label>
        <select id="txn-account" class="form-control" required>
          <option value="">Select account</option>
          ${accOptions}
        </select>
      </div>

      <div class="form-group" id="txn-to-account-group" style="display:${data.type === 'transfer' ? 'block' : 'none'}">
        <label>To Account</label>
        <select id="txn-to-account" class="form-control">
          <option value="">Select destination</option>
          ${toAccOptions}
        </select>
      </div>

      <div class="form-group">
        <label>Date & Time</label>
        <input type="datetime-local" id="txn-date" class="form-control" value="${dateVal}">
      </div>

      <div class="form-group">
        <label>Notes (optional)</label>
        <textarea id="txn-notes" class="form-control" rows="2" placeholder="Any additional notes...">${escapeHtml(data.notes || '')}</textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="document.querySelector('#modal-overlay').classList.add('hidden')">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'}</button>
      </div>
    </form>
  `);

  // Type tab switching
  $$('#txn-type-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#txn-type-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      $('#txn-type').value = type;
      $('#txn-to-account-group').style.display = type === 'transfer' ? 'block' : 'none';
      $('#txn-category-group').style.display = type === 'transfer' ? 'none' : 'block';
      $('#txn-account-label').textContent = type === 'transfer' ? 'From Account' : 'Account';

      const catSelect = $('#txn-category');
      catSelect.innerHTML = `<option value="">Select category</option>${catOptionsForType(type)}`;
    });
  });

  // Form submission
  $('#txn-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = $('#txn-type').value;
    const amount = parseFloat($('#txn-amount').value);
    const description = $('#txn-desc').value.trim();
    const categoryId = parseInt($('#txn-category').value) || null;
    const accountId = parseInt($('#txn-account').value);
    const toAccountId = type === 'transfer' ? parseInt($('#txn-to-account').value) : null;
    const date = new Date($('#txn-date').value).toISOString();
    const notes = $('#txn-notes').value.trim();

    if (!amount || amount <= 0) { showToast('Please enter a valid amount.', 'warning'); return; }
    if (!accountId) { showToast('Please select an account.', 'warning'); return; }
    if (type === 'transfer' && !toAccountId) { showToast('Please select a destination account.', 'warning'); return; }
    if (type === 'transfer' && accountId === toAccountId) { showToast('Source and destination must be different.', 'warning'); return; }

    try {
      if (isEdit) {
        await updateTransaction(data.id, { type, amount, description, categoryId, accountId, toAccountId, date, notes });
        showToast('Transaction updated!', 'success');
      } else {
        await createTransaction({ type, amount, description, categoryId, accountId, toAccountId, date, notes });
        showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} saved!`, 'success');
      }
      closeModal();
      handleRoute();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ── HOME VIEW ─────────────────────────────────────────────────────────

async function renderHome(container) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [totalLiquid, report, accounts, balances, assets] = await Promise.all([
    getTotalLiquidMoney(),
    getMonthlyReport(year, month),
    getActiveAccounts(),
    getAllBalances(),
    getActiveAssets(),
  ]);

  const recentTxns = await getRecentTransactions(10);
  const categories = await getCategories();
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c);

  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  const netCashFlow = report.netCashFlow;
  const cashFlowClass = netCashFlow >= 0 ? 'savings' : 'expense';

  container.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <p>${getMonthName(month)} ${year}</p>
    </div>

    ${renderQuickEntry()}

    <div class="stats-grid">
      <div class="stat-card balance" style="--card-accent: var(--accent)">
        <div class="stat-label">Total Liquid Money</div>
        <div class="stat-value">${formatCurrency(totalLiquid)}</div>
        <div class="stat-sub">Across ${accounts.length} accounts</div>
      </div>
      <div class="stat-card income">
        <div class="stat-label">Income This Month</div>
        <div class="stat-value">${formatCurrency(report.totalIncome)}</div>
      </div>
      <div class="stat-card expense">
        <div class="stat-label">Expenses This Month</div>
        <div class="stat-value">${formatCurrency(report.totalExpense)}</div>
      </div>
      <div class="stat-card ${cashFlowClass}">
        <div class="stat-label">Net Cash Flow</div>
        <div class="stat-value">${netCashFlow >= 0 ? '+' : ''}${formatCurrency(netCashFlow)}</div>
        <div class="stat-sub">Savings rate: ${report.savingsRate.toFixed(0)}%</div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Accounts</h2>
        <a href="#/accounts" class="btn-link">View All →</a>
      </div>
      <div class="accounts-grid">
        ${accounts.map(acc => {
          const bal = balances[acc.id] || 0;
          return `
            <div class="account-card" onclick="window.location.hash='#/accounts?id=${acc.id}'">
              <div class="acc-icon">${acc.icon || ACCOUNT_TYPE_ICONS[acc.type] || '💳'}</div>
              <div class="acc-name">${escapeHtml(acc.name)}</div>
              <div class="acc-type">${acc.type}</div>
              <div class="acc-balance ${bal >= 0 ? 'positive' : 'negative'}">${formatCurrency(bal)}</div>
            </div>
          `;
        }).join('')}
        ${accounts.length === 0 ? `
          <div class="empty-state" style="grid-column: 1/-1;">
            <div class="emoji">🏦</div>
            <h3>No accounts yet</h3>
            <p>Add your first account to start tracking.</p>
            <button class="btn btn-primary" id="add-first-account">+ Add Account</button>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Recent Transactions</h2>
        <a href="#/transactions" class="btn-link">View All →</a>
      </div>
      <div class="txn-list" id="recent-txn-list">
        ${recentTxns.length === 0 ? `
          <div class="empty-state">
            <div class="emoji">📝</div>
            <h3>No transactions yet</h3>
            <p>Use the fast entry above to record your first transaction, or load sample data to explore reports.</p>
            <div style="display:flex;gap:var(--sp-2);justify-content:center;margin-top:var(--sp-2);">
              <button class="btn btn-sm btn-primary" id="home-load-sample">✨ Load Sample Data</button>
            </div>
          </div>
        ` : renderTransactionList(recentTxns, catMap, accMap)}
      </div>
    </div>

    ${assets.length > 0 ? `
      <div class="section">
        <div class="section-header">
          <h2>Investments</h2>
          <a href="#/investments" class="btn-link">View All →</a>
        </div>
        <div class="accounts-grid">
          ${assets.slice(0, 4).map(a => `
            <div class="asset-card">
              <div class="asset-header">
                <div>
                  <div class="asset-name">${ASSET_TYPE_ICONS[a.type] || '📦'} ${escapeHtml(a.name)}</div>
                  <div class="asset-type">${ASSET_TYPE_LABELS[a.type] || a.type}</div>
                </div>
              </div>
              <div class="asset-value">${formatCurrency(a.currentValue)}</div>
              ${a.investedAmount > 0 ? `
                <div class="asset-invested">Invested: ${formatCurrency(a.investedAmount)}</div>
                <div class="asset-gain ${a.currentValue >= a.investedAmount ? 'positive' : 'negative'}">
                  ${a.currentValue >= a.investedAmount ? '▲' : '▼'} ${formatCurrency(Math.abs(a.currentValue - a.investedAmount))}
                  (${((a.currentValue - a.investedAmount) / a.investedAmount * 100).toFixed(1)}%)
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  await initQuickEntry();

  // Add first account handler
  $('#add-first-account')?.addEventListener('click', () => showAccountModal());

  // Load sample data handler from home empty state
  $('#home-load-sample')?.addEventListener('click', async () => {
    await seedSampleData();
    showToast('Sample demo data loaded!', 'success');
    handleRoute();
  });

  // Transaction item click handlers
  setupTransactionItemHandlers();
}

// ── Transaction List Renderer ─────────────────────────────────────────

function renderTransactionList(txns, catMap, accMap) {
  let html = '';
  let lastDate = '';

  for (const t of txns) {
    const dateStr = t.date?.split('T')[0] || '';
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      html += `<div class="date-group-header">${formatDate(dateStr)}</div>`;
    }

    const cat = catMap[t.categoryId];
    const acc = accMap[t.accountId];
    const toAcc = t.toAccountId ? accMap[t.toAccountId] : null;

    const icon = t.type === 'transfer' ? '🔄' : (cat?.icon || (t.type === 'income' ? '💰' : '📌'));
    const desc = t.description || cat?.name || t.type;
    const accName = t.type === 'transfer'
      ? `${acc?.name || '?'} → ${toAcc?.name || '?'}`
      : (acc?.name || '');

    html += `
      <div class="txn-item" data-txn-id="${t.id}">
        <div class="txn-icon ${t.type}">${icon}</div>
        <div class="txn-details">
          <div class="txn-desc">${escapeHtml(desc)}</div>
          <div class="txn-meta">${cat?.name ? escapeHtml(cat.name) + ' · ' : ''}${formatTime(t.date)}</div>
        </div>
        <div class="txn-amount">
          <div class="amount ${t.type}">${t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}${formatCurrency(t.amount)}</div>
          <div class="account">${escapeHtml(accName)}</div>
        </div>
        <div class="txn-actions">
          <button class="txn-action-btn edit" title="Edit" data-edit-id="${t.id}">✏️</button>
          <button class="txn-action-btn delete" title="Delete" data-delete-id="${t.id}">🗑️</button>
        </div>
      </div>
    `;
  }

  return html;
}

function setupTransactionItemHandlers() {
  $$('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.editId);
      const txn = await getTransaction(id);
      if (txn) showTransactionModal(txn);
    });
  });

  $$('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.deleteId);
      const txn = await getTransaction(id);
      if (txn && confirm(`Delete this ${txn.type} of ${formatCurrency(txn.amount)}?`)) {
        await deleteTransaction(id);
        showToast('Transaction deleted.', 'info', {
          undoFn: async () => {
            await updateTransaction(id, { isDeleted: 0 });
            handleRoute();
          }
        });
        handleRoute();
      }
    });
  });
}

// ── TRANSACTIONS VIEW ─────────────────────────────────────────────────

async function renderTransactions(container) {
  const accounts = await getActiveAccounts();
  const categories = await getCategories();
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c);
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  container.innerHTML = `
    <div class="page-header">
      <h1>Transactions</h1>
      <p>All financial activity</p>
    </div>

    <div class="toolbar">
      <select id="txn-filter-type" class="form-control">
        <option value="">All Types</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
        <option value="transfer">Transfer</option>
      </select>
      <select id="txn-filter-account" class="form-control">
        <option value="">All Accounts</option>
        ${accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}
      </select>
      <input type="month" id="txn-filter-month" class="form-control" value="${new Date().toISOString().slice(0, 7)}">
      <button class="btn btn-primary" id="add-txn-btn">+ New</button>
    </div>

    <div class="txn-list" id="txn-list-container"></div>
  `;

  async function loadTxns() {
    const type = $('#txn-filter-type').value;
    const accountId = parseInt($('#txn-filter-account').value) || null;
    const monthVal = $('#txn-filter-month').value;
    const [y, m] = monthVal.split('-').map(Number);

    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endMonth = m === 12 ? 1 : m + 1;
    const endYear = m === 12 ? y + 1 : y;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    const txns = await getTransactions({ type: type || undefined, accountId, startDate, endDate });
    const listEl = $('#txn-list-container');

    if (txns.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><h3>No transactions found</h3><p>Try adjusting the filters or add a new transaction.</p></div>`;
    } else {
      listEl.innerHTML = renderTransactionList(txns, catMap, accMap);
      setupTransactionItemHandlers();
    }
  }

  $('#txn-filter-type').addEventListener('change', loadTxns);
  $('#txn-filter-account').addEventListener('change', loadTxns);
  $('#txn-filter-month').addEventListener('change', loadTxns);
  $('#add-txn-btn').addEventListener('click', () => showTransactionModal());

  await loadTxns();
}

// ── ACCOUNTS VIEW ─────────────────────────────────────────────────────

async function renderAccounts(container) {
  const accounts = await getAllAccounts();
  const balances = await getAllBalances();

  container.innerHTML = `
    <div class="page-header">
      <h1>Accounts</h1>
      <p>Manage your money locations</p>
    </div>

    <div class="toolbar">
      <button class="btn btn-primary" id="add-account-btn">+ Add Account</button>
      <button class="btn btn-secondary" id="snapshot-btn">📸 Balance Snapshot</button>
    </div>

    <div class="accounts-grid">
      ${accounts.map(acc => {
        const bal = balances[acc.id] || 0;
        const isArchived = !acc.isActive;
        return `
          <div class="account-card ${isArchived ? 'archived' : ''}" style="${isArchived ? 'opacity:0.5' : ''}">
            <div class="acc-icon">${acc.icon || ACCOUNT_TYPE_ICONS[acc.type] || '💳'}</div>
            <div class="acc-name">${escapeHtml(acc.name)} ${isArchived ? '(Archived)' : ''}</div>
            <div class="acc-type">${acc.type}</div>
            <div class="acc-balance ${bal >= 0 ? 'positive' : 'negative'}">${formatCurrency(bal)}</div>
            <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-2);">
              <button class="btn btn-sm btn-secondary edit-acc-btn" data-acc-id="${acc.id}">Edit</button>
              ${acc.isActive ? `<button class="btn btn-sm btn-ghost archive-acc-btn" data-acc-id="${acc.id}">Archive</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
      ${accounts.length === 0 ? `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="emoji">🏦</div>
          <h3>No accounts yet</h3>
          <p>Add accounts like Wallet, Cash, HDFC, PhonePe, etc.</p>
        </div>
      ` : ''}
    </div>
  `;

  $('#add-account-btn').addEventListener('click', () => showAccountModal());
  $('#snapshot-btn').addEventListener('click', () => showSnapshotModal());

  $$('.edit-acc-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const acc = await getAccountById(parseInt(btn.dataset.accId));
      if (acc) showAccountModal(acc);
    });
  });

  $$('.archive-acc-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.accId);
      if (confirm('Archive this account? It will be hidden from active views.')) {
        await archiveAccount(id);
        showToast('Account archived.', 'info');
        handleRoute();
      }
    });
  });
}

async function showAccountModal(data = {}) {
  const isEdit = !!data.id;

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit' : 'New'} Account</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="acc-form">
      <div class="form-group">
        <label>Account Name</label>
        <input type="text" id="acc-name" class="form-control" value="${escapeHtml(data.name || '')}" placeholder="e.g., HDFC Savings, Wallet, PhonePe" required>
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="acc-type" class="form-control">
          <option value="cash" ${data.type === 'cash' ? 'selected' : ''}>💵 Cash</option>
          <option value="bank" ${data.type === 'bank' ? 'selected' : ''}>🏦 Bank Account</option>
          <option value="wallet" ${data.type === 'wallet' ? 'selected' : ''}>👛 Wallet</option>
          <option value="upi" ${data.type === 'upi' ? 'selected' : ''}>📱 UPI / Digital Wallet</option>
          <option value="other" ${data.type === 'other' ? 'selected' : ''}>💳 Other</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Opening Balance (₹)</label>
          <input type="number" id="acc-balance" class="form-control" value="${data.openingBalance || 0}" step="any">
        </div>
        <div class="form-group">
          <label>Balance Date</label>
          <input type="date" id="acc-date" class="form-control" value="${data.openingBalanceDate || todayISO()}">
        </div>
      </div>
      <div class="form-group">
        <label>Notes (optional)</label>
        <textarea id="acc-notes" class="form-control" rows="2">${escapeHtml(data.notes || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="document.querySelector('#modal-overlay').classList.add('hidden')">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </form>
  `);

  $('#acc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#acc-name').value.trim();
    const type = $('#acc-type').value;
    const openingBalance = parseFloat($('#acc-balance').value) || 0;
    const openingBalanceDate = $('#acc-date').value;
    const notes = $('#acc-notes').value.trim();

    if (!name) { showToast('Account name is required.', 'warning'); return; }

    try {
      if (isEdit) {
        await updateAccount(data.id, { name, type, openingBalance, openingBalanceDate, notes });
        showToast('Account updated!', 'success');
      } else {
        await createAccount({ name, type, openingBalance, openingBalanceDate, notes });
        showToast(`Account "${name}" created!`, 'success');
      }
      closeModal();
      handleRoute();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

async function showSnapshotModal() {
  const accounts = await getActiveAccounts();
  const balances = await getAllBalances();

  const rows = accounts.map(a => `
    <div class="form-group">
      <label>${a.icon || ''} ${escapeHtml(a.name)}</label>
      <input type="number" class="form-control snap-balance" data-acc-id="${a.id}" value="${balances[a.id] || 0}" step="any">
    </div>
  `).join('');

  showModal(`
    <div class="modal-header">
      <h3>📸 Balance Snapshot</h3>
      <button class="modal-close">✕</button>
    </div>
    <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-4)">
      Record the actual balance of each account as of a specific date. This creates a historical record and does <strong>not</strong> create any income or expense transactions.
    </p>
    <form id="snapshot-form">
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="snap-date" class="form-control" value="${todayISO()}">
      </div>
      ${rows}
      <div class="form-group">
        <label>Notes (optional)</label>
        <textarea id="snap-notes" class="form-control" rows="2"></textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="document.querySelector('#modal-overlay').classList.add('hidden')">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Snapshot</button>
      </div>
    </form>
  `);

  $('#snapshot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = $('#snap-date').value;
    const notes = $('#snap-notes').value.trim();
    const entries = [];

    $$('.snap-balance').forEach(input => {
      entries.push({
        accountId: parseInt(input.dataset.accId),
        balance: parseFloat(input.value) || 0,
      });
    });

    await createSnapshot(date, entries, notes);
    showToast('Balance snapshot saved!', 'success');
    closeModal();
  });
}

// ── INVESTMENTS VIEW ──────────────────────────────────────────────────

async function renderInvestments(container) {
  const assets = await getActiveAssets();
  const netWorthData = await getNetWorth();

  const totalInvested = assets.reduce((s, a) => s + (a.investedAmount || 0), 0);
  const totalCurrent = assets.reduce((s, a) => s + (a.currentValue || 0), 0);
  const totalGain = totalCurrent - totalInvested;

  container.innerHTML = `
    <div class="page-header">
      <h1>Investments & Assets</h1>
      <p>Track your wealth growth</p>
    </div>

    <div class="networth-hero">
      <div class="networth-label">Estimated Net Worth</div>
      <div class="networth-value">${formatCurrency(netWorthData.netWorth)}</div>
      <div style="margin-top:var(--sp-3);display:flex;justify-content:center;gap:var(--sp-8);">
        <div><span style="color:var(--text-secondary);font-size:var(--fs-xs)">Liquid</span><br><strong>${formatCurrency(netWorthData.totalLiquid)}</strong></div>
        <div><span style="color:var(--text-secondary);font-size:var(--fs-xs)">Investments</span><br><strong>${formatCurrency(netWorthData.totalInvestments)}</strong></div>
      </div>
    </div>

    <div class="toolbar">
      <button class="btn btn-primary" id="add-asset-btn">+ Add Asset</button>
    </div>

    ${assets.length > 0 ? `
      <div class="stats-grid" style="margin-bottom:var(--sp-6)">
        <div class="stat-card income">
          <div class="stat-label">Total Invested</div>
          <div class="stat-value">${formatCurrency(totalInvested)}</div>
        </div>
        <div class="stat-card balance">
          <div class="stat-label">Current Value</div>
          <div class="stat-value">${formatCurrency(totalCurrent)}</div>
        </div>
        <div class="stat-card ${totalGain >= 0 ? 'savings' : 'expense'}">
          <div class="stat-label">Total Gain/Loss</div>
          <div class="stat-value">${totalGain >= 0 ? '+' : ''}${formatCurrency(totalGain)}</div>
          ${totalInvested > 0 ? `<div class="stat-sub">${((totalGain / totalInvested) * 100).toFixed(1)}% return</div>` : ''}
        </div>
      </div>

      <div class="accounts-grid">
        ${assets.map(a => `
          <div class="asset-card">
            <div class="asset-header">
              <div>
                <div class="asset-name">${ASSET_TYPE_ICONS[a.type] || '📦'} ${escapeHtml(a.name)}</div>
                <div class="asset-type">${ASSET_TYPE_LABELS[a.type] || a.type}${a.institution ? ' · ' + escapeHtml(a.institution) : ''}</div>
              </div>
            </div>
            <div class="asset-value">${formatCurrency(a.currentValue)}</div>
            ${a.investedAmount > 0 ? `
              <div class="asset-invested">Invested: ${formatCurrency(a.investedAmount)}</div>
              <div class="asset-gain ${a.currentValue >= a.investedAmount ? 'positive' : 'negative'}">
                ${a.currentValue >= a.investedAmount ? '▲' : '▼'} ${formatCurrency(Math.abs(a.currentValue - a.investedAmount))}
                (${((a.currentValue - a.investedAmount) / a.investedAmount * 100).toFixed(1)}%)
              </div>
            ` : ''}
            <div class="asset-valuation-date">Last valued: ${formatDate(a.lastValuationDate)}</div>
            <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-2);">
              <button class="btn btn-sm btn-primary update-val-btn" data-asset-id="${a.id}">Update Value</button>
              <button class="btn btn-sm btn-secondary edit-asset-btn" data-asset-id="${a.id}">Edit</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="emoji">📈</div>
        <h3>No investments tracked yet</h3>
        <p>Add your FDs, mutual funds, stocks, gold, or any other assets.</p>
      </div>
    `}
  `;

  $('#add-asset-btn').addEventListener('click', () => showAssetModal());

  $$('.update-val-btn').forEach(btn => {
    btn.addEventListener('click', () => showValuationModal(parseInt(btn.dataset.assetId)));
  });

  $$('.edit-asset-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const asset = await db.assets.get(parseInt(btn.dataset.assetId));
      if (asset) showAssetModal(asset);
    });
  });
}

async function showAssetModal(data = {}) {
  const isEdit = !!data.id;

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit' : 'New'} Asset</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="asset-form">
      <div class="form-group">
        <label>Asset Name</label>
        <input type="text" id="asset-name" class="form-control" value="${escapeHtml(data.name || '')}" placeholder="e.g., SBI FD, HDFC Mutual Fund" required>
      </div>
      <div class="form-group">
        <label>Asset Type</label>
        <select id="asset-type" class="form-control">
          ${Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${data.type === k ? 'selected' : ''}>${ASSET_TYPE_ICONS[k]} ${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Institution / Provider</label>
        <input type="text" id="asset-institution" class="form-control" value="${escapeHtml(data.institution || '')}" placeholder="e.g., SBI, HDFC, Zerodha">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Invested Amount (₹)</label>
          <input type="number" id="asset-invested" class="form-control" value="${data.investedAmount || ''}" step="any" min="0">
        </div>
        <div class="form-group">
          <label>Current Value (₹)</label>
          <input type="number" id="asset-current" class="form-control" value="${data.currentValue || ''}" step="any" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Purchase / Start Date</label>
          <input type="date" id="asset-purchase-date" class="form-control" value="${data.purchaseDate || ''}">
        </div>
        <div class="form-group">
          <label>Valuation Date</label>
          <input type="date" id="asset-val-date" class="form-control" value="${data.lastValuationDate || todayISO()}">
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="asset-notes" class="form-control" rows="2">${escapeHtml(data.notes || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="document.querySelector('#modal-overlay').classList.add('hidden')">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Add Asset'}</button>
      </div>
    </form>
  `);

  $('#asset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const assetData = {
      name: $('#asset-name').value.trim(),
      type: $('#asset-type').value,
      institution: $('#asset-institution').value.trim(),
      investedAmount: parseFloat($('#asset-invested').value) || 0,
      currentValue: parseFloat($('#asset-current').value) || 0,
      purchaseDate: $('#asset-purchase-date').value,
      lastValuationDate: $('#asset-val-date').value || todayISO(),
      notes: $('#asset-notes').value.trim(),
    };

    if (!assetData.name) { showToast('Asset name is required.', 'warning'); return; }

    try {
      if (isEdit) {
        await updateAsset(data.id, assetData);
        if (assetData.currentValue !== data.currentValue) {
          await addValuation(data.id, assetData.currentValue, assetData.lastValuationDate, 'Manual update');
        }
        showToast('Asset updated!', 'success');
      } else {
        await createAsset(assetData);
        showToast('Asset added!', 'success');
      }
      closeModal();
      handleRoute();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

async function showValuationModal(assetId) {
  const asset = await db.assets.get(assetId);
  if (!asset) return;

  const valuations = await getValuations(assetId);

  showModal(`
    <div class="modal-header">
      <h3>Update Value: ${escapeHtml(asset.name)}</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="val-form">
      <div class="form-row">
        <div class="form-group">
          <label>New Value (₹)</label>
          <input type="number" id="val-amount" class="form-control" value="${asset.currentValue}" step="any" min="0" required>
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="val-date" class="form-control" value="${todayISO()}">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="document.querySelector('#modal-overlay').classList.add('hidden')">Cancel</button>
        <button type="submit" class="btn btn-primary">Update</button>
      </div>
    </form>
    ${valuations.length > 0 ? `
      <div style="margin-top:var(--sp-5);border-top:1px solid var(--border);padding-top:var(--sp-4)">
        <h4 style="font-size:var(--fs-sm);margin-bottom:var(--sp-3)">Valuation History</h4>
        <div class="txn-list">
          ${valuations.reverse().slice(0, 10).map(v => `
            <div class="txn-item" style="cursor:default">
              <div class="txn-details">
                <div class="txn-desc">${formatDate(v.date)}</div>
              </div>
              <div class="txn-amount">
                <div class="amount" style="color:var(--accent)">${formatCurrency(v.value)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `);

  $('#val-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = parseFloat($('#val-amount').value);
    const date = $('#val-date').value;

    if (!value || value < 0) { showToast('Enter a valid value.', 'warning'); return; }

    await addValuation(assetId, value, date, 'Manual update');
    showToast('Valuation updated!', 'success');
    closeModal();
    handleRoute();
  });
}

// ── REPORTS VIEW ──────────────────────────────────────────────────────

let reportCharts = [];

async function renderReports(container) {
  // Destroy existing charts
  reportCharts.forEach(c => c.destroy());
  reportCharts = [];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const report = await getMonthlyReport(year, month);
  const prevReport = await getPreviousMonthReport(year, month);
  const accounts = await getActiveAccounts();
  const balances = await getAllBalances();
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  const expenseChange = prevReport.totalExpense > 0
    ? ((report.totalExpense - prevReport.totalExpense) / prevReport.totalExpense * 100).toFixed(0)
    : null;
  const incomeChange = prevReport.totalIncome > 0
    ? ((report.totalIncome - prevReport.totalIncome) / prevReport.totalIncome * 100).toFixed(0)
    : null;

  // Sort categories by amount
  const sortedExpCats = Object.entries(report.expenseByCategory).sort((a, b) => b[1] - a[1]);
  const sortedIncCats = Object.entries(report.incomeByCategory).sort((a, b) => b[1] - a[1]);

  container.innerHTML = `
    <div class="page-header">
      <h1>Reports</h1>
      <p>${getMonthName(month)} ${year}</p>
    </div>

    <div class="toolbar">
      <input type="month" id="report-month" class="form-control" value="${year}-${String(month).padStart(2, '0')}">
      <button class="btn btn-secondary" id="export-csv-btn">📥 Export CSV</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card income">
        <div class="stat-label">Total Income</div>
        <div class="stat-value">${formatCurrency(report.totalIncome)}</div>
        ${incomeChange !== null ? `<div class="comparison ${Number(incomeChange) > 0 ? 'up' : 'down'}" style="color: ${Number(incomeChange) > 0 ? 'var(--green)' : 'var(--red)'}">${incomeChange > 0 ? '↑' : '↓'} ${Math.abs(incomeChange)}% vs last month</div>` : ''}
      </div>
      <div class="stat-card expense">
        <div class="stat-label">Total Expenses</div>
        <div class="stat-value">${formatCurrency(report.totalExpense)}</div>
        ${expenseChange !== null ? `<div class="comparison ${Number(expenseChange) > 0 ? 'up' : 'down'}">${expenseChange > 0 ? '↑' : '↓'} ${Math.abs(expenseChange)}% vs last month</div>` : ''}
      </div>
      <div class="stat-card ${report.netCashFlow >= 0 ? 'savings' : 'expense'}">
        <div class="stat-label">Net Cash Flow</div>
        <div class="stat-value">${report.netCashFlow >= 0 ? '+' : ''}${formatCurrency(report.netCashFlow)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Daily Avg Spending</div>
        <div class="stat-value">${formatCurrency(report.dailyAvgSpending)}</div>
        <div class="stat-sub">${report.daysPassed} days tracked</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);">
      <div class="chart-container">
        <h3>Expenses by Category</h3>
        <canvas id="expense-pie-chart"></canvas>
      </div>
      <div class="chart-container">
        <h3>Daily Spending</h3>
        <canvas id="daily-bar-chart"></canvas>
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2>Expense Breakdown</h2></div>
      <div class="breakdown-list">
        ${sortedExpCats.map(([name, amount], i) => {
          const pct = report.totalExpense > 0 ? (amount / report.totalExpense * 100) : 0;
          return `
            <div class="breakdown-item">
              <div class="breakdown-name">${escapeHtml(name)}</div>
              <div class="breakdown-bar-bg"><div class="breakdown-bar" style="width:${pct}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></div></div>
              <div class="breakdown-value">${formatCurrency(amount)}</div>
            </div>
          `;
        }).join('')}
        ${sortedExpCats.length === 0 ? '<p style="color:var(--text-muted);font-size:var(--fs-sm)">No expenses this month</p>' : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2>Income Breakdown</h2></div>
      <div class="breakdown-list">
        ${sortedIncCats.map(([name, amount], i) => {
          const pct = report.totalIncome > 0 ? (amount / report.totalIncome * 100) : 0;
          return `
            <div class="breakdown-item">
              <div class="breakdown-name">${escapeHtml(name)}</div>
              <div class="breakdown-bar-bg"><div class="breakdown-bar" style="width:${pct}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></div></div>
              <div class="breakdown-value">${formatCurrency(amount)}</div>
            </div>
          `;
        }).join('')}
        ${sortedIncCats.length === 0 ? '<p style="color:var(--text-muted);font-size:var(--fs-sm)">No income this month</p>' : ''}
      </div>
    </div>

    ${report.largestExpense ? `
      <div class="section">
        <div class="section-header"><h2>Largest Expense</h2></div>
        <div class="stat-card expense" style="max-width:400px">
          <div class="stat-value">${formatCurrency(report.largestExpense.amount)}</div>
          <div class="stat-sub">${escapeHtml(report.largestExpense.description || 'No description')} · ${formatDate(report.largestExpense.date)}</div>
        </div>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-header"><h2>Spending by Account</h2></div>
      <div class="breakdown-list">
        ${Object.entries(report.expenseByAccount).sort((a, b) => b[1] - a[1]).map(([accId, amount], i) => {
          const acc = accMap[parseInt(accId)];
          const pct = report.totalExpense > 0 ? (amount / report.totalExpense * 100) : 0;
          return `
            <div class="breakdown-item">
              <div class="breakdown-name">${acc ? escapeHtml(acc.name) : 'Unknown'}</div>
              <div class="breakdown-bar-bg"><div class="breakdown-bar" style="width:${pct}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></div></div>
              <div class="breakdown-value">${formatCurrency(amount)}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // ── Charts ──
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#9090b0' : '#555577';

  Chart.defaults.color = textColor;
  Chart.defaults.font.family = 'Inter';

  // Expense Pie
  if (sortedExpCats.length > 0) {
    const ctx1 = document.getElementById('expense-pie-chart');
    if (ctx1) {
      const chart1 = new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: sortedExpCats.map(([n]) => n),
          datasets: [{
            data: sortedExpCats.map(([, v]) => v),
            backgroundColor: CHART_COLORS.slice(0, sortedExpCats.length),
            borderWidth: 0,
            hoverBorderWidth: 2,
            hoverBorderColor: isDark ? '#fff' : '#000',
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom', labels: { padding: 12, boxWidth: 12 } },
          },
          cutout: '65%',
        },
      });
      reportCharts.push(chart1);
    }
  }

  // Daily spending bar chart
  const dailyData = report.dailyExpenses;
  const daysInMonth = report.daysInMonth;
  const labels = [];
  const values = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    labels.push(d);
    values.push(dailyData[key] || 0);
  }

  const ctx2 = document.getElementById('daily-bar-chart');
  if (ctx2) {
    const chart2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Spending',
          data: values,
          backgroundColor: CHART_COLORS[0] + '80',
          borderColor: CHART_COLORS[0],
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
          y: { grid: { color: gridColor }, ticks: { callback: v => '₹' + v } },
        },
      },
    });
    reportCharts.push(chart2);
  }

  // Month change handler
  $('#report-month').addEventListener('change', async (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    reportCharts.forEach(c => c.destroy());
    reportCharts = [];

    const newReport = await getMonthlyReport(y, m);
    // Re-render with new data (simplified - just re-call renderReports)
    await renderReports(container);
  });

  // CSV export
  $('#export-csv-btn').addEventListener('click', async () => {
    const csv = await exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nick-wealth-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
  });
}

// ── SETTINGS VIEW ─────────────────────────────────────────────────────

async function renderSettings(container) {
  const theme = await getSetting('theme') || 'dark';
  const categories = await getCategories();
  const expCats = categories.filter(c => c.type === 'expense');
  const incCats = categories.filter(c => c.type === 'income');

  container.innerHTML = `
    <div class="page-header">
      <h1>Settings</h1>
      <p>Customize your app</p>
    </div>

    <div class="section">
      <div class="section-header"><h2>Appearance</h2></div>
      <div class="stat-card" style="max-width:400px">
        <div class="form-group" style="margin:0">
          <label>Theme</label>
          <select id="settings-theme" class="form-control">
            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>🌙 Dark</option>
            <option value="light" ${theme === 'light' ? 'selected' : ''}>☀️ Light</option>
          </select>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Expense Categories</h2>
        <button class="btn btn-sm btn-primary" id="add-exp-cat">+ Add</button>
      </div>
      <div class="txn-list" id="exp-cat-list">
        ${expCats.map(c => `
          <div class="txn-item" style="cursor:default">
            <div class="txn-icon" style="background:var(--accent-bg)">${c.icon || '📌'}</div>
            <div class="txn-details">
              <div class="txn-desc">${escapeHtml(c.name)}</div>
              <div class="txn-meta">Keywords: ${escapeHtml(c.keywords || '')}</div>
            </div>
            <div class="txn-actions" style="opacity:1">
              <button class="txn-action-btn edit-cat-btn" data-cat-id="${c.id}" title="Edit">✏️</button>
              <button class="txn-action-btn delete delete-cat-btn" data-cat-id="${c.id}" title="Delete">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Income Categories</h2>
        <button class="btn btn-sm btn-primary" id="add-inc-cat">+ Add</button>
      </div>
      <div class="txn-list" id="inc-cat-list">
        ${incCats.map(c => `
          <div class="txn-item" style="cursor:default">
            <div class="txn-icon" style="background:var(--green-bg)">${c.icon || '📌'}</div>
            <div class="txn-details">
              <div class="txn-desc">${escapeHtml(c.name)}</div>
              <div class="txn-meta">Keywords: ${escapeHtml(c.keywords || '')}</div>
            </div>
            <div class="txn-actions" style="opacity:1">
              <button class="txn-action-btn edit-cat-btn" data-cat-id="${c.id}" title="Edit">✏️</button>
              <button class="txn-action-btn delete delete-cat-btn" data-cat-id="${c.id}" title="Delete">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2>Data Management</h2></div>
      <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;">
        <button class="btn btn-secondary" id="export-backup-btn">📦 Export Backup</button>
        <button class="btn btn-secondary" id="import-backup-btn">📂 Import Backup</button>
        <button class="btn btn-secondary" id="export-csv-settings-btn">📥 Export CSV</button>
      </div>
      <input type="file" id="import-file-input" accept=".json" style="display:none">
    </div>

    <div class="section">
      <div class="section-header"><h2>Wealth Manifestation</h2></div>
      <p style="color:var(--text-secondary);font-size:var(--fs-sm);margin-bottom:var(--sp-3)">
        Recharge your abundance mindset anytime with your bespoke billionaire visualization.
      </p>
      <button class="btn btn-secondary" id="open-manifest-settings-btn" style="border-color:#fbbf24;color:#fbbf24">
        👑 View Wealth Manifestation Screen
      </button>
    </div>

    <div class="section">
      <div class="section-header"><h2>Demo & Test Data</h2></div>
      <p style="color:var(--text-secondary);font-size:var(--fs-sm);margin-bottom:var(--sp-3)">
        Explore Nick Wealth OS with realistic financial data (salary, UPI spends, PPF, Mutual Funds, Gold, FD, and snapshots).
      </p>
      <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;">
        <button class="btn btn-primary" id="load-sample-btn">✨ Load Sample Demo Data</button>
        <button class="btn btn-danger" id="reset-data-btn">🗑️ Reset All Data</button>
      </div>
    </div>
  `;

  // Theme switcher
  $('#settings-theme').addEventListener('change', async (e) => {
    const theme = e.target.value;
    document.documentElement.setAttribute('data-theme', theme);
    await setSetting('theme', theme);
    showToast(`Theme changed to ${theme}`, 'success');
  });

  // Category management
  $('#add-exp-cat')?.addEventListener('click', () => showCategoryModal('expense'));
  $('#add-inc-cat')?.addEventListener('click', () => showCategoryModal('income'));

  $$('.edit-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cat = await db.categories.get(parseInt(btn.dataset.catId));
      if (cat) showCategoryModal(cat.type, cat);
    });
  });

  $$('.delete-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.catId);
      if (confirm('Delete this category?')) {
        await deleteCategory(id);
        showToast('Category deleted.', 'info');
        handleRoute();
      }
    });
  });

  // Data management
  $('#export-backup-btn').addEventListener('click', async () => {
    const json = await exportFullBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nick-wealth-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exported!', 'success');
  });

  $('#import-backup-btn').addEventListener('click', () => {
    $('#import-file-input').click();
  });

  $('#import-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('⚠️ This will REPLACE all current data with the backup. Are you sure?')) return;

    try {
      const text = await file.text();
      await importFullBackup(text);
      showToast('Backup restored successfully!', 'success');
      handleRoute();
    } catch (err) {
      showToast('Failed to restore: ' + err.message, 'error');
    }
  });

  $('#export-csv-settings-btn').addEventListener('click', async () => {
    const csv = await exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nick-wealth-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
  });

  // Reopen Manifestation Screen
  $('#open-manifest-settings-btn')?.addEventListener('click', () => {
    $('#manifestation-screen')?.classList.remove('entered');
  });

  // Demo data and reset handlers
  $('#load-sample-btn')?.addEventListener('click', async () => {
    if (confirm('Load sample transactions, investments, accounts, and reports? This will populate demo data for instant testing.')) {
      await seedSampleData();
      showToast('Sample demo data loaded successfully!', 'success');
      handleRoute();
    }
  });

  $('#reset-data-btn')?.addEventListener('click', async () => {
    if (confirm('⚠️ Are you sure you want to delete ALL accounts, transactions, and investments?')) {
      await clearAllData();
      showToast('All data reset to clean state.', 'info');
      handleRoute();
    }
  });
}

async function showCategoryModal(type, data = {}) {
  const isEdit = !!data.id;

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit' : 'New'} ${type === 'income' ? 'Income' : 'Expense'} Category</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="cat-form">
      <div class="form-group">
        <label>Category Name</label>
        <input type="text" id="cat-name" class="form-control" value="${escapeHtml(data.name || '')}" required placeholder="e.g., Subscriptions">
      </div>
      <div class="form-group">
        <label>Icon (emoji)</label>
        <input type="text" id="cat-icon" class="form-control" value="${data.icon || '📌'}" placeholder="📌" maxlength="4">
      </div>
      <div class="form-group">
        <label>Keywords (comma-separated, for quick entry matching)</label>
        <input type="text" id="cat-keywords" class="form-control" value="${escapeHtml(data.keywords || '')}" placeholder="e.g., netflix,spotify,subscription">
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="document.querySelector('#modal-overlay').classList.add('hidden')">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </form>
  `);

  $('#cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#cat-name').value.trim();
    const icon = $('#cat-icon').value.trim() || '📌';
    const keywords = $('#cat-keywords').value.trim();

    if (!name) { showToast('Name required.', 'warning'); return; }

    try {
      if (isEdit) {
        await updateCategory(data.id, { name, icon, keywords });
        showToast('Category updated!', 'success');
      } else {
        await createCategory({ name, type, icon, keywords });
        showToast('Category created!', 'success');
      }
      closeModal();
      handleRoute();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ── Initialize App ────────────────────────────────────────────────────

async function init() {
  // Seed default data
  await seedDefaults();

  // Load theme
  const savedTheme = await getSetting('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  // Init voice
  initVoice();

  // Theme toggle buttons
  $$('#theme-toggle-desktop').forEach(btn => {
    btn.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      await setSetting('theme', next);
    });
  });

  // Route handler
  window.addEventListener('hashchange', handleRoute);
  await handleRoute();

  // Manifestation Screen logic
  const manifestationScreen = $('#manifestation-screen');
  const enterAppBtn = $('#enter-app-btn');
  const profileTrigger = $('#sidebar-profile-btn');

  function openManifestation() {
    if (manifestationScreen) {
      manifestationScreen.classList.remove('entered');
    }
  }

  function closeManifestation() {
    if (manifestationScreen) {
      manifestationScreen.classList.add('entered');
      sessionStorage.setItem('nick_entered_engine', 'true');
    }
  }

  if (enterAppBtn) {
    enterAppBtn.addEventListener('click', closeManifestation);
  }

  if (profileTrigger) {
    profileTrigger.addEventListener('click', openManifestation);
  }

  // Check if session has already entered
  if (sessionStorage.getItem('nick_entered_engine') === 'true') {
    manifestationScreen?.classList.add('entered');
  }

  // Global Quick Add Floating Action Button
  const fab = $('#global-fab');
  if (fab) {
    fab.addEventListener('click', () => {
      showTransactionModal();
    });
  }

  // Keyboard shortcut: '+' or 'n' or 'N' (when not focused on input) opens Transaction Modal
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key === '+' || e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      showTransactionModal();
    }
  });
}

// Start app
init().catch(err => {
  console.error('App initialization failed:', err);
  document.getElementById('view-container').innerHTML = `
    <div class="empty-state">
      <div class="emoji">⚠️</div>
      <h3>Something went wrong</h3>
      <p>${err.message}</p>
    </div>
  `;
});
