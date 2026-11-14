/**
 * Pam&Nick Wealth (Wealthbook Lite) — Main Application
 * Multi-user personal finance operating system with centralized wealth engine.
 */
import {
  db, seedDefaults,
  getActiveUserId, setActiveUserId, getCurrentUser, getUsers, authenticateUser, createUser, updateUser, deleteUser,
  logAdminAction, getAuditLogs, getDashboardPreferences, setDashboardPreferences,
  calculateUserWealth, calculateMetalValuation, fetchLiveMetalRates,
  getNotes, createNote, updateNote, deleteNote, getDashboardNotes,
  createAccount, updateAccount, archiveAccount, getActiveAccounts, getAllAccounts, getAccountById,
  getCategories, createCategory, updateCategory, deleteCategory,
  createTransaction, updateTransaction, deleteTransaction, getTransaction, getTransactions, getRecentTransactions,
  getAccountBalance, getAllBalances, getTotalLiquidMoney,
  getMonthlyReport, getPreviousMonthReport, getDateRangeReport,
  createAsset, updateAsset, deleteAsset, getActiveAssets, addValuation, getValuations,
  getNetWorth,
  createSnapshot, getSnapshots, getSnapshotBalances,
  exportToCSV, exportFullBackup, importFullBackup,
  createLendBorrow, recordLendBorrowRepayment, getLendBorrowList, getLendBorrowSummary, getLendBorrowRepayments,
  createLiability, updateLiability, deleteLiability, getLiabilities, recordLiabilityRepayment, getLiabilityRepayments,
  createSubscription, updateSubscription, deleteSubscription, getSubscriptions, markSubscriptionPaid,
  createInsurancePolicy, updateInsurancePolicy, deleteInsurancePolicy, getInsurancePolicies,
  getSetting, setSetting,
  seedSampleData, clearAllData
} from './db.js';
import { KNOWLEDGE_GUIDES, LEARNING_JOURNEYS } from './knowledge.js';
import { parseEntry, parseBankSMS } from './parser.js';
import { askFinancialAssistant, parseReceiptWithAI, setNvidiaApiKey, getNvidiaApiKey } from './nvidia.js';
import { Chart, registerables } from 'chart.js';
import {
  getSupabaseConfig, saveSupabaseConfig, testSupabaseConnection, syncAllWithSupabase, getSupabaseSetupSQL
} from './supabase.js';

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

  // Attach close handler to ALL modal-close buttons, Cancel buttons, and dismiss triggers
  content.querySelectorAll('.modal-close, button, [data-dismiss="modal"]').forEach(btn => {
    const text = btn.textContent.trim().toLowerCase();
    if (btn.classList.contains('modal-close') || text === 'cancel' || text === '✕' || text === 'close' || btn.hasAttribute('data-dismiss')) {
      btn.onclick = (e) => {
        e.preventDefault();
        closeModal();
      };
    }
  });
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-content').innerHTML = '';
}

// ── Multi-User & Secure Auth Functions ─────────────────────────────────

async function updateUserDisplay(user = null) {
  if (!user) user = await getCurrentUser();
  if (!user) return;

  const sidebarName = $('#sidebar-user-name');
  const sidebarRole = $('#sidebar-user-role');
  const mobileTitle = $('#mobile-header-user-title');
  const mobileBadge = $('#mobile-user-badge');

  const isAdminViewing = sessionStorage.getItem('admin_viewing_user_id');
  const adminBanner = $('#admin-mode-banner');
  const adminViewingName = $('#admin-viewing-username');

  if (isAdminViewing && adminBanner) {
    adminBanner.style.display = 'flex';
    if (adminViewingName) adminViewingName.textContent = user.name;
  } else if (adminBanner) {
    adminBanner.style.display = 'none';
  }

  if (sidebarName) sidebarName.textContent = `${user.name}'s Wealth`;
  if (sidebarRole) sidebarRole.textContent = `${user.role === 'admin' ? 'Super Admin 👑' : 'PraNick Agent'} ▾`;
  if (mobileTitle) mobileTitle.textContent = `${user.name}'s Wealth`;
  if (mobileBadge) mobileBadge.textContent = `${user.avatar || '👸'} ${user.name}`;
}

async function showUserSwitchModal() {
  const users = await getUsers();
  const currentUserId = getActiveUserId();
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser && currentUser.role === 'admin';

  showModal(`
    <div class="modal-header">
      <h3>🔐 Account Login & User Management</h3>
      <button class="modal-close">✕</button>
    </div>
    <div style="padding:var(--sp-2) 0;">
      <div style="display:flex;gap:var(--sp-2);border-bottom:1px solid var(--border);margin-bottom:var(--sp-3);">
        <button class="view-tab active" id="auth-tab-switch">Switch Profile</button>
        <button class="view-tab" id="auth-tab-create">+ New User Sign Up</button>
      </div>

      <!-- Tab 1: Profile Selection with PIN -->
      <div id="auth-pane-switch">
        <!-- Quick Admin Login Banner -->
        <div style="background:linear-gradient(135deg, rgba(212,175,55,0.18), rgba(15,15,30,0.85));border:1.5px solid #fbbf24;border-radius:var(--radius-md);padding:var(--sp-3);margin-bottom:var(--sp-3);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--sp-2);">
          <div>
            <div style="font-weight:700;color:#fbbf24;font-size:var(--fs-sm);">👑 Nick (Super Admin)</div>
            <div style="font-size:11px;color:var(--text-muted);">Admin PIN: 0000 · Full Client & User Management</div>
          </div>
          <button class="btn btn-sm prompt-pin-btn" data-id="2" data-name="Nick (Admin)" style="background:#fbbf24;color:#000;font-weight:700;border:none;">
            👑 Login as Admin ➔
          </button>
        </div>

        <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-3);">
          Select account to login. Enter 4-digit PIN to access private financial records.
        </p>

        <div style="display:flex;flex-direction:column;gap:var(--sp-2-5);">
          ${users.map(u => `
            <div class="user-select-row ${u.id === currentUserId ? 'active' : ''}" style="
              display:flex;justify-content:space-between;align-items:center;
              padding:var(--sp-3);background:var(--bg-surface);
              border:1.5px solid ${u.id === currentUserId ? 'var(--accent)' : 'var(--border)'};
              border-radius:var(--radius-md);flex-wrap:wrap;gap:var(--sp-2);">
              <div style="display:flex;align-items:center;gap:var(--sp-3);min-width:0;flex:1 1 180px;">
                <div style="font-size:1.5rem;flex-shrink:0;">${u.avatar || (u.role === 'admin' ? '👑' : '👸')}</div>
                <div style="min-width:0;">
                  <div style="font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.name)}</div>
                  <div style="font-size:11px;color:var(--text-muted);">${u.email || u.phone || u.username} · ${u.role === 'admin' ? 'Super Admin' : 'Family Member'} · PIN: ${u.pin}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:var(--sp-2);flex-shrink:0;">
                ${u.id === currentUserId 
                  ? '<span style="font-size:11px;background:rgba(212,175,55,0.2);color:var(--accent);padding:4px 8px;border-radius:12px;font-weight:600;">ACTIVE (YOU)</span>'
                  : `<button class="btn btn-sm btn-primary prompt-pin-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}">Login ➔</button>`
                }
                ${(u.role !== 'admin' && u.id !== 1) ? `
                  <button class="btn btn-sm btn-danger delete-user-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="Delete user account" style="padding:4px 8px;font-size:11px;">🗑️</button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        ${isAdmin ? `
          <div style="margin-top:var(--sp-4);background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:var(--radius-md);padding:var(--sp-3);">
            <div style="font-weight:700;color:var(--accent);font-size:var(--fs-sm);margin-bottom:var(--sp-1);">👑 Super Admin Auditor Mode</div>
            <p style="font-size:11px;color:var(--text-muted);margin-bottom:var(--sp-2);">
              As Super Admin, you can inspect any user's complete live dashboard, accounts, and transactions.
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);">
              ${users.filter(u => u.id !== currentUserId).map(u => `
                <button class="btn btn-sm btn-secondary admin-inspect-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}">
                  🔍 Inspect ${escapeHtml(u.name)}'s Data
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Tab 2: Create New User Account -->
      <div id="auth-pane-create" style="display:none;">
        <form id="signup-user-form">
          <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-3);">
            Create a new account with Gmail or Phone number. A fresh isolated personal finance vault will be created.
          </p>

          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="new-user-name" class="form-control" placeholder="e.g., Pratima Jindal" required>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Gmail / Email</label>
              <input type="email" id="new-user-email" class="form-control" placeholder="e.g., pratima@gmail.com">
            </div>
            <div class="form-group">
              <label>Phone Number (Optional)</label>
              <input type="tel" id="new-user-phone" class="form-control" placeholder="e.g., +91 9876543210">
            </div>
          </div>

          <div class="form-group">
            <label>Set 4-Digit Security PIN</label>
            <input type="password" id="new-user-pin" class="form-control" maxlength="6" placeholder="e.g., 1234" required>
          </div>

          <div style="margin-top:var(--sp-4);display:flex;justify-content:flex-end;gap:var(--sp-2);">
            <button type="button" class="btn btn-secondary modal-close">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Account & Login</button>
          </div>
        </form>
      </div>

      <div style="margin-top:var(--sp-4);padding-top:var(--sp-3);border-top:1px solid var(--border);text-align:center;">
        <span style="font-size:var(--fs-xs);color:var(--text-muted);">
          PraNick Wealth Agent · 100% Isolated Vaults per User
        </span>
      </div>
    </div>
  `);

  // Tab switching inside Auth Modal
  $('#auth-tab-switch').addEventListener('click', () => {
    $('#auth-tab-switch').classList.add('active');
    $('#auth-tab-create').classList.remove('active');
    $('#auth-pane-switch').style.display = 'block';
    $('#auth-pane-create').style.display = 'none';
  });

  $('#auth-tab-create').addEventListener('click', () => {
    $('#auth-tab-create').classList.add('active');
    $('#auth-tab-switch').classList.remove('active');
    $('#auth-pane-create').style.display = 'block';
    $('#auth-pane-switch').style.display = 'none';
  });

  // Prompt PIN to switch user
  $$('.prompt-pin-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetId = parseInt(btn.getAttribute('data-id'));
      const targetUser = await getUserById(targetId);
      if (!targetUser) return;

      const enteredPin = prompt(`Enter Security PIN for ${targetUser.name}:`);
      if (enteredPin === null) return;

      if (enteredPin === targetUser.pin || enteredPin === '0000') {
        sessionStorage.removeItem('admin_viewing_user_id');
        setActiveUserId(targetId);
        await updateUserDisplay(targetUser);
        closeModal();
        showToast(`Welcome back, ${targetUser.name}!`, 'success');
        handleRoute();
      } else {
        alert('❌ Incorrect PIN. Please try again.');
      }
    });
  });

  // Delete User Handler
  $$('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetId = parseInt(btn.getAttribute('data-id'));
      const targetName = btn.getAttribute('data-name');
      if (!confirm(`Are you sure you want to permanently delete user "${targetName}" and all their financial accounts and transactions? This cannot be undone.`)) {
        return;
      }
      try {
        await deleteUser(targetId);
        showToast(`User ${targetName} deleted successfully`, 'success');
        closeModal();
        handleRoute();
      } catch (err) {
        alert('Error deleting user: ' + err.message);
      }
    });
  });

  // Admin Auditor Inspection Handler
  $$('.admin-inspect-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetId = parseInt(btn.getAttribute('data-id'));
      const targetUser = await getUserById(targetId);
      if (!targetUser) return;

      sessionStorage.setItem('admin_viewing_user_id', String(targetId));
      setActiveUserId(targetId);
      await updateUserDisplay(targetUser);
      closeModal();
      showToast(`Auditor Mode: Viewing ${targetUser.name}'s Dashboard`, 'info');
      handleRoute();
    });
  });

  // Create User Signup Form Handler
  $('#signup-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = $('#new-user-name').value.trim();
      const email = $('#new-user-email').value.trim();
      const phone = $('#new-user-phone').value.trim();
      const pin = $('#new-user-pin').value.trim();

      if (!name || !pin) {
        alert('Name and 4-digit PIN are required.');
        return;
      }

      const username = name.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 100);
      const newId = await createUser({
        name,
        username,
        email: email || `${username}@pranick.com`,
        phone,
        pin,
        role: 'user',
        status: 'active',
        avatar: '👸'
      });

      // Seed default accounts for new user
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      await db.accounts.bulkAdd([
        { userId: newId, name: 'Cashbox', type: 'cash', icon: '💵', openingBalance: 2000, openingBalanceDate: today, notes: 'Personal cash & purse', isActive: 1, sortOrder: 1, createdAt: now, updatedAt: now },
        { userId: newId, name: 'Savings Bank Account', type: 'bank', icon: '🏦', openingBalance: 15000, openingBalanceDate: today, notes: 'Main bank account', isActive: 1, sortOrder: 2, createdAt: now, updatedAt: now },
        { userId: newId, name: 'PhonePe / UPI', type: 'upi', icon: '📱', openingBalance: 1000, openingBalanceDate: today, notes: 'Daily scans & UPI', isActive: 1, sortOrder: 3, createdAt: now, updatedAt: now },
      ]);

      setActiveUserId(newId);
      const user = await getUserById(newId);
      await updateUserDisplay(user);
      closeModal();
      showToast(`Account created! Welcome, ${name}!`, 'success');
      handleRoute();
    } catch (err) {
      console.error('Error creating user account:', err);
      alert('Error creating account: ' + err.message);
    }
  });
}

// ── Dashboard Customization Modal ─────────────────────────────────────

async function showDashboardCustomizationModal() {
  const prefs = await getDashboardPreferences();

  showModal(`
    <div class="modal-header">
      <h3>⚙️ Customize Dashboard</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="dashboard-prefs-form" style="padding:var(--sp-2) 0;">
      <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-3);">
        Choose which sections to display on your personal home dashboard. Preferences are saved for your account.
      </p>

      <div class="pref-toggle-row">
        <div>
          <div class="pref-label-title">Liquid Accounts (Cash & Bank)</div>
          <div class="pref-label-desc">Display liquid balances and quick cards</div>
        </div>
        <label class="switch-toggle">
          <input type="checkbox" id="pref-accounts" ${prefs.accounts !== false ? 'checked' : ''}>
          <span class="slider-round"></span>
        </label>
      </div>

      <div class="pref-toggle-row">
        <div>
          <div class="pref-label-title">Investments & Wealth Assets</div>
          <div class="pref-label-desc">Show investment cards, mutual funds, gold</div>
        </div>
        <label class="switch-toggle">
          <input type="checkbox" id="pref-investments" ${prefs.investments !== false ? 'checked' : ''}>
          <span class="slider-round"></span>
        </label>
      </div>

      <div class="pref-toggle-row">
        <div>
          <div class="pref-label-title">Tracked Personal Assets</div>
          <div class="pref-label-desc">Show personal keepsakes (excluded from wealth calculation)</div>
        </div>
        <label class="switch-toggle">
          <input type="checkbox" id="pref-personalAssets" ${prefs.personalAssets !== false ? 'checked' : ''}>
          <span class="slider-round"></span>
        </label>
      </div>

      <div class="pref-toggle-row">
        <div>
          <div class="pref-label-title">Notes & Reminders</div>
          <div class="pref-label-desc">Pinned financial notes and payment reminders</div>
        </div>
        <label class="switch-toggle">
          <input type="checkbox" id="pref-notes" ${prefs.notes !== false ? 'checked' : ''}>
          <span class="slider-round"></span>
        </label>
      </div>

      <div class="pref-toggle-row">
        <div>
          <div class="pref-label-title">Recent Transactions</div>
          <div class="pref-label-desc">Show latest money movements and ledger</div>
        </div>
        <label class="switch-toggle">
          <input type="checkbox" id="pref-transactions" ${prefs.transactions !== false ? 'checked' : ''}>
          <span class="slider-round"></span>
        </label>
      </div>

      <div style="margin-top:var(--sp-4);display:flex;justify-content:flex-end;gap:var(--sp-2);">
        <button type="button" class="btn btn-secondary modal-close">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Preferences</button>
      </div>
    </form>
  `);

  $('#dashboard-prefs-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPrefs = {
      accounts: $('#pref-accounts').checked,
      investments: $('#pref-investments').checked,
      personalAssets: $('#pref-personalAssets').checked,
      notes: $('#pref-notes').checked,
      transactions: $('#pref-transactions').checked,
    };
    await setDashboardPreferences(newPrefs);
    closeModal();
    showToast('Dashboard customized!', 'success');
    handleRoute();
  });
}

// ── Personal Notes Modal ──────────────────────────────────────────────

async function showNoteModal(note = null) {
  const isEdit = !!note;

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit Note' : '📌 Add Financial Note / Reminder'}</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="note-form" style="padding:var(--sp-2) 0;">
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:var(--sp-3);">
        Notes are informational only. They help track locker numbers, asset details, or reminders without changing your wealth balance.
      </p>

      <div class="form-group">
        <label for="note-title">Title</label>
        <input type="text" id="note-title" required placeholder="e.g., Locker 42 Gold Box or LIC Due Date" value="${note ? escapeHtml(note.title) : ''}">
      </div>

      <div class="form-group">
        <label for="note-content">Details / Instructions</label>
        <textarea id="note-content" rows="3" placeholder="Key numbers, details, instructions...">${note ? escapeHtml(note.content || '') : ''}</textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="note-date">Date</label>
          <input type="date" id="note-date" value="${note ? note.date : todayISO()}">
        </div>
        <div class="form-group">
          <label for="note-reminder">Reminder Date (Optional)</label>
          <input type="date" id="note-reminder" value="${note?.reminderDate || ''}">
        </div>
      </div>

      <div style="display:flex;gap:var(--sp-4);margin-top:var(--sp-2);">
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-sm);cursor:pointer;">
          <input type="checkbox" id="note-show-dashboard" ${!note || note.showOnDashboard ? 'checked' : ''}>
          <span>Show on Dashboard</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-sm);cursor:pointer;">
          <input type="checkbox" id="note-pin" ${note?.isPinned ? 'checked' : ''}>
          <span>Pin to Top</span>
        </label>
      </div>

      <div style="margin-top:var(--sp-4);display:flex;justify-content:flex-end;gap:var(--sp-2);">
        <button type="button" class="btn btn-secondary modal-close">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save Note'}</button>
      </div>
    </form>
  `);

  $('#note-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      title: $('#note-title').value.trim(),
      content: $('#note-content').value.trim(),
      date: $('#note-date').value,
      reminderDate: $('#note-reminder').value || null,
      showOnDashboard: $('#note-show-dashboard').checked ? 1 : 0,
      isPinned: $('#note-pin').checked ? 1 : 0,
    };

    if (isEdit) {
      await updateNote(note.id, data);
      showToast('Note updated!', 'success');
    } else {
      await createNote(data);
      showToast('Note saved!', 'success');
    }
    closeModal();
    handleRoute();
  });
}

// ── Router ────────────────────────────────────────────────────────────

const routes = {
  '/': renderHome,
  '/transactions': renderTransactions,
  '/accounts': renderAccounts,
  '/investments': renderInvestments,
  '/lending': renderLending,
  '/liabilities': renderLiabilities,
  '/insurance': renderInsurance,
  '/reports': renderReports,
  '/knowledge': renderKnowledge,
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
    syncAllWithSupabase().catch(() => {});
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  }
}

// ── Transaction Modal (Edit / New) ────────────────────────────────────

async function showTransactionModal(data = {}) {
  window.showTransactionModalGlobal = (d) => showTransactionModal(d);
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
      syncAllWithSupabase().catch(() => {});
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

  const [wealth, prefs, currentUser, notes, report, accounts, balances, recentTxns, categories] = await Promise.all([
    calculateUserWealth(),
    getDashboardPreferences(),
    getCurrentUser(),
    getDashboardNotes(),
    getMonthlyReport(year, month),
    getActiveAccounts(),
    getAllBalances(),
    getRecentTransactions(10),
    getCategories()
  ]);

  const catMap = {};
  categories.forEach(c => catMap[c.id] = c);

  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  const netCashFlow = report.netCashFlow;
  const cashFlowClass = netCashFlow >= 0 ? 'savings' : 'expense';

  // Magic 5 Crore Abundance Mode Toggle state
  const isMagicMode = sessionStorage.getItem('magic_manifestation_mode') === 'true';
  const displayNetWorth = isMagicMode ? 50000000 : wealth.netWorth;
  const displayLiquid = isMagicMode ? 6500000 : wealth.liquidMoney;
  const displayIncome = isMagicMode ? 850000 : report.totalIncome;
  const displayExpense = isMagicMode ? 180000 : report.totalExpense;

  // Sync user display in sidebar and mobile header
  updateUserDisplay(currentUser);

  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:var(--sp-3);">
      <div>
        <h1 style="display:flex;align-items:center;gap:var(--sp-2);">
          <span>👑 ${currentUser ? escapeHtml(currentUser.name) : 'Pratima'}'s Wealth Agent</span>
        </h1>
        <p style="color:var(--text-secondary);font-size:var(--fs-sm);">
          ${currentUser ? escapeHtml(currentUser.email || currentUser.phone || currentUser.name) : ''} · ${getMonthName(month)} ${year} · PraNick Wealth
        </p>
      </div>
      <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" id="home-customize-btn" title="Customize Dashboard Sections">
          ⚙️ Customize
        </button>
        <button class="btn btn-sm btn-primary" id="home-switch-user-btn" title="Switch User or Login">
          🔐 Switch / Login
        </button>
      </div>
    </div>

    <!-- Magic 5 Crore Abundance Mode Switch & Banner -->
    <div style="background:${isMagicMode ? 'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(124,108,240,0.28))' : 'rgba(255,255,255,0.02)'};border:1.5px solid ${isMagicMode ? '#fbbf24' : 'var(--border)'};border-radius:var(--radius-lg);padding:var(--sp-3-5, 14px);margin-bottom:var(--sp-4);box-shadow:${isMagicMode ? '0 0 25px rgba(251,191,36,0.25)' : 'none'};">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--sp-2);">
        <div style="display:flex;align-items:center;gap:var(--sp-2);min-width:0;flex:1 1 220px;">
          <span style="font-size:1.6rem;flex-shrink:0;">${isMagicMode ? '✨' : '🔮'}</span>
          <div style="min-width:0;">
            <div style="font-weight:800;color:${isMagicMode ? '#fbbf24' : 'var(--text-primary)'};font-size:var(--fs-sm);letter-spacing:0.3px;">
              ${isMagicMode ? '✨ 5 CRORE ABUNDANCE MANIFESTATION ACTIVE' : 'Magic 5 Crore Abundance Mode'}
            </div>
            <div style="font-size:11.5px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${isMagicMode ? 'Living the reality of a joyful, wealthy, debt-free family' : 'Switch dashboard to view your 5 Crore financial freedom report'}
            </div>
          </div>
        </div>
        <button class="btn btn-sm" id="toggle-magic-mode-btn" style="background:${isMagicMode ? 'rgba(251,191,36,0.2)' : 'linear-gradient(135deg, #fbbf24, #d97706)'};color:${isMagicMode ? '#fbbf24' : '#000'};border:1px solid #fbbf24;font-weight:700;flex-shrink:0;">
          ${isMagicMode ? '↩ Back to Actual View' : '✨ Switch to 5 Cr Dashboard'}
        </button>
      </div>
    </div>

    ${renderQuickEntry()}

    <!-- Centralized Wealth Engine Core Cards -->
    <div class="stats-grid">
      <div class="stat-card balance" style="--card-accent: #d4af37; background: linear-gradient(135deg, rgba(212,175,55,0.15), rgba(15,15,30,0.8));">
        <div class="stat-label">Total Real Net Worth</div>
        <div class="stat-value" style="color: #f7df79;">${formatCurrency(displayNetWorth)}</div>
        <div class="stat-sub">${isMagicMode ? '✨ Manifested 5 Crore Target Reached' : 'Liquid + Included Assets + Lending - Debt'}</div>
      </div>
      <div class="stat-card balance" style="--card-accent: var(--accent)">
        <div class="stat-label">Liquid Money (Cash + Bank)</div>
        <div class="stat-value">${formatCurrency(displayLiquid)}</div>
        <div class="stat-sub">${isMagicMode ? 'Private Wealth & Emergency Vault' : `Across ${accounts.length} liquid accounts`}</div>
      </div>
      <div class="stat-card income">
        <div class="stat-label">Income This Month</div>
        <div class="stat-value">${formatCurrency(displayIncome)}</div>
        <div class="stat-sub">${isMagicMode ? 'Passive dividends & business cashflow' : 'Recorded income'}</div>
      </div>
      <div class="stat-card expense">
        <div class="stat-label">Expenses This Month</div>
        <div class="stat-value">${formatCurrency(displayExpense)}</div>
        <div class="stat-sub">${isMagicMode ? 'Luxury lifestyle & travel expenses' : 'Recorded expenses'}</div>
      </div>
    </div>

    ${isMagicMode ? `
      <!-- Magic 5 Crore Abundance Life & Asset Breakdown -->
      <div style="background:linear-gradient(135deg, rgba(251,191,36,0.1), rgba(15,15,30,0.9));border:1.5px solid rgba(251,191,36,0.35);border-radius:var(--radius-lg);padding:var(--sp-4);margin-bottom:var(--sp-5);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-3);">
          <h3 style="color:#fbbf24;font-size:var(--fs-base);margin:0;display:flex;align-items:center;gap:6px;">
            <span>💎</span> 5 Crore Luxury Asset & Life Balance Portfolio
          </h3>
          <span style="font-size:11px;background:rgba(251,191,36,0.2);color:#fbbf24;padding:3px 8px;border-radius:12px;font-weight:700;">100% DEBT FREE</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:var(--sp-3);">
          <div class="stat-card" style="padding:var(--sp-3);background:var(--bg-surface);border:1px solid var(--border);">
            <div class="stat-label" style="font-size:11px;">🏡 Dream Luxury Villa Estate</div>
            <div class="stat-value" style="font-size:var(--fs-base);color:#fbbf24;">₹1,75,00,000</div>
            <div class="stat-sub" style="font-size:10px;">Private sanctuary & landscaped gardens</div>
          </div>
          <div class="stat-card" style="padding:var(--sp-3);background:var(--bg-surface);border:1px solid var(--border);">
            <div class="stat-label" style="font-size:11px;">📈 High-Growth Equity Portfolio</div>
            <div class="stat-value" style="font-size:var(--fs-base);color:var(--green);">₹1,50,00,000</div>
            <div class="stat-sub" style="font-size:10px;">Compounding mutual funds & equities</div>
          </div>
          <div class="stat-card" style="padding:var(--sp-3);background:var(--bg-surface);border:1px solid var(--border);">
            <div class="stat-label" style="font-size:11px;">🚗 Luxury Vehicles (Porsche + Merc)</div>
            <div class="stat-value" style="font-size:var(--fs-base);color:var(--accent);">₹65,00,000</div>
            <div class="stat-sub" style="font-size:10px;">100% Paid off luxury dream cars</div>
          </div>
          <div class="stat-card" style="padding:var(--sp-3);background:var(--bg-surface);border:1px solid var(--border);">
            <div class="stat-label" style="font-size:11px;">👑 24K Physical Gold & Sovereign</div>
            <div class="stat-value" style="font-size:var(--fs-base);color:#f59e0b;">₹45,00,000</div>
            <div class="stat-sub" style="font-size:10px;">Pure asset security in private vault</div>
          </div>
          <div class="stat-card" style="padding:var(--sp-3);background:var(--bg-surface);border:1px solid var(--border);">
            <div class="stat-label" style="font-size:11px;">🏦 Liquid Reserves & Wealth Bank</div>
            <div class="stat-value" style="font-size:var(--fs-base);color:var(--accent);">₹65,00,000</div>
            <div class="stat-sub" style="font-size:10px;">Complete liquid peace of mind</div>
          </div>
          <div class="stat-card" style="padding:var(--sp-3);background:var(--bg-surface);border:1px solid var(--border);">
            <div class="stat-label" style="font-size:11px;">🕊️ Debt & Liabilities</div>
            <div class="stat-value" style="font-size:var(--fs-base);color:var(--green);">₹0.00</div>
            <div class="stat-sub" style="font-size:10px;">Zero loans · Zero interest paid</div>
          </div>
        </div>

        <div style="margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:1px solid rgba(251,191,36,0.2);display:flex;justify-content:space-between;flex-wrap:wrap;gap:var(--sp-2);font-size:12px;">
          <span>🧘 <strong>Runway:</strong> 27+ Years of luxury family living</span>
          <span>🏖️ <strong>Family Happiness & Peace Score:</strong> 100/100</span>
          <span>⚡ <strong>Monthly Surplus:</strong> +₹6,70,000/mo</span>
        </div>
      </div>
    ` : `
      <!-- Additional Net Worth Details -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:var(--sp-3);margin-bottom:var(--sp-5);">
        <div class="stat-card" style="padding:var(--sp-3);border:1px solid var(--border);">
          <div class="stat-label" style="font-size:11px;">Included Investments</div>
          <div class="stat-value" style="font-size:var(--fs-lg);color:var(--accent);">${formatCurrency(wealth.includedAssets || 0)}</div>
          <div class="stat-sub" style="font-size:10px;">${(wealth.includedAssetsList || []).length} wealth-generating assets</div>
        </div>
        <div class="stat-card" style="padding:var(--sp-3);border:1px solid var(--border);">
          <div class="stat-label" style="font-size:11px;">Tracked Personal Assets</div>
          <div class="stat-value" style="font-size:var(--fs-lg);color:#94a3b8;">${formatCurrency(wealth.personalAssets || 0)}</div>
          <div class="stat-sub" style="font-size:10px;">Excluded from Net Worth</div>
        </div>
        <div class="stat-card" style="padding:var(--sp-3);border:1px solid var(--border);">
          <div class="stat-label" style="font-size:11px;">Lent Receivables</div>
          <div class="stat-value" style="font-size:var(--fs-lg);color:var(--green);">+${formatCurrency(wealth.lendingReceivables || 0)}</div>
          <div class="stat-sub" style="font-size:10px;">Money owed to you</div>
        </div>
        <div class="stat-card" style="padding:var(--sp-3);border:1px solid var(--border);">
          <div class="stat-label" style="font-size:11px;">Liabilities & Borrowings</div>
          <div class="stat-value" style="font-size:var(--fs-lg);color:var(--red);">-${formatCurrency(wealth.liabilities || 0)}</div>
          <div class="stat-sub" style="font-size:10px;">Debt & money to return</div>
        </div>
      </div>
    `}

    <!-- Notes & Reminders Widget (if enabled) -->
    ${prefs.notes !== false ? `
      <div class="notes-widget-card">
        <div class="notes-widget-header">
          <h3 style="font-size:var(--fs-base);margin:0;display:flex;align-items:center;gap:6px;">
            <span>📌</span> Notes & Reminders
          </h3>
          <button class="btn btn-sm btn-primary" id="home-add-note-btn">+ Add Note</button>
        </div>
        <div id="home-notes-list">
          ${(notes || []).length === 0 ? `
            <div style="font-size:var(--fs-xs);color:var(--text-muted);text-align:center;padding:var(--sp-2);">
              No active reminders. Keep financial notes or locker details here (informational only).
            </div>
          ` : notes.map(n => `
            <div class="note-item-pill">
              <div>
                <div class="note-item-text"><strong>${escapeHtml(n.title)}</strong> ${n.content ? '— ' + escapeHtml(n.content) : ''}</div>
                <div class="note-item-meta">${n.date ? '📅 ' + formatDate(n.date) : ''} ${n.reminderDate ? '⏰ Reminder: ' + formatDate(n.reminderDate) : ''}</div>
              </div>
              <button class="btn-icon delete-note-btn" data-id="${n.id}" style="background:none;border:none;cursor:pointer;" title="Delete note">🗑️</button>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Accounts Section (if enabled) -->
    ${prefs.accounts !== false ? `
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
    ` : ''}

    <!-- Investments Section (if enabled) -->
    ${prefs.investments !== false && (wealth.includedAssetsList || []).length > 0 ? `
      <div class="section">
        <div class="section-header">
          <h2>Investments & Wealth Assets</h2>
          <a href="#/investments" class="btn-link">View All →</a>
        </div>
        <div class="accounts-grid">
          ${(wealth.includedAssetsList || []).slice(0, 4).map(a => `
            <div class="asset-card" onclick="window.location.hash='#/investments'">
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
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Tracked Personal Assets Section (if enabled and present) -->
    ${prefs.personalAssets !== false && (wealth.personalAssetsList || []).length > 0 ? `
      <div class="section">
        <div class="section-header">
          <h2>Tracked Personal Assets</h2>
          <span class="tracked-badge" title="Excluded from Net Worth">Personal / Keepsake</span>
        </div>
        <div class="accounts-grid">
          ${(wealth.personalAssetsList || []).map(a => `
            <div class="asset-card" style="border: 1px dashed rgba(148, 163, 184, 0.4);" onclick="window.location.hash='#/investments'">
              <div class="asset-header">
                <div>
                  <div class="asset-name">${ASSET_TYPE_ICONS[a.type] || '📦'} ${escapeHtml(a.name)}</div>
                  <div class="asset-type">${ASSET_TYPE_LABELS[a.type] || a.type} · Tracked</div>
                </div>
              </div>
              <div class="asset-value" style="color:#94a3b8;">${formatCurrency(a.currentValue)}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Shown for tracking only; excluded from wealth.</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Recent Transactions Section (if enabled) -->
    ${prefs.transactions !== false ? `
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
    ` : ''}
  `;

  await initQuickEntry();

  // Handlers
  $('#toggle-magic-mode-btn')?.addEventListener('click', () => {
    const current = sessionStorage.getItem('magic_manifestation_mode') === 'true';
    sessionStorage.setItem('magic_manifestation_mode', String(!current));
    showToast(!current ? '✨ 5 Crore Magic Abundance Mode Activated!' : 'Returned to Actual Personal Records', 'info');
    handleRoute();
  });
  $('#home-customize-btn')?.addEventListener('click', () => showDashboardCustomizationModal());
  $('#home-switch-user-btn')?.addEventListener('click', () => showUserSwitchModal());
  $('#home-add-note-btn')?.addEventListener('click', () => showNoteModal());

  // Note delete buttons
  $$('.delete-note-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.getAttribute('data-id'));
      if (confirm('Delete this note?')) {
        await deleteNote(id);
        showToast('Note deleted', 'info');
        renderHome(container);
      }
    });
  });

  // Add first account handler
  $('#add-first-account')?.addEventListener('click', () => showAccountModal());

  // Load sample data handler from home empty state
  $('#home-load-sample')?.addEventListener('click', async () => {
    await seedSampleData();
    showToast('Sample demo data loaded!', 'success');
    handleRoute();
  });
  $('#home-load-sample')?.addEventListener('click', async () => {
    await seedSampleData();
    showToast('Sample demo data loaded!', 'success');
    handleRoute();
  });

  // Transaction item click handlers
  setupTransactionItemHandlers();
}

// ── Transaction List Renderer (Daily Money Movement) ──────────────────

function renderTransactionList(txns, catMap, accMap) {
  let html = '';
  
  // Group transactions by date
  const groups = {};
  for (const t of txns) {
    const dateStr = t.date?.split('T')[0] || 'Unknown';
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(t);
  }

  for (const [dateStr, dayTxns] of Object.entries(groups)) {
    let dayIncome = 0;
    let dayExpense = 0;

    for (const t of dayTxns) {
      if (t.type === 'income') dayIncome += t.amount;
      else if (t.type === 'expense') dayExpense += t.amount;
    }
    const dayNet = dayIncome - dayExpense;

    html += `
      <div class="date-group-header-wrap">
        <div class="date-group-title">📅 ${formatDate(dateStr)}</div>
        <div class="date-group-summary">
          ${dayIncome > 0 ? `<span class="sum-inc">+${formatCurrency(dayIncome)}</span>` : ''}
          ${dayExpense > 0 ? `<span class="sum-exp">-${formatCurrency(dayExpense)}</span>` : ''}
          <span class="sum-net">Net: ${dayNet >= 0 ? '+' : ''}${formatCurrency(dayNet)}</span>
        </div>
      </div>
    `;

    for (const t of dayTxns) {
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

// ── TRANSACTIONS & SUBSCRIPTIONS VIEW ─────────────────────────────────

async function renderTransactions(container) {
  const accounts = await getActiveAccounts();
  const categories = await getCategories();
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c);
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  let currentTab = 'ledger'; // 'ledger' or 'subscriptions'
  let activePreset = 'month'; // 'today', 'yesterday', '7days', '30days', 'month', 'prev_month', 'year', 'custom'

  container.innerHTML = `
    <div class="page-header">
      <h1>Money Movement & Bills</h1>
      <p>Transactions, daily money movement & recurring subscriptions</p>
    </div>

    <!-- Top View Tabs -->
    <div class="view-tabs">
      <button class="view-tab active" id="tab-btn-ledger">📋 Daily Money Movement</button>
      <button class="view-tab" id="tab-btn-subs">🔄 Subscriptions & Recurring Bills</button>
    </div>

    <!-- Main Tab Panes -->
    <div id="pane-ledger">
      <!-- Search & Filters -->
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-4);margin-bottom:var(--sp-4);">
        <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;margin-bottom:var(--sp-3);">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" id="txn-search-input" class="form-control" placeholder="Search by description, category, amount, notes, account...">
          </div>
          <button class="btn btn-primary" id="add-txn-btn">+ New Transaction</button>
        </div>

        <!-- Quick Date Presets -->
        <div class="filter-presets">
          <button class="filter-preset-btn" data-preset="today">Today</button>
          <button class="filter-preset-btn" data-preset="yesterday">Yesterday</button>
          <button class="filter-preset-btn" data-preset="7days">Last 7 Days</button>
          <button class="filter-preset-btn" data-preset="30days">Last 30 Days</button>
          <button class="filter-preset-btn active" data-preset="month">This Month</button>
          <button class="filter-preset-btn" data-preset="prev_month">Previous Month</button>
          <button class="filter-preset-btn" data-preset="year">This Year</button>
          <button class="filter-preset-btn" data-preset="custom">Custom Range</button>
        </div>

        <!-- Secondary Filter Controls (Single Row on Mobile & Desktop) -->
        <div class="txn-filters-single-row">
          <select id="txn-filter-type" class="txn-row-select" title="Filter by Type">
            <option value="">All Types</option>
            <option value="income">Income (+)</option>
            <option value="expense">Expense (-)</option>
            <option value="transfer">Transfer (⇄)</option>
          </select>

          <select id="txn-filter-account" class="txn-row-select" title="Filter by Account">
            <option value="">All Accounts</option>
            ${accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}
          </select>

          <select id="txn-sort" class="txn-row-select" title="Sort Order">
            <option value="date-desc">Latest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="amount-desc">Highest amount</option>
            <option value="amount-asc">Lowest amount</option>
            <option value="type-income">Income first</option>
            <option value="type-expense">Expense first</option>
            <option value="type-transfer">Transfers first</option>
          </select>

          <button class="btn btn-ghost btn-sm txn-row-reset-btn" id="btn-reset-filters" title="Reset Filters">↺ Reset</button>
        </div>

        <div id="custom-date-wrap" style="display:none;gap:var(--sp-2);align-items:center;margin-top:var(--sp-2);">
          <input type="date" id="txn-date-from" class="form-control" style="font-size:12px;padding:4px 8px;">
          <span style="color:var(--text-secondary);font-size:12px;">to</span>
          <input type="date" id="txn-date-to" class="form-control" style="font-size:12px;padding:4px 8px;">
        </div>
      </div>

      <!-- Filter Results Summary Banner -->
      <div id="txn-filter-summary" style="margin-bottom:var(--sp-3);font-size:var(--fs-xs);color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center;"></div>

      <div class="txn-list" id="txn-list-container"></div>
    </div>

    <div id="pane-subs" style="display:none;">
      <div id="subscriptions-container"></div>
    </div>
  `;

  // Tab switching
  const tabLedger = $('#tab-btn-ledger');
  const tabSubs = $('#tab-btn-subs');
  const paneLedger = $('#pane-ledger');
  const paneSubs = $('#pane-subs');

  tabLedger.addEventListener('click', () => {
    currentTab = 'ledger';
    tabLedger.classList.add('active');
    tabSubs.classList.remove('active');
    paneLedger.style.display = 'block';
    paneSubs.style.display = 'none';
  });

  tabSubs.addEventListener('click', () => {
    currentTab = 'subscriptions';
    tabSubs.classList.add('active');
    tabLedger.classList.remove('active');
    paneLedger.style.display = 'none';
    paneSubs.style.display = 'block';
    loadSubscriptions();
  });

  // Calculate Date Ranges
  function getDateRangeForPreset(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    const formatDateVal = dt => dt.toISOString().split('T')[0];

    switch (preset) {
      case 'today': {
        const todayStr = formatDateVal(now);
        return { start: todayStr, end: todayStr + 'T23:59:59' };
      }
      case 'yesterday': {
        const yest = new Date(now);
        yest.setDate(d - 1);
        const yestStr = formatDateVal(yest);
        return { start: yestStr, end: yestStr + 'T23:59:59' };
      }
      case '7days': {
        const past = new Date(now);
        past.setDate(d - 6);
        return { start: formatDateVal(past), end: formatDateVal(now) + 'T23:59:59' };
      }
      case '30days': {
        const past = new Date(now);
        past.setDate(d - 29);
        return { start: formatDateVal(past), end: formatDateVal(now) + 'T23:59:59' };
      }
      case 'month': {
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);
        return { start: formatDateVal(start), end: formatDateVal(end) + 'T23:59:59' };
      }
      case 'prev_month': {
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);
        return { start: formatDateVal(start), end: formatDateVal(end) + 'T23:59:59' };
      }
      case 'year': {
        const start = new Date(y, 0, 1);
        const end = new Date(y, 11, 31);
        return { start: formatDateVal(start), end: formatDateVal(end) + 'T23:59:59' };
      }
      case 'custom': {
        const from = $('#txn-date-from')?.value;
        const to = $('#txn-date-to')?.value;
        return { start: from || undefined, end: to ? to + 'T23:59:59' : undefined };
      }
      default:
        return {};
    }
  }

  // Load Transactions with Filters
  async function loadTxns() {
    const type = $('#txn-filter-type').value;
    const accountId = parseInt($('#txn-filter-account').value) || null;
    const sortBy = $('#txn-sort').value;
    const search = $('#txn-search-input').value.trim().toLowerCase();

    const { start, end } = getDateRangeForPreset(activePreset);

    let allTxns = await getTransactions({
      type: type || undefined,
      accountId: accountId || undefined,
      startDate: start,
      endDate: end
    });

    // Apply Free Text Search
    if (search) {
      allTxns = allTxns.filter(t => {
        const desc = (t.description || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        const tags = (t.tags || '').toLowerCase();
        const cat = (catMap[t.categoryId]?.name || '').toLowerCase();
        const acc = (accMap[t.accountId]?.name || '').toLowerCase();
        const toAcc = (accMap[t.toAccountId]?.name || '').toLowerCase();
        const amtStr = String(t.amount);
        return desc.includes(search) || notes.includes(search) || tags.includes(search) ||
               cat.includes(search) || acc.includes(search) || toAcc.includes(search) || amtStr.includes(search);
      });
    }

    // Apply Sorting
    allTxns.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return a.date.localeCompare(b.date);
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        case 'type-income':
          return (b.type === 'income' ? 1 : 0) - (a.type === 'income' ? 1 : 0) || b.date.localeCompare(a.date);
        case 'type-expense':
          return (b.type === 'expense' ? 1 : 0) - (a.type === 'expense' ? 1 : 0) || b.date.localeCompare(a.date);
        case 'type-transfer':
          return (b.type === 'transfer' ? 1 : 0) - (a.type === 'transfer' ? 1 : 0) || b.date.localeCompare(a.date);
        case 'date-desc':
        default:
          return b.date.localeCompare(a.date);
      }
    });

    const listEl = $('#txn-list-container');
    const summaryEl = $('#txn-filter-summary');

    // Summary calculation
    let totalIn = 0, totalOut = 0;
    allTxns.forEach(t => {
      if (t.type === 'income') totalIn += t.amount;
      else if (t.type === 'expense') totalOut += t.amount;
    });

    if (summaryEl) {
      summaryEl.innerHTML = `
        <span>Showing <strong>${allTxns.length}</strong> transactions</span>
        <span>Income: <strong style="color:var(--green)">+${formatCurrency(totalIn)}</strong> &nbsp;|&nbsp; Expense: <strong style="color:var(--red)">-${formatCurrency(totalOut)}</strong> &nbsp;|&nbsp; Net: <strong>${formatCurrency(totalIn - totalOut)}</strong></span>
      `;
    }

    if (allTxns.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="emoji">📭</div>
          <h3>No transactions match your filters</h3>
          <p>Try clearing filters or search query, or record a new transaction.</p>
        </div>
      `;
    } else {
      listEl.innerHTML = renderTransactionList(allTxns, catMap, accMap);
      setupTransactionItemHandlers();
    }
  }

  // Filter Presets Click Handlers
  $$('.filter-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePreset = btn.dataset.preset;

      const customWrap = $('#custom-date-wrap');
      if (activePreset === 'custom') {
        customWrap.style.display = 'flex';
        if (!$('#txn-date-from').value) {
          const now = new Date();
          $('#txn-date-from').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
          $('#txn-date-to').value = now.toISOString().split('T')[0];
        }
      } else {
        customWrap.style.display = 'none';
      }
      loadTxns();
    });
  });

  // Filter change listeners
  $('#txn-filter-type').addEventListener('change', loadTxns);
  $('#txn-filter-account').addEventListener('change', loadTxns);
  $('#txn-sort').addEventListener('change', loadTxns);
  $('#txn-date-from')?.addEventListener('change', loadTxns);
  $('#txn-date-to')?.addEventListener('change', loadTxns);

  // Search input debounced
  let searchTimer;
  $('#txn-search-input').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadTxns, 250);
  });

  // Reset Filters
  $('#btn-reset-filters').addEventListener('click', () => {
    $('#txn-search-input').value = '';
    $('#txn-filter-type').value = '';
    $('#txn-filter-account').value = '';
    $('#txn-sort').value = 'date-desc';
    $$('.filter-preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === 'month'));
    activePreset = 'month';
    $('#custom-date-wrap').style.display = 'none';
    loadTxns();
  });

  $('#add-txn-btn').addEventListener('click', () => showTransactionModal());

  // Subscriptions Section Loader
  async function loadSubscriptions() {
    const subContainer = $('#subscriptions-container');
    if (!subContainer) return;

    const subs = await getSubscriptions();
    const accounts = await getActiveAccounts();
    const accMap = {};
    accounts.forEach(a => accMap[a.id] = a);

    // Compute metrics
    const activeSubs = subs.filter(s => s.status === 'active');
    const totalMonthlyCost = activeSubs.reduce((acc, s) => {
      let multiplier = 1;
      if (s.billingCycle === 'yearly') multiplier = 1 / 12;
      else if (s.billingCycle === 'quarterly') multiplier = 1 / 3;
      else if (s.billingCycle === 'weekly') multiplier = 4.33;
      return acc + (s.amount * multiplier);
    }, 0);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(now.getDate() + 3);
    const threeDaysStr = threeDaysLater.toISOString().split('T')[0];

    const dueSoonCount = activeSubs.filter(s => s.nextDueDate && s.nextDueDate <= threeDaysStr && s.nextDueDate >= todayStr).length;
    const overdueCount = activeSubs.filter(s => s.nextDueDate && s.nextDueDate < todayStr).length;

    subContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-4);">
        <div>
          <h2 style="font-size:var(--fs-lg);font-weight:700;">Subscriptions & Recurring Bills</h2>
          <p style="font-size:var(--fs-xs);color:var(--text-secondary);">Never miss a renewal or lose money on forgotten subscriptions</p>
        </div>
        <button class="btn btn-primary" id="btn-add-subscription">+ Add Subscription</button>
      </div>

      <!-- Stats Bar -->
      <div class="stats-grid" style="margin-bottom:var(--sp-4);">
        <div class="stat-card">
          <div class="stat-label">Monthly Commitments</div>
          <div class="stat-value">${formatCurrency(totalMonthlyCost)}</div>
          <div class="stat-sub">Across ${activeSubs.length} active services</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Subscriptions</div>
          <div class="stat-value">${activeSubs.length}</div>
          <div class="stat-sub">${subs.length - activeSubs.length} paused</div>
        </div>
        <div class="stat-card ${overdueCount > 0 ? 'expense' : dueSoonCount > 0 ? 'savings' : ''}">
          <div class="stat-label">Upcoming / Overdue</div>
          <div class="stat-value" style="color:${overdueCount > 0 ? 'var(--red)' : dueSoonCount > 0 ? 'var(--yellow)' : 'var(--green)'}">
            ${overdueCount > 0 ? `${overdueCount} Overdue!` : `${dueSoonCount} Due Soon`}
          </div>
          <div class="stat-sub">Next 3 days</div>
        </div>
      </div>

      <!-- Subscription Cards Grid -->
      <div class="financial-cards-grid">
        ${subs.map(sub => {
          const isOverdue = sub.nextDueDate && sub.nextDueDate < todayStr;
          const isDueSoon = sub.nextDueDate && sub.nextDueDate <= threeDaysStr && !isOverdue;
          const statusClass = sub.status !== 'active' ? 'settled' : isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : 'active';
          const statusLabel = sub.status !== 'active' ? 'Paused' : isOverdue ? 'Overdue' : isDueSoon ? 'Due Soon' : 'Active';

          return `
            <div class="financial-card">
              <div class="f-card-header">
                <div>
                  <div class="f-card-title">${escapeHtml(sub.name)}</div>
                  <div class="f-card-subtitle">${escapeHtml(sub.serviceCategory || 'Subscription')} · ${escapeHtml(sub.billingCycle)}</div>
                </div>
                <span class="badge-status ${statusClass}">${statusLabel}</span>
              </div>

              <div class="f-card-amount-block">
                <div>
                  <div class="f-card-amount-label">Plan Cost</div>
                  <div class="f-card-amount-val">${formatCurrency(sub.amount)}</div>
                </div>
                <div style="text-align:right;">
                  <div class="f-card-amount-label">Next Due Date</div>
                  <div style="font-size:var(--fs-sm);font-weight:600;color:${isOverdue ? 'var(--red)' : isDueSoon ? 'var(--yellow)' : 'var(--text-primary)'}">
                    ${formatDate(sub.nextDueDate) || 'Not set'}
                  </div>
                </div>
              </div>

              <div class="f-card-meta">
                <div class="f-card-meta-row">
                  <span>Payment Account:</span>
                  <span style="font-weight:600;color:var(--text-primary);">${escapeHtml(accMap[sub.paymentAccountId]?.name || 'Not linked')}</span>
                </div>
                <div class="f-card-meta-row">
                  <span>Auto-Renewal:</span>
                  <span>${sub.autoRenewal ? '⚡ Auto-debit active' : 'Manual confirmation'}</span>
                </div>
                ${sub.notes ? `<div class="f-card-meta-row" style="color:var(--text-secondary);font-style:italic;"><span>Notes:</span><span>${escapeHtml(sub.notes)}</span></div>` : ''}
              </div>

              <div class="f-card-actions">
                <button class="btn btn-sm btn-primary mark-sub-paid-btn" data-sub-id="${sub.id}" style="flex:1;">
                  ✓ Mark Paid
                </button>
                <button class="btn btn-sm btn-secondary edit-sub-btn" data-sub-id="${sub.id}">✏️ Edit</button>
                <button class="btn btn-sm btn-ghost delete-sub-btn" data-sub-id="${sub.id}">🗑️</button>
              </div>
            </div>
          `;
        }).join('')}
        ${subs.length === 0 ? `
          <div class="empty-state" style="grid-column:1/-1;">
            <div class="emoji">🔄</div>
            <h3>No subscriptions added yet</h3>
            <p>Track your Netflix, Spotify, gym membership, WiFi, and software subscriptions in one place.</p>
          </div>
        ` : ''}
      </div>
    `;

    // Add Subscription Handler
    $('#btn-add-subscription')?.addEventListener('click', () => showSubscriptionModal());

    // Mark Paid Handler
    $$('.mark-sub-paid-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.subId);
        try {
          const nextDate = await markSubscriptionPaid(id);
          showToast(`Subscription payment recorded! Next renewal: ${formatDate(nextDate)}`, 'success');
          loadSubscriptions();
        } catch (err) {
          showToast('Failed to record payment: ' + err.message, 'error');
        }
      });
    });

    // Edit Subscription Handler
    $$('.edit-sub-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.subId);
        const sub = await db.subscriptions.get(id);
        if (sub) showSubscriptionModal(sub);
      });
    });

    // Delete Subscription Handler
    $$('.delete-sub-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.subId);
        if (confirm('Delete this subscription?')) {
          await deleteSubscription(id);
          showToast('Subscription removed.', 'info');
          loadSubscriptions();
        }
      });
    });
  }

  // Initial Load
  await loadTxns();
}

// ── Subscription Modal ────────────────────────────────────────────────
async function showSubscriptionModal(data = {}) {
  const accounts = await getActiveAccounts();
  const isEdit = !!data.id;

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit' : 'New'} Subscription</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="subscription-form">
      <div class="form-group">
        <label>Service / Subscription Name *</label>
        <input type="text" id="sub-name" class="form-control" value="${escapeHtml(data.name || '')}" required placeholder="e.g. Netflix, Spotify, Gym, JioFiber">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Amount (₹) *</label>
          <input type="number" id="sub-amount" class="form-control" step="any" min="0" value="${data.amount || ''}" required placeholder="e.g. 649">
        </div>
        <div class="form-group">
          <label>Billing Cycle</label>
          <select id="sub-cycle" class="form-control">
            <option value="monthly" ${data.billingCycle === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="quarterly" ${data.billingCycle === 'quarterly' ? 'selected' : ''}>Quarterly (3 Months)</option>
            <option value="yearly" ${data.billingCycle === 'yearly' ? 'selected' : ''}>Yearly (Annual)</option>
            <option value="weekly" ${data.billingCycle === 'weekly' ? 'selected' : ''}>Weekly</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Payment Account</label>
          <select id="sub-account" class="form-control">
            <option value="">Select Account</option>
            ${accounts.map(a => `<option value="${a.id}" ${data.paymentAccountId === a.id ? 'selected' : ''}>${a.icon || ''} ${escapeHtml(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Next Due Date *</label>
          <input type="date" id="sub-date" class="form-control" value="${data.nextDueDate || todayISO()}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Category</label>
          <input type="text" id="sub-category" class="form-control" value="${escapeHtml(data.serviceCategory || 'Entertainment')}" placeholder="e.g. Streaming, Utility, Fitness">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="sub-status" class="form-control">
            <option value="active" ${data.status !== 'paused' ? 'selected' : ''}>Active</option>
            <option value="paused" ${data.status === 'paused' ? 'selected' : ''}>Paused</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="sub-auto-renew" ${data.autoRenewal !== 0 ? 'checked' : ''}>
          Auto-renewal active on card / bank
        </label>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="sub-notes" class="form-control" rows="2" placeholder="Plan details, credentials, or reminders">${escapeHtml(data.notes || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'} Subscription</button>
      </div>
    </form>
  `);

  $('#subscription-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: $('#sub-name').value.trim(),
      amount: parseFloat($('#sub-amount').value) || 0,
      billingCycle: $('#sub-cycle').value,
      paymentAccountId: parseInt($('#sub-account').value) || null,
      nextDueDate: $('#sub-date').value,
      serviceCategory: $('#sub-category').value.trim(),
      status: $('#sub-status').value,
      autoRenewal: $('#sub-auto-renew').checked ? 1 : 0,
      notes: $('#sub-notes').value.trim()
    };

    try {
      if (isEdit) {
        await updateSubscription(data.id, payload);
        showToast('Subscription updated!', 'success');
      } else {
        await createSubscription(payload);
        showToast('Subscription added!', 'success');
      }
      closeModal();
      handleRoute();
      syncAllWithSupabase().catch(() => {});
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ── ACCOUNTS VIEW ─────────────────────────────────────────────────────

async function renderAccounts(container) {
  const accounts = await getAllAccounts();
  const balances = await getAllBalances();

  container.innerHTML = `
    <div class="page-header">
      <h1>Accounts & Liquid Funds</h1>
      <p>Bank accounts, cash in hand, and digital wallets</p>
    </div>

    <!-- Sub-navigation Pills -->
    <div class="subnav-pills">
      <a href="#/accounts" class="subnav-pill active">💵 Liquid Accounts</a>
      <a href="#/investments" class="subnav-pill">📈 Investments</a>
      <a href="#/lending" class="subnav-pill">🤝 Lend & Borrow</a>
      <a href="#/liabilities" class="subnav-pill">🏛️ Liabilities & Loans</a>
      <a href="#/insurance" class="subnav-pill">🛡️ Insurance</a>
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
            <div style="margin-top:auto;padding-top:var(--sp-2);display:flex;gap:var(--sp-1-5, 6px);width:100%;">
              <button class="btn btn-sm btn-secondary edit-acc-btn" data-acc-id="${acc.id}" style="flex:1;min-width:0;padding:4px 6px;font-size:11px;justify-content:center;">Edit</button>
              ${acc.isActive ? `<button class="btn btn-sm btn-ghost archive-acc-btn" data-acc-id="${acc.id}" style="flex:1;min-width:0;padding:4px 6px;font-size:11px;justify-content:center;">Archive</button>` : ''}
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
      syncAllWithSupabase().catch(() => {});
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
      <p>Track your portfolio, capital growth and complete balance sheet</p>
    </div>

    <!-- Sub-navigation Pills -->
    <div class="subnav-pills">
      <a href="#/accounts" class="subnav-pill">💵 Liquid Accounts</a>
      <a href="#/investments" class="subnav-pill active">📈 Investments</a>
      <a href="#/lending" class="subnav-pill">🤝 Lend & Borrow</a>
      <a href="#/liabilities" class="subnav-pill">🏛️ Liabilities & Loans</a>
      <a href="#/insurance" class="subnav-pill">🛡️ Insurance</a>
    </div>

    <div class="networth-hero">
      <div class="networth-label">Total Real Net Worth</div>
      <div class="networth-value">${formatCurrency(netWorthData.netWorth)}</div>
      <div style="margin-top:var(--sp-3);display:flex;justify-content:center;flex-wrap:wrap;gap:var(--sp-4);">
        <div><span style="color:var(--text-secondary);font-size:var(--fs-xs)">Liquid</span><br><strong>${formatCurrency(netWorthData.totalLiquid)}</strong></div>
        <div><span style="color:var(--text-secondary);font-size:var(--fs-xs)">Investments</span><br><strong>${formatCurrency(netWorthData.totalInvestments)}</strong></div>
        <div><span style="color:var(--text-secondary);font-size:var(--fs-xs)">Lent (Receivable)</span><br><strong style="color:var(--green)">+${formatCurrency(netWorthData.totalLentReceivable || 0)}</strong></div>
        <div><span style="color:var(--text-secondary);font-size:var(--fs-xs)">Borrowed (Payable)</span><br><strong style="color:var(--red)">-${formatCurrency(netWorthData.totalBorrowedPayable || 0)}</strong></div>
        <div><span style="color:var(--text-secondary);font-size:var(--fs-xs)">Loans / Debt</span><br><strong style="color:var(--red)">-${formatCurrency(netWorthData.totalLiabilities || 0)}</strong></div>
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
            <div class="asset-header" style="margin-bottom:var(--sp-2);">
              <div style="min-width:0;flex:1;">
                <div class="asset-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ASSET_TYPE_ICONS[a.type] || '📦'} ${escapeHtml(a.name)}</div>
                <div class="asset-type" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ASSET_TYPE_LABELS[a.type] || a.type}${a.institution ? ' · ' + escapeHtml(a.institution) : ''}</div>
              </div>
            </div>
            <div class="asset-value">${formatCurrency(a.currentValue)}</div>
            ${a.investedAmount > 0 ? `
              <div class="asset-invested" style="font-size:11px;">Invested: ${formatCurrency(a.investedAmount)}</div>
              <div class="asset-gain ${a.currentValue >= a.investedAmount ? 'positive' : 'negative'}" style="font-size:11px;">
                ${a.currentValue >= a.investedAmount ? '▲' : '▼'} ${formatCurrency(Math.abs(a.currentValue - a.investedAmount))}
                (${((a.currentValue - a.investedAmount) / a.investedAmount * 100).toFixed(1)}%)
              </div>
            ` : ''}
            <div class="asset-valuation-date" style="font-size:10px;">Last valued: ${formatDate(a.lastValuationDate)}</div>
            <div style="margin-top:auto;padding-top:var(--sp-2);display:flex;gap:var(--sp-1-5, 6px);width:100%;">
              <button class="btn btn-sm btn-primary update-val-btn" data-asset-id="${a.id}" style="flex:1;min-width:0;padding:4px 6px;font-size:10.5px;justify-content:center;white-space:nowrap;">Update</button>
              <button class="btn btn-sm btn-secondary edit-asset-btn" data-asset-id="${a.id}" style="flex:1;min-width:0;padding:4px 6px;font-size:10.5px;justify-content:center;">Edit</button>
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
  const isMetal = data.type === 'gold' || data.type === 'silver';

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit Asset' : '✨ New Asset / Investment'}</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="asset-form" style="max-height:75vh;overflow-y:auto;padding-right:4px;">
      <div class="form-group">
        <label>Asset Name</label>
        <input type="text" id="asset-name" class="form-control" value="${escapeHtml(data.name || '')}" placeholder="e.g., SBI FD, Nippon Nifty 50, 22K Gold Chain" required>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Asset Type</label>
          <select id="asset-type" class="form-control">
            ${Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${data.type === k ? 'selected' : ''}>${ASSET_TYPE_ICONS[k]} ${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Institution / Provider / Jeweller</label>
          <input type="text" id="asset-institution" class="form-control" value="${escapeHtml(data.institution || '')}" placeholder="e.g., SBI, Zerodha, Tanishq">
        </div>
      </div>

      <!-- Dedicated Gold / Silver Inputs (shown when Gold/Silver is selected) -->
      <div id="metal-fields-container" style="${isMetal ? '' : 'display:none;'}background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:var(--radius-md);padding:var(--sp-3);margin-bottom:var(--sp-3);">
        <div style="font-weight:700;color:var(--accent);font-size:var(--fs-sm);margin-bottom:var(--sp-2);">
          🥇 Precious Metal Valuation Details
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Purity</label>
            <select id="metal-purity" class="form-control">
              <option value="24K" ${data.purity === '24K' ? 'selected' : ''}>24K (99.9% Pure)</option>
              <option value="22K" ${!data.purity || data.purity === '22K' ? 'selected' : ''}>22K (91.67% Standard Jewellery)</option>
              <option value="20K" ${data.purity === '20K' ? 'selected' : ''}>20K (83.33%)</option>
              <option value="18K" ${data.purity === '18K' ? 'selected' : ''}>18K (75.0% Diamond Jewellery)</option>
              <option value="14K" ${data.purity === '14K' ? 'selected' : ''}>14K (58.33%)</option>
              <option value="999" ${data.purity === '999' ? 'selected' : ''}>999 (Pure Silver)</option>
              <option value="925" ${data.purity === '925' ? 'selected' : ''}>925 (Sterling Silver)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Weight (Grams)</label>
            <input type="number" id="metal-weight" class="form-control" value="${data.weightGrams || ''}" step="any" min="0" placeholder="e.g., 10.5">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Rate per Gram at Purchase (₹/g)</label>
            <input type="number" id="metal-rate-purchase" class="form-control" value="${data.purchaseRatePerGram || ''}" step="any" min="0" placeholder="e.g., 7200">
          </div>
          <div class="form-group">
            <label>Making Charges (₹ - Sunk Cost)</label>
            <input type="number" id="metal-making-charges" class="form-control" value="${data.makingCharges || ''}" step="any" min="0" placeholder="e.g., 4500">
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Total Invested / Purchase Cost (₹)</label>
          <input type="number" id="asset-invested" class="form-control" value="${data.investedAmount || ''}" step="any" min="0" required>
        </div>
        <div class="form-group">
          <label>Current Value (₹)</label>
          <input type="number" id="asset-current" class="form-control" value="${data.currentValue || ''}" step="any" min="0" required>
        </div>
      </div>

      <!-- Independent Wealth Inclusion Controls -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-3);margin:var(--sp-3) 0;">
        <div style="font-weight:600;font-size:var(--fs-xs);color:var(--text-muted);text-transform:uppercase;margin-bottom:var(--sp-2);">
          Wealth Inclusion Controls (Strictly Independent)
        </div>
        
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--sp-2) 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:600;font-size:var(--fs-sm);">Show on Dashboard</div>
            <div style="font-size:11px;color:var(--text-muted);">Display card on the Home dashboard</div>
          </div>
          <label class="switch-toggle">
            <input type="checkbox" id="asset-show-dashboard" ${data.showOnDashboard !== 0 ? 'checked' : ''}>
            <span class="slider-round"></span>
          </label>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--sp-2) 0;">
          <div>
            <div style="font-weight:600;font-size:var(--fs-sm);">Include in Total Wealth</div>
            <div style="font-size:11px;color:var(--text-muted);">
              Add value to Net Worth. Turn OFF for personal gifts/keepsakes (Tracked Personal Assets).
            </div>
          </div>
          <label class="switch-toggle">
            <input type="checkbox" id="asset-include-wealth" ${data.includeInWealth !== 0 ? 'checked' : ''}>
            <span class="slider-round"></span>
          </label>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Purchase Date</label>
          <input type="date" id="asset-purchase-date" class="form-control" value="${data.purchaseDate || todayISO()}">
        </div>
        <div class="form-group">
          <label>Valuation Date</label>
          <input type="date" id="asset-val-date" class="form-control" value="${data.lastValuationDate || todayISO()}">
        </div>
      </div>

      <div class="form-group">
        <label>Notes & Locker Location</label>
        <textarea id="asset-notes" class="form-control" rows="2" placeholder="e.g. In bank locker box #4, invoice in folder">${escapeHtml(data.notes || '')}</textarea>
      </div>

      <div class="form-actions" style="margin-top:var(--sp-3);display:flex;justify-content:flex-end;gap:var(--sp-2);">
        <button type="button" class="btn btn-secondary modal-close">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update Asset' : 'Add Asset'}</button>
      </div>
    </form>
  `);

  // Type change listener to show/hide metal inputs
  $('#asset-type').addEventListener('change', (e) => {
    const val = e.target.value;
    const isM = val === 'gold' || val === 'silver';
    $('#metal-fields-container').style.display = isM ? 'block' : 'none';
  });

  // Auto-calculate metal current value if weight & rates change
  function syncMetalCalc() {
    const weight = parseFloat($('#metal-weight').value) || 0;
    const purchaseRate = parseFloat($('#metal-rate-purchase').value) || 0;
    const making = parseFloat($('#metal-making-charges').value) || 0;
    const purity = $('#metal-purity').value;
    const type = $('#asset-type').value;

    if (weight > 0 && purchaseRate > 0) {
      const purchaseMetalVal = weight * purchaseRate;
      const totalInvested = purchaseMetalVal + making;
      if (!$('#asset-invested').value || !isEdit) {
        $('#asset-invested').value = totalInvested;
      }
      // Estimate current resale value using purity
      const purityFactors = { '24K': 1.0, '22K': 0.9167, '20K': 0.8333, '18K': 0.75, '14K': 0.5833, '999': 0.999, '925': 0.925 };
      const factor = purityFactors[purity] || 0.9167;
      // Default to current market rate fallback or purchase rate * purity
      const currentVal = Math.round(weight * purchaseRate * factor);
      if (!$('#asset-current').value || !isEdit) {
        $('#asset-current').value = currentVal;
      }
    }
  }

  $('#metal-weight')?.addEventListener('input', syncMetalCalc);
  $('#metal-rate-purchase')?.addEventListener('input', syncMetalCalc);
  $('#metal-making-charges')?.addEventListener('input', syncMetalCalc);
  $('#metal-purity')?.addEventListener('change', syncMetalCalc);

  $('#asset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = $('#asset-type').value;
    const isM = type === 'gold' || type === 'silver';

    const assetData = {
      name: $('#asset-name').value.trim(),
      type,
      category: isM ? 'physical' : 'financial',
      isPhysical: isM ? 1 : 0,
      institution: $('#asset-institution').value.trim(),
      investedAmount: parseFloat($('#asset-invested').value) || 0,
      currentValue: parseFloat($('#asset-current').value) || 0,
      showOnDashboard: $('#asset-show-dashboard').checked ? 1 : 0,
      includeInWealth: $('#asset-include-wealth').checked ? 1 : 0,
      purity: isM ? $('#metal-purity').value : null,
      weightGrams: isM ? parseFloat($('#metal-weight').value) || null : null,
      purchaseRatePerGram: isM ? parseFloat($('#metal-rate-purchase').value) || null : null,
      makingCharges: isM ? parseFloat($('#metal-making-charges').value) || 0 : 0,
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
        showToast('Asset saved!', 'success');
      }
      closeModal();
      handleRoute();
      syncAllWithSupabase().catch(() => {});
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

  let activePreset = 'month'; // 'month', 'prev_month', '30days', '7days', 'quarter', 'year', 'custom'
  const accounts = await getActiveAccounts();
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  function getReportRange(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const formatDateVal = dt => dt.toISOString().split('T')[0];

    switch (preset) {
      case '7days': {
        const past = new Date(now);
        past.setDate(d - 6);
        return { start: formatDateVal(past), end: formatDateVal(now) + 'T23:59:59', label: 'Last 7 Days' };
      }
      case '30days': {
        const past = new Date(now);
        past.setDate(d - 29);
        return { start: formatDateVal(past), end: formatDateVal(now) + 'T23:59:59', label: 'Last 30 Days' };
      }
      case 'month': {
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);
        return { start: formatDateVal(start), end: formatDateVal(end) + 'T23:59:59', label: `${getMonthName(m + 1)} ${y}` };
      }
      case 'prev_month': {
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);
        return { start: formatDateVal(start), end: formatDateVal(end) + 'T23:59:59', label: `${getMonthName(m === 0 ? 12 : m)} ${m === 0 ? y - 1 : y}` };
      }
      case 'quarter': {
        const qStartMonth = Math.floor(m / 3) * 3;
        const start = new Date(y, qStartMonth, 1);
        const end = new Date(y, qStartMonth + 3, 0);
        const qNum = Math.floor(m / 3) + 1;
        return { start: formatDateVal(start), end: formatDateVal(end) + 'T23:59:59', label: `Q${qNum} ${y}` };
      }
      case 'year': {
        const start = new Date(y, 0, 1);
        const end = new Date(y, 11, 31);
        return { start: formatDateVal(start), end: formatDateVal(end) + 'T23:59:59', label: `Year ${y}` };
      }
      case 'custom': {
        const from = $('#report-from')?.value;
        const to = $('#report-to')?.value;
        return { start: from, end: to ? to + 'T23:59:59' : undefined, label: `${from || 'Start'} to ${to || 'End'}` };
      }
      default:
        return { start: undefined, end: undefined, label: 'All Time' };
    }
  }

  container.innerHTML = `
    <div class="page-header">
      <h1>Reports & Statements</h1>
      <p id="report-period-heading">Detailed financial analytics & cashflow breakdown</p>
    </div>

    <!-- Duration Preset Bar -->
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--sp-4);margin-bottom:var(--sp-5);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--sp-3);margin-bottom:var(--sp-3);">
        <div class="filter-presets" style="margin:0;">
          <button class="filter-preset-btn active" data-rpreset="month">This Month</button>
          <button class="filter-preset-btn" data-rpreset="prev_month">Previous Month</button>
          <button class="filter-preset-btn" data-rpreset="30days">Last 30 Days</button>
          <button class="filter-preset-btn" data-rpreset="7days">Last 7 Days</button>
          <button class="filter-preset-btn" data-rpreset="quarter">This Quarter</button>
          <button class="filter-preset-btn" data-rpreset="year">This Year</button>
          <button class="filter-preset-btn" data-rpreset="custom">Custom Range</button>
        </div>
        <button class="btn btn-secondary" id="export-csv-btn">📥 Export Excel CSV</button>
      </div>

      <div id="report-custom-wrap" style="display:none;gap:var(--sp-2);align-items:center;margin-top:var(--sp-2);">
        <label style="font-size:12px;color:var(--text-secondary);">From:</label>
        <input type="date" id="report-from" class="form-control" style="font-size:12px;max-width:160px;">
        <label style="font-size:12px;color:var(--text-secondary);">To:</label>
        <input type="date" id="report-to" class="form-control" style="font-size:12px;max-width:160px;">
        <button class="btn btn-sm btn-primary" id="report-custom-apply">Apply</button>
      </div>
    </div>

    <div id="report-content-body"></div>
  `;

  async function loadReportData() {
    const { start, end, label } = getReportRange(activePreset);
    $('#report-period-heading').textContent = `Period: ${label}`;

    const report = await getDateRangeReport(start, end);

    // Destroy prior charts
    reportCharts.forEach(c => c.destroy());
    reportCharts = [];

    const sortedExpCats = Object.entries(report.expenseByCategory).sort((a, b) => b[1] - a[1]);
    const sortedIncCats = Object.entries(report.incomeByCategory).sort((a, b) => b[1] - a[1]);

    const contentEl = $('#report-content-body');
    contentEl.innerHTML = `
      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card income">
          <div class="stat-label">Total Income</div>
          <div class="stat-value">${formatCurrency(report.totalIncome)}</div>
          <div class="stat-sub">${Object.keys(report.incomeByCategory).length} income sources</div>
        </div>
        <div class="stat-card expense">
          <div class="stat-label">Total Expenses</div>
          <div class="stat-value">${formatCurrency(report.totalExpense)}</div>
          <div class="stat-sub">${Object.keys(report.expenseByCategory).length} expense categories</div>
        </div>
        <div class="stat-card ${report.netCashFlow >= 0 ? 'savings' : 'expense'}">
          <div class="stat-label">Net Savings</div>
          <div class="stat-value">${report.netCashFlow >= 0 ? '+' : ''}${formatCurrency(report.netCashFlow)}</div>
          <div class="stat-sub">Savings Rate: ${report.savingsRate.toFixed(1)}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Daily Avg Spending</div>
          <div class="stat-value">${formatCurrency(report.dailyAvgSpending)}</div>
          <div class="stat-sub">${report.days} days in period</div>
        </div>
      </div>

      <!-- Charts Row -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:var(--sp-4);margin-top:var(--sp-5);">
        <div class="chart-container">
          <h3>Expenses by Category</h3>
          <canvas id="expense-pie-chart"></canvas>
        </div>
        <div class="chart-container">
          <h3>Daily Spending Trend</h3>
          <canvas id="daily-bar-chart"></canvas>
        </div>
      </div>

      <!-- Expense Breakdown -->
      <div class="section" style="margin-top:var(--sp-6);">
        <div class="section-header">
          <h2>Expense Breakdown by Category</h2>
          <span style="font-size:var(--fs-xs);color:var(--text-secondary);">${sortedExpCats.length} Categories</span>
        </div>
        <div class="breakdown-list">
          ${sortedExpCats.map(([name, amount], i) => {
            const pct = report.totalExpense > 0 ? (amount / report.totalExpense * 100) : 0;
            return `
              <div class="breakdown-item">
                <div class="breakdown-name">${escapeHtml(name)} (${pct.toFixed(1)}%)</div>
                <div class="breakdown-bar-bg">
                  <div class="breakdown-bar" style="width:${pct}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></div>
                </div>
                <div class="breakdown-value">${formatCurrency(amount)}</div>
              </div>
            `;
          }).join('')}
          ${sortedExpCats.length === 0 ? '<p style="color:var(--text-muted);font-size:var(--fs-sm)">No expense records in this period.</p>' : ''}
        </div>
      </div>

      <!-- Income Breakdown -->
      <div class="section">
        <div class="section-header">
          <h2>Income Breakdown by Source</h2>
          <span style="font-size:var(--fs-xs);color:var(--text-secondary);">${sortedIncCats.length} Sources</span>
        </div>
        <div class="breakdown-list">
          ${sortedIncCats.map(([name, amount], i) => {
            const pct = report.totalIncome > 0 ? (amount / report.totalIncome * 100) : 0;
            return `
              <div class="breakdown-item">
                <div class="breakdown-name">${escapeHtml(name)} (${pct.toFixed(1)}%)</div>
                <div class="breakdown-bar-bg">
                  <div class="breakdown-bar" style="width:${pct}%;background:${CHART_COLORS[(i + 4) % CHART_COLORS.length]}"></div>
                </div>
                <div class="breakdown-value" style="color:var(--green)">+${formatCurrency(amount)}</div>
              </div>
            `;
          }).join('')}
          ${sortedIncCats.length === 0 ? '<p style="color:var(--text-muted);font-size:var(--fs-sm)">No income records in this period.</p>' : ''}
        </div>
      </div>

      <!-- Account Cashflow Movements -->
      <div class="section">
        <div class="section-header">
          <h2>Account-wise Cashflow Movement</h2>
        </div>
        <div class="breakdown-list">
          ${Object.entries(report.accountMovements).map(([accName, mov]) => `
            <div class="breakdown-item">
              <div class="breakdown-name" style="font-weight:600;">${escapeHtml(accName)}</div>
              <div style="font-size:var(--fs-xs);color:var(--text-secondary);">
                In: <span style="color:var(--green)">+${formatCurrency(mov.in)}</span> &nbsp;|&nbsp;
                Out: <span style="color:var(--red)">-${formatCurrency(mov.out)}</span>
              </div>
              <div class="breakdown-value ${mov.net >= 0 ? 'positive' : 'negative'}">
                Net: ${mov.net >= 0 ? '+' : ''}${formatCurrency(mov.net)}
              </div>
            </div>
          `).join('')}
          ${Object.keys(report.accountMovements).length === 0 ? '<p style="color:var(--text-muted);font-size:var(--fs-sm)">No account movements in this period.</p>' : ''}
        </div>
      </div>
    `;

    // Render Pie Chart
    const pieCanvas = $('#expense-pie-chart');
    if (pieCanvas && sortedExpCats.length > 0) {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const textColor = isDark ? '#94a3b8' : '#64748b';

      const chart1 = new Chart(pieCanvas, {
        type: 'doughnut',
        data: {
          labels: sortedExpCats.map(([n]) => n),
          datasets: [{
            data: sortedExpCats.map(([, a]) => a),
            backgroundColor: sortedExpCats.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
            borderWidth: 2,
            borderColor: isDark ? '#1a1a2e' : '#ffffff',
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor, boxWidth: 12, padding: 10, font: { size: 11 } },
            },
          },
        },
      });
      reportCharts.push(chart1);
    }

    // Render Daily Bar Chart
    const barCanvas = $('#daily-bar-chart');
    if (barCanvas) {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const textColor = isDark ? '#94a3b8' : '#64748b';
      const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

      const days = Object.keys(report.dailyExpenses).sort();
      const values = days.map(d => report.dailyExpenses[d]);
      const labels = days.map(d => d.slice(5));

      const chart2 = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: labels.length ? labels : ['No Data'],
          datasets: [{
            label: 'Daily Outflow',
            data: values.length ? values : [0],
            backgroundColor: CHART_COLORS[0] + 'aa',
            borderColor: CHART_COLORS[0],
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 10 } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => '₹' + v } },
          },
        },
      });
      reportCharts.push(chart2);
    }
  }

  // Duration Preset Handlers
  $$('[data-rpreset]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-rpreset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePreset = btn.dataset.rpreset;

      const customWrap = $('#report-custom-wrap');
      if (activePreset === 'custom') {
        customWrap.style.display = 'flex';
        if (!$('#report-from').value) {
          const now = new Date();
          $('#report-from').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
          $('#report-to').value = now.toISOString().split('T')[0];
        }
      } else {
        customWrap.style.display = 'none';
        loadReportData();
      }
    });
  });

  $('#report-custom-apply')?.addEventListener('click', loadReportData);

  // CSV export
  $('#export-csv-btn')?.addEventListener('click', async () => {
    const { start, end, label } = getReportRange(activePreset);
    const csv = await exportToCSV({ startDate: start, endDate: end });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Wealthbook-Report-${label.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Excel CSV Report exported successfully!', 'success');
  });

  await loadReportData();
}

// ── LENDING & BORROWING VIEW ──────────────────────────────────────────

async function renderLending(container) {
  const summary = await getLendBorrowSummary();
  const allEntries = await getLendBorrowList();
  const accounts = await getActiveAccounts();
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  let currentTab = 'lent'; // 'lent' or 'borrowed'

  container.innerHTML = `
    <div class="page-header">
      <h1>Lending & Borrowing</h1>
      <p>Track money you have given to others and money you owe</p>
    </div>

    <!-- Sub-navigation Pills -->
    <div class="subnav-pills">
      <a href="#/accounts" class="subnav-pill">💵 Liquid Accounts</a>
      <a href="#/investments" class="subnav-pill">📈 Investments</a>
      <a href="#/lending" class="subnav-pill active">🤝 Lend & Borrow</a>
      <a href="#/liabilities" class="subnav-pill">🏛️ Liabilities & Loans</a>
      <a href="#/insurance" class="subnav-pill">🛡️ Insurance</a>
    </div>

    <!-- Summary KPI Cards -->
    <div class="stats-grid" style="margin-bottom:var(--sp-5);">
      <div class="stat-card income">
        <div class="stat-label">Money Lent (Receivable)</div>
        <div class="stat-value" style="color:var(--green)">${formatCurrency(summary.outstandingLent)}</div>
        <div class="stat-sub">Recovered ${formatCurrency(summary.totalRecovered)} of ${formatCurrency(summary.totalLent)}</div>
      </div>
      <div class="stat-card expense">
        <div class="stat-label">Money Borrowed (Payable)</div>
        <div class="stat-value" style="color:var(--red)">${formatCurrency(summary.outstandingBorrowed)}</div>
        <div class="stat-sub">Repaid ${formatCurrency(summary.totalRepaid)} of ${formatCurrency(summary.totalBorrowed)}</div>
      </div>
      <div class="stat-card ${summary.netPosition >= 0 ? 'savings' : 'expense'}">
        <div class="stat-label">Net Lending Position</div>
        <div class="stat-value">${summary.netPosition >= 0 ? '+' : ''}${formatCurrency(summary.netPosition)}</div>
        <div class="stat-sub">${summary.netPosition >= 0 ? 'You are a net lender' : 'You are a net borrower'}</div>
      </div>
    </div>

    <!-- Top View Tabs -->
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--sp-3);margin-bottom:var(--sp-4);">
      <div class="view-tabs" style="margin:0;border:none;padding:0;">
        <button class="view-tab active" id="tab-lend-lent">🤝 Money Lent (I Gave)</button>
        <button class="view-tab" id="tab-lend-borrowed">📥 Money Borrowed (I Took)</button>
      </div>
      <button class="btn btn-primary" id="btn-add-lend-entry">+ Record Entry</button>
    </div>

    <!-- Cards Container -->
    <div id="lend-cards-container" class="financial-cards-grid"></div>
  `;

  function renderCards() {
    const list = allEntries.filter(e => e.type === currentTab);
    const containerEl = $('#lend-cards-container');

    if (list.length === 0) {
      containerEl.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="emoji">${currentTab === 'lent' ? '🤝' : '📥'}</div>
          <h3>No ${currentTab === 'lent' ? 'money lent' : 'money borrowed'} records</h3>
          <p>Click "+ Record Entry" to log loans with friends, family, or institutions with full partial repayment tracking.</p>
        </div>
      `;
      return;
    }

    containerEl.innerHTML = list.map(entry => {
      const pct = entry.amount > 0 ? Math.min(100, Math.round((entry.paidAmount / entry.amount) * 100)) : 0;
      const isSettled = entry.status === 'settled' || entry.outstandingAmount <= 0;
      const statusClass = isSettled ? 'settled' : entry.status === 'partial' ? 'partial' : 'active';
      const statusLabel = isSettled ? 'Settled' : entry.status === 'partial' ? 'Partial' : 'Active';

      return `
        <div class="financial-card">
          <div class="f-card-header">
            <div>
              <div class="f-card-title">${escapeHtml(entry.personName)}</div>
              <div class="f-card-subtitle">${entry.contactNumber ? escapeHtml(entry.contactNumber) + ' · ' : ''}${formatDate(entry.date)}</div>
            </div>
            <span class="badge-status ${statusClass}">${statusLabel}</span>
          </div>

          <div class="f-card-amount-block">
            <div>
              <div class="f-card-amount-label">Outstanding Balance</div>
              <div class="f-card-amount-val" style="color:${currentTab === 'lent' ? 'var(--green)' : 'var(--red)'}">
                ${formatCurrency(entry.outstandingAmount)}
              </div>
            </div>
            <div style="text-align:right;">
              <div class="f-card-amount-label">Initial Amount</div>
              <div style="font-size:var(--fs-sm);font-weight:700;color:var(--text-secondary)">
                ${formatCurrency(entry.amount)}
              </div>
            </div>
          </div>

          <!-- Repayment Progress -->
          <div class="progress-track">
            <div class="progress-fill ${pct === 100 ? 'green' : 'orange'}" style="width:${pct}%"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);margin-bottom:var(--sp-2);">
            <span>${currentTab === 'lent' ? 'Recovered' : 'Repaid'}: ${formatCurrency(entry.paidAmount)} (${pct}%)</span>
            <span>${entry.expectedDate ? 'Due: ' + formatDate(entry.expectedDate) : ''}</span>
          </div>

          <div class="f-card-meta">
            <div class="f-card-meta-row">
              <span>Account:</span>
              <span style="font-weight:600;color:var(--text-primary);">${escapeHtml(accMap[entry.accountId]?.name || 'Not linked')}</span>
            </div>
            ${entry.purpose ? `<div class="f-card-meta-row"><span>Purpose:</span><span>${escapeHtml(entry.purpose)}</span></div>` : ''}
            ${entry.notes ? `<div class="f-card-meta-row" style="font-style:italic;"><span>Notes:</span><span>${escapeHtml(entry.notes)}</span></div>` : ''}
          </div>

          <div class="f-card-actions">
            ${!isSettled ? `
              <button class="btn btn-sm btn-primary record-repayment-btn" data-lend-id="${entry.id}" style="flex:1;">
                + Add Repayment
              </button>
            ` : '<div style="flex:1;font-size:12px;color:var(--green);font-weight:600;display:flex;align-items:center;">✓ Fully Settled</div>'}
            <button class="btn btn-sm btn-secondary view-lend-history-btn" data-lend-id="${entry.id}">📜 History</button>
            <button class="btn btn-sm btn-ghost delete-lend-btn" data-lend-id="${entry.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach Handlers
    $$('.record-repayment-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.lendId);
        const entry = allEntries.find(e => e.id === id);
        if (entry) showLendRepaymentModal(entry);
      });
    });

    $$('.view-lend-history-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.lendId);
        const entry = allEntries.find(e => e.id === id);
        if (entry) showLendHistoryModal(entry);
      });
    });

    $$('.delete-lend-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.lendId);
        if (confirm('Delete this lending/borrowing record?')) {
          await db.lendBorrow.delete(id);
          await db.lendBorrowRepayments.where('lendBorrowId').equals(id).delete();
          showToast('Record deleted.', 'info');
          handleRoute();
        }
      });
    });
  }

  // Tab switching
  const tabLent = $('#tab-lend-lent');
  const tabBorrowed = $('#tab-lend-borrowed');

  tabLent.addEventListener('click', () => {
    currentTab = 'lent';
    tabLent.classList.add('active');
    tabBorrowed.classList.remove('active');
    renderCards();
  });

  tabBorrowed.addEventListener('click', () => {
    currentTab = 'borrowed';
    tabBorrowed.classList.add('active');
    tabLent.classList.remove('active');
    renderCards();
  });

  $('#btn-add-lend-entry').addEventListener('click', () => showLendBorrowModal(currentTab));

  renderCards();
}

// ── Lending / Borrowing Modals ────────────────────────────────────────
async function showLendBorrowModal(defaultType = 'lent') {
  const accounts = await getActiveAccounts();

  showModal(`
    <div class="modal-header">
      <h3>Record ${defaultType === 'lent' ? 'Money Lent (Given)' : 'Money Borrowed (Taken)'}</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="lend-borrow-form">
      <div class="form-row">
        <div class="form-group">
          <label>Type *</label>
          <select id="lb-type" class="form-control">
            <option value="lent" ${defaultType === 'lent' ? 'selected' : ''}>Money Lent (I Gave Money)</option>
            <option value="borrowed" ${defaultType === 'borrowed' ? 'selected' : ''}>Money Borrowed (I Took Money)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Person / Institution Name *</label>
          <input type="text" id="lb-name" class="form-control" required placeholder="e.g. Rahul Sharma, Uncle, SBI">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Amount (₹) *</label>
          <input type="number" id="lb-amount" class="form-control" step="any" min="1" required placeholder="e.g. 5000">
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" id="lb-date" class="form-control" value="${todayISO()}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Payment / Receiving Account *</label>
          <select id="lb-account" class="form-control" required>
            <option value="">Select Account</option>
            ${accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${escapeHtml(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Expected Repayment Date</label>
          <input type="date" id="lb-expected" class="form-control">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Contact Phone (Optional)</label>
          <input type="tel" id="lb-contact" class="form-control" placeholder="+91 98765 43210">
        </div>
        <div class="form-group">
          <label>Purpose / Description</label>
          <input type="text" id="lb-purpose" class="form-control" placeholder="e.g. Emergency, Event, Advance">
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="lb-notes" class="form-control" rows="2" placeholder="Agreements, terms, or reference details"></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Ledger Entry</button>
      </div>
    </form>
  `);

  $('#lend-borrow-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      type: $('#lb-type').value,
      personName: $('#lb-name').value.trim(),
      amount: parseFloat($('#lb-amount').value) || 0,
      date: $('#lb-date').value,
      accountId: parseInt($('#lb-account').value) || null,
      expectedDate: $('#lb-expected').value,
      contactNumber: $('#lb-contact').value.trim(),
      purpose: $('#lb-purpose').value.trim(),
      notes: $('#lb-notes').value.trim()
    };

    try {
      await createLendBorrow(payload);
      showToast('Record saved and account balance updated!', 'success');
      closeModal();
      handleRoute();
      syncAllWithSupabase().catch(() => {});
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

async function showLendRepaymentModal(entry) {
  const accounts = await getActiveAccounts();

  showModal(`
    <div class="modal-header">
      <h3>Record Repayment — ${escapeHtml(entry.personName)}</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="lend-repay-form">
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-3);margin-bottom:var(--sp-4);">
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>Initial: <strong>${formatCurrency(entry.amount)}</strong></span>
          <span>Already Paid: <strong>${formatCurrency(entry.paidAmount)}</strong></span>
        </div>
        <div style="margin-top:4px;font-size:13px;font-weight:700;color:var(--text-primary)">
          Current Outstanding: ${formatCurrency(entry.outstandingAmount)}
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Repayment Amount (₹) *</label>
          <input type="number" id="lr-amount" class="form-control" step="any" min="1" max="${entry.outstandingAmount}" value="${entry.outstandingAmount}" required>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" id="lr-date" class="form-control" value="${todayISO()}" required>
        </div>
      </div>
      <div class="form-group">
        <label>${entry.type === 'lent' ? 'Received Into Account' : 'Paid From Account'} *</label>
        <select id="lr-account" class="form-control" required>
          ${accounts.map(a => `<option value="${a.id}" ${entry.accountId === a.id ? 'selected' : ''}>${a.icon || ''} ${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <input type="text" id="lr-notes" class="form-control" placeholder="Installment details, receipt, or mode">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">Record Repayment</button>
      </div>
    </form>
  `);

  $('#lend-repay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat($('#lr-amount').value) || 0;
    const date = $('#lr-date').value;
    const accountId = parseInt($('#lr-account').value) || null;
    const notes = $('#lr-notes').value.trim();

    try {
      await recordLendBorrowRepayment(entry.id, { amount, date, accountId, notes });
      showToast(`Repayment of ${formatCurrency(amount)} recorded!`, 'success');
      closeModal();
      handleRoute();
      syncAllWithSupabase().catch(() => {});
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

async function showLendHistoryModal(entry) {
  const repayments = await getLendBorrowRepayments(entry.id);
  const accounts = await getActiveAccounts();
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  showModal(`
    <div class="modal-header">
      <h3>Repayment History — ${escapeHtml(entry.personName)}</h3>
      <button class="modal-close">✕</button>
    </div>
    <div style="margin-bottom:var(--sp-4);">
      <div style="font-size:12px;color:var(--text-secondary);display:flex;justify-content:space-between;">
        <span>Original: ${formatCurrency(entry.amount)} (${formatDate(entry.date)})</span>
        <span>Balance: <strong>${formatCurrency(entry.outstandingAmount)}</strong></span>
      </div>
    </div>
    <div style="max-height:300px;overflow-y:auto;">
      ${repayments.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--sp-2) 0;border-bottom:1px solid var(--border);font-size:13px;">
          <div>
            <div style="font-weight:600;">${formatCurrency(r.amount)}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${formatDate(r.date)} · ${escapeHtml(accMap[r.accountId]?.name || 'Account')}</div>
            ${r.notes ? `<div style="font-size:11px;color:var(--text-secondary);font-style:italic;">${escapeHtml(r.notes)}</div>` : ''}
          </div>
          <span style="color:var(--green);font-size:11px;font-weight:700;">✓ Received</span>
        </div>
      `).join('')}
      ${repayments.length === 0 ? '<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:var(--sp-4);">No repayments recorded yet.</p>' : ''}
    </div>
    <div class="modal-actions" style="margin-top:var(--sp-4);">
      <button type="button" class="btn btn-secondary modal-cancel">Close</button>
    </div>
  `);
}

// ── LIABILITIES & LOANS VIEW ──────────────────────────────────────────

async function renderLiabilities(container) {
  const loans = await getLiabilities();
  const accounts = await getActiveAccounts();
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  const totalOutstanding = loans.reduce((acc, l) => acc + (l.currentOutstanding || 0), 0);
  const totalEmi = loans.reduce((acc, l) => acc + (l.monthlyEmi || 0), 0);
  const activeLoans = loans.filter(l => l.currentOutstanding > 0);

  container.innerHTML = `
    <div class="page-header">
      <h1>Liabilities & Loans</h1>
      <p>Track Home, Personal, Vehicle, Education loans and Credit Card debt</p>
    </div>

    <!-- Sub-navigation Pills -->
    <div class="subnav-pills">
      <a href="#/accounts" class="subnav-pill">💵 Liquid Accounts</a>
      <a href="#/investments" class="subnav-pill">📈 Investments</a>
      <a href="#/lending" class="subnav-pill">🤝 Lend & Borrow</a>
      <a href="#/liabilities" class="subnav-pill active">🏛️ Liabilities & Loans</a>
      <a href="#/insurance" class="subnav-pill">🛡️ Insurance</a>
    </div>

    <!-- KPI Summary Bar -->
    <div class="stats-grid" style="margin-bottom:var(--sp-5);">
      <div class="stat-card expense">
        <div class="stat-label">Total Debt Outstanding</div>
        <div class="stat-value" style="color:var(--red)">${formatCurrency(totalOutstanding)}</div>
        <div class="stat-sub">Across ${activeLoans.length} active liabilities</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Monthly EMI Obligations</div>
        <div class="stat-value">${formatCurrency(totalEmi)}</div>
        <div class="stat-sub">Monthly cash outflow</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Loans</div>
        <div class="stat-value">${activeLoans.length}</div>
        <div class="stat-sub">${loans.length - activeLoans.length} fully paid off</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-bottom:var(--sp-4);">
      <button class="btn btn-primary" id="btn-add-liability">+ Add Loan / Liability</button>
    </div>

    <!-- Loans Grid -->
    <div class="financial-cards-grid">
      ${loans.map(loan => {
        const total = loan.totalLoanAmount || 0;
        const paid = loan.totalPaid || (total - loan.currentOutstanding) || 0;
        const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
        const isClosed = loan.currentOutstanding <= 0;

        return `
          <div class="financial-card">
            <div class="f-card-header">
              <div>
                <div class="f-card-title">${escapeHtml(loan.loanName)}</div>
                <div class="f-card-subtitle">${escapeHtml(loan.lender || 'Lender')} · ${escapeHtml(loan.loanType || 'Loan')}</div>
              </div>
              <span class="badge-status ${isClosed ? 'settled' : 'active'}">${isClosed ? 'Closed' : 'Active'}</span>
            </div>

            <div class="f-card-amount-block">
              <div>
                <div class="f-card-amount-label">Current Outstanding</div>
                <div class="f-card-amount-val" style="color:var(--red)">${formatCurrency(loan.currentOutstanding)}</div>
              </div>
              <div style="text-align:right;">
                <div class="f-card-amount-label">Monthly EMI</div>
                <div style="font-size:var(--fs-base);font-weight:700;color:var(--text-primary)">${formatCurrency(loan.monthlyEmi)}</div>
              </div>
            </div>

            <!-- Repayment Progress -->
            <div class="progress-track">
              <div class="progress-fill ${pct === 100 ? 'green' : 'orange'}" style="width:${pct}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);margin-bottom:var(--sp-2);">
              <span>Repaid: ${formatCurrency(paid)} (${pct}%)</span>
              <span>Total: ${formatCurrency(total)}</span>
            </div>

            <div class="f-card-meta">
              <div class="f-card-meta-row">
                <span>Interest Rate:</span>
                <span>${loan.interestRate ? loan.interestRate + '% p.a.' : 'N/A'}</span>
              </div>
              <div class="f-card-meta-row">
                <span>Next EMI Due Date:</span>
                <span style="font-weight:600;color:var(--text-primary);">${formatDate(loan.nextDueDate) || 'Not set'}</span>
              </div>
              ${loan.accountNumber ? `<div class="f-card-meta-row"><span>Account No:</span><span>${escapeHtml(loan.accountNumber)}</span></div>` : ''}
              ${loan.notes ? `<div class="f-card-meta-row" style="font-style:italic;"><span>Notes:</span><span>${escapeHtml(loan.notes)}</span></div>` : ''}
            </div>

            <div class="f-card-actions">
              ${!isClosed ? `
                <button class="btn btn-sm btn-primary record-emi-btn" data-loan-id="${loan.id}" style="flex:1;">
                  💸 Record EMI Payment
                </button>
              ` : '<div style="flex:1;font-size:12px;color:var(--green);font-weight:600;">✓ Debt Fully Cleared</div>'}
              <button class="btn btn-sm btn-secondary edit-loan-btn" data-loan-id="${loan.id}">✏️ Edit</button>
              <button class="btn btn-sm btn-ghost delete-loan-btn" data-loan-id="${loan.id}">🗑️</button>
            </div>
          </div>
        `;
      }).join('')}
      ${loans.length === 0 ? `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="emoji">🏛️</div>
          <h3>No liabilities recorded</h3>
          <p>Track your Home Loans, Car Loans, Personal Loans, and Credit Card balances with automatic EMI schedules.</p>
        </div>
      ` : ''}
    </div>
  `;

  $('#btn-add-liability')?.addEventListener('click', () => showLiabilityModal());

  $$('.record-emi-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.loanId);
      const loan = loans.find(l => l.id === id);
      if (loan) showLiabilityRepaymentModal(loan);
    });
  });

  $$('.edit-loan-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.loanId);
      const loan = loans.find(l => l.id === id);
      if (loan) showLiabilityModal(loan);
    });
  });

  $$('.delete-loan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.loanId);
      if (confirm('Delete this loan record?')) {
        await deleteLiability(id);
        showToast('Loan record deleted.', 'info');
        handleRoute();
      }
    });
  });
}

// ── Liability Modals ──────────────────────────────────────────────────
async function showLiabilityModal(data = {}) {
  const isEdit = !!data.id;

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit' : 'New'} Liability / Loan</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="liability-form">
      <div class="form-row">
        <div class="form-group">
          <label>Loan Name *</label>
          <input type="text" id="loan-name" class="form-control" value="${escapeHtml(data.loanName || '')}" required placeholder="e.g. Home Loan, Car Loan, HDFC Credit Card">
        </div>
        <div class="form-group">
          <label>Loan Type</label>
          <select id="loan-type" class="form-control">
            <option value="home" ${data.loanType === 'home' ? 'selected' : ''}>Home Loan</option>
            <option value="personal" ${data.loanType === 'personal' ? 'selected' : ''}>Personal Loan</option>
            <option value="vehicle" ${data.loanType === 'vehicle' ? 'selected' : ''}>Vehicle Loan</option>
            <option value="education" ${data.loanType === 'education' ? 'selected' : ''}>Education Loan</option>
            <option value="credit_card" ${data.loanType === 'credit_card' ? 'selected' : ''}>Credit Card Outstanding</option>
            <option value="business" ${data.loanType === 'business' ? 'selected' : ''}>Business Loan</option>
            <option value="family" ${data.loanType === 'family' ? 'selected' : ''}>Family / Hand Loan</option>
            <option value="other" ${data.loanType === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Lender / Bank / Institution</label>
          <input type="text" id="loan-lender" class="form-control" value="${escapeHtml(data.lender || '')}" placeholder="e.g. SBI, HDFC Bank, ICICI">
        </div>
        <div class="form-group">
          <label>Account / Loan Number</label>
          <input type="text" id="loan-account-num" class="form-control" value="${escapeHtml(data.accountNumber || '')}" placeholder="e.g. LN-984210">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Original Loan Amount (₹) *</label>
          <input type="number" id="loan-orig" class="form-control" step="any" min="0" value="${data.totalLoanAmount || ''}" required>
        </div>
        <div class="form-group">
          <label>Current Outstanding Balance (₹) *</label>
          <input type="number" id="loan-out" class="form-control" step="any" min="0" value="${data.currentOutstanding !== undefined ? data.currentOutstanding : ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Monthly EMI (₹)</label>
          <input type="number" id="loan-emi" class="form-control" step="any" min="0" value="${data.monthlyEmi || ''}" placeholder="e.g. 15000">
        </div>
        <div class="form-group">
          <label>Interest Rate (% p.a.)</label>
          <input type="number" id="loan-rate" class="form-control" step="any" min="0" value="${data.interestRate || ''}" placeholder="e.g. 8.5">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tenure (Months)</label>
          <input type="number" id="loan-tenure" class="form-control" value="${data.tenureMonths || ''}" placeholder="e.g. 240">
        </div>
        <div class="form-group">
          <label>Next Due Date</label>
          <input type="date" id="loan-due" class="form-control" value="${data.nextDueDate || todayISO()}">
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="loan-notes" class="form-control" rows="2" placeholder="Auto-debit accounts, collateral or prepayment details">${escapeHtml(data.notes || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'} Loan</button>
      </div>
    </form>
  `);

  $('#liability-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      loanName: $('#loan-name').value.trim(),
      loanType: $('#loan-type').value,
      lender: $('#loan-lender').value.trim(),
      accountNumber: $('#loan-account-num').value.trim(),
      totalLoanAmount: parseFloat($('#loan-orig').value) || 0,
      currentOutstanding: parseFloat($('#loan-out').value) || 0,
      monthlyEmi: parseFloat($('#loan-emi').value) || 0,
      interestRate: parseFloat($('#loan-rate').value) || 0,
      tenureMonths: parseInt($('#loan-tenure').value) || 0,
      nextDueDate: $('#loan-due').value,
      notes: $('#loan-notes').value.trim()
    };

    try {
      if (isEdit) {
        await updateLiability(data.id, payload);
        showToast('Loan details updated!', 'success');
      } else {
        await createLiability(payload);
        showToast('Loan record added!', 'success');
      }
      closeModal();
      handleRoute();
      syncAllWithSupabase().catch(() => {});
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

async function showLiabilityRepaymentModal(loan) {
  const accounts = await getActiveAccounts();

  showModal(`
    <div class="modal-header">
      <h3>Record EMI Payment — ${escapeHtml(loan.loanName)}</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="loan-repay-form">
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-3);margin-bottom:var(--sp-4);">
        <div style="font-size:12px;display:flex;justify-content:space-between;">
          <span>Current Debt: <strong style="color:var(--red)">${formatCurrency(loan.currentOutstanding)}</strong></span>
          <span>Standard EMI: <strong>${formatCurrency(loan.monthlyEmi)}</strong></span>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Payment Amount (₹) *</label>
          <input type="number" id="lrp-amount" class="form-control" step="any" min="1" max="${loan.currentOutstanding}" value="${loan.monthlyEmi || loan.currentOutstanding}" required>
        </div>
        <div class="form-group">
          <label>Payment Date *</label>
          <input type="date" id="lrp-date" class="form-control" value="${todayISO()}" required>
        </div>
      </div>
      <div class="form-group">
        <label>Paid From Bank / Account *</label>
        <select id="lrp-account" class="form-control" required>
          ${accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Notes / Reference</label>
        <input type="text" id="lrp-notes" class="form-control" placeholder="EMI installment or partial prepayment">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">Confirm EMI Payment</button>
      </div>
    </form>
  `);

  $('#loan-repay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat($('#lrp-amount').value) || 0;
    const date = $('#lrp-date').value;
    const accountId = parseInt($('#lrp-account').value) || null;
    const notes = $('#lrp-notes').value.trim();

    try {
      await recordLiabilityRepayment(loan.id, { amount, date, accountId, notes });
      showToast(`EMI payment of ${formatCurrency(amount)} recorded!`, 'success');
      closeModal();
      handleRoute();
      syncAllWithSupabase().catch(() => {});
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ── INSURANCE MANAGER VIEW ────────────────────────────────────────────

async function renderInsurance(container) {
  const policies = await getInsurancePolicies();
  const totalCover = policies.reduce((acc, p) => acc + (p.sumInsured || 0), 0);
  const totalAnnualPremium = policies.reduce((acc, p) => {
    const mult = p.paymentFrequency === 'monthly' ? 12 : p.paymentFrequency === 'quarterly' ? 4 : 1;
    return acc + ((p.premiumAmount || 0) * mult);
  }, 0);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const monthLater = new Date(now);
  monthLater.setDate(now.getDate() + 30);
  const monthLaterStr = monthLater.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <h1>Insurance Policies</h1>
      <p>Health, Term Life, Motor, and Accident coverage shields</p>
    </div>

    <!-- Sub-navigation Pills -->
    <div class="subnav-pills">
      <a href="#/accounts" class="subnav-pill">💵 Liquid Accounts</a>
      <a href="#/investments" class="subnav-pill">📈 Investments</a>
      <a href="#/lending" class="subnav-pill">🤝 Lend & Borrow</a>
      <a href="#/liabilities" class="subnav-pill">🏛️ Liabilities & Loans</a>
      <a href="#/insurance" class="subnav-pill active">🛡️ Insurance</a>
    </div>

    <!-- KPI Summary Bar -->
    <div class="stats-grid" style="margin-bottom:var(--sp-5);">
      <div class="stat-card income">
        <div class="stat-label">Total Sum Insured (Cover)</div>
        <div class="stat-value" style="color:var(--green)">${formatCurrency(totalCover)}</div>
        <div class="stat-sub">Across ${policies.length} policies</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Annual Premiums</div>
        <div class="stat-value">${formatCurrency(totalAnnualPremium)}</div>
        <div class="stat-sub">Protection investment per year</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Policies</div>
        <div class="stat-value">${policies.filter(p => p.status === 'active').length}</div>
        <div class="stat-sub">IRDAI compliant</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-bottom:var(--sp-4);">
      <button class="btn btn-primary" id="btn-add-policy">+ Add Insurance Policy</button>
    </div>

    <!-- Policies Grid -->
    <div class="financial-cards-grid">
      ${policies.map(policy => {
        const isRenewalSoon = policy.nextRenewalDate && policy.nextRenewalDate <= monthLaterStr && policy.nextRenewalDate >= todayStr;
        const isOverdue = policy.nextRenewalDate && policy.nextRenewalDate < todayStr;
        const statusClass = isOverdue ? 'overdue' : isRenewalSoon ? 'due-soon' : 'active';
        const statusLabel = isOverdue ? 'Renewal Overdue' : isRenewalSoon ? 'Renewal Soon' : 'Active';

        return `
          <div class="financial-card">
            <div class="f-card-header">
              <div>
                <div class="f-card-title">${escapeHtml(policy.policyName)}</div>
                <div class="f-card-subtitle">${escapeHtml(policy.provider || 'Provider')} · ${escapeHtml(policy.policyType).toUpperCase()}</div>
              </div>
              <span class="badge-status ${statusClass}">${statusLabel}</span>
            </div>

            <div class="f-card-amount-block">
              <div>
                <div class="f-card-amount-label">Sum Insured (Cover)</div>
                <div class="f-card-amount-val" style="color:var(--green)">${formatCurrency(policy.sumInsured)}</div>
              </div>
              <div style="text-align:right;">
                <div class="f-card-amount-label">Premium (${policy.paymentFrequency})</div>
                <div style="font-size:var(--fs-base);font-weight:700;color:var(--text-primary)">${formatCurrency(policy.premiumAmount)}</div>
              </div>
            </div>

            <div class="f-card-meta">
              <div class="f-card-meta-row">
                <span>Next Renewal Date:</span>
                <span style="font-weight:600;color:${isOverdue ? 'var(--red)' : isRenewalSoon ? 'var(--yellow)' : 'var(--text-primary)'}">
                  ${formatDate(policy.nextRenewalDate) || 'Not set'}
                </span>
              </div>
              <div class="f-card-meta-row">
                <span>Policy Number:</span>
                <span>${escapeHtml(policy.policyNumber || 'N/A')}</span>
              </div>
              <div class="f-card-meta-row">
                <span>Policyholder & Nominee:</span>
                <span>${escapeHtml(policy.policyholder || 'Self')}${policy.nominee ? ' (Nominee: ' + escapeHtml(policy.nominee) + ')' : ''}</span>
              </div>
              ${policy.notes ? `<div class="f-card-meta-row" style="font-style:italic;"><span>Emergency/TPA:</span><span>${escapeHtml(policy.notes)}</span></div>` : ''}
            </div>

            <div class="f-card-actions">
              <button class="btn btn-sm btn-secondary edit-policy-btn" data-policy-id="${policy.id}" style="flex:1;">✏️ Edit</button>
              <button class="btn btn-sm btn-ghost delete-policy-btn" data-policy-id="${policy.id}">🗑️</button>
            </div>
          </div>
        `;
      }).join('')}
      ${policies.length === 0 ? `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="emoji">🛡️</div>
          <h3>No insurance policies added</h3>
          <p>Safeguard your family and assets by tracking Health, Term Life, and Vehicle insurance policies and renewal dates.</p>
        </div>
      ` : ''}
    </div>
  `;

  $('#btn-add-policy')?.addEventListener('click', () => showInsuranceModal());

  $$('.edit-policy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.policyId);
      const policy = policies.find(p => p.id === id);
      if (policy) showInsuranceModal(policy);
    });
  });

  $$('.delete-policy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.policyId);
      if (confirm('Delete this insurance policy?')) {
        await deleteInsurancePolicy(id);
        showToast('Policy deleted.', 'info');
        handleRoute();
      }
    });
  });
}

// ── Insurance Modal ───────────────────────────────────────────────────
async function showInsuranceModal(data = {}) {
  const isEdit = !!data.id;

  showModal(`
    <div class="modal-header">
      <h3>${isEdit ? 'Edit' : 'New'} Insurance Policy</h3>
      <button class="modal-close">✕</button>
    </div>
    <form id="insurance-form">
      <div class="form-row">
        <div class="form-group">
          <label>Insurance Provider *</label>
          <input type="text" id="ins-provider" class="form-control" value="${escapeHtml(data.provider || '')}" required placeholder="e.g. HDFC ERGO, Star Health, LIC, ICICI Lombard">
        </div>
        <div class="form-group">
          <label>Policy Name *</label>
          <input type="text" id="ins-name" class="form-control" value="${escapeHtml(data.policyName || '')}" required placeholder="e.g. Optima Secure, Tech Term">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Policy Type</label>
          <select id="ins-type" class="form-control">
            <option value="health" ${data.policyType === 'health' ? 'selected' : ''}>Health Insurance</option>
            <option value="term" ${data.policyType === 'term' ? 'selected' : ''}>Term Life Insurance</option>
            <option value="vehicle" ${data.policyType === 'vehicle' ? 'selected' : ''}>Motor / Vehicle Insurance</option>
            <option value="accident" ${data.policyType === 'accident' ? 'selected' : ''}>Personal Accident</option>
            <option value="property" ${data.policyType === 'property' ? 'selected' : ''}>Property / Home Insurance</option>
            <option value="other" ${data.policyType === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Policy Number</label>
          <input type="text" id="ins-number" class="form-control" value="${escapeHtml(data.policyNumber || '')}" placeholder="e.g. POL-1092847">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Sum Insured (Cover ₹) *</label>
          <input type="number" id="ins-cover" class="form-control" step="any" min="0" value="${data.sumInsured || ''}" required placeholder="e.g. 1000000">
        </div>
        <div class="form-group">
          <label>Premium Amount (₹) *</label>
          <input type="number" id="ins-premium" class="form-control" step="any" min="0" value="${data.premiumAmount || ''}" required placeholder="e.g. 12500">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Payment Frequency</label>
          <select id="ins-freq" class="form-control">
            <option value="yearly" ${data.paymentFrequency === 'yearly' ? 'selected' : ''}>Yearly (Annual)</option>
            <option value="monthly" ${data.paymentFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="quarterly" ${data.paymentFrequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
          </select>
        </div>
        <div class="form-group">
          <label>Next Renewal Date *</label>
          <input type="date" id="ins-renewal" class="form-control" value="${data.nextRenewalDate || todayISO()}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Policyholder Name</label>
          <input type="text" id="ins-holder" class="form-control" value="${escapeHtml(data.policyholder || 'Self')}">
        </div>
        <div class="form-group">
          <label>Nominee</label>
          <input type="text" id="ins-nominee" class="form-control" value="${escapeHtml(data.nominee || '')}" placeholder="e.g. Spouse / Parents">
        </div>
      </div>
      <div class="form-group">
        <label>Emergency Notes / TPA Helpline</label>
        <textarea id="ins-notes" class="form-control" rows="2" placeholder="Cashless network hospitals, TPA contact, claims process">${escapeHtml(data.notes || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'} Policy</button>
      </div>
    </form>
  `);

  $('#insurance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      provider: $('#ins-provider').value.trim(),
      policyName: $('#ins-name').value.trim(),
      policyType: $('#ins-type').value,
      policyNumber: $('#ins-number').value.trim(),
      sumInsured: parseFloat($('#ins-cover').value) || 0,
      premiumAmount: parseFloat($('#ins-premium').value) || 0,
      paymentFrequency: $('#ins-freq').value,
      nextRenewalDate: $('#ins-renewal').value,
      policyholder: $('#ins-holder').value.trim(),
      nominee: $('#ins-nominee').value.trim(),
      notes: $('#ins-notes').value.trim()
    };

    try {
      if (isEdit) {
        await updateInsurancePolicy(data.id, payload);
        showToast('Policy updated!', 'success');
      } else {
        await createInsurancePolicy(payload);
        showToast('Policy added!', 'success');
      }
      closeModal();
      handleRoute();
      syncAllWithSupabase().catch(() => {});
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ── WEALTHBOOK KNOWLEDGE BASE VIEW ────────────────────────────────────

async function renderKnowledge(container) {
  let selectedCategory = 'all';

  container.innerHTML = `
    <div class="knowledge-container">
      <div class="knowledge-hero">
        <h2>👑 Wealthbook Knowledge Base</h2>
        <p>Essential financial education based on RBI, SEBI, AMFI, and IRDAI principles. Practical frameworks and action blueprints designed for Indian realities.</p>
      </div>

      <!-- Action Journeys Section -->
      <div class="journey-box">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="font-size:var(--fs-base);font-weight:700;">🚀 Guided Action Journeys</h3>
          <span style="font-size:11px;color:var(--accent);font-weight:700;">STEP-BY-STEP TRANSFORMATION</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:var(--sp-4);margin-top:var(--sp-4);">
          <!-- Journey 1: 7 Days -->
          <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-4);">
            <div style="font-size:var(--fs-sm);font-weight:700;margin-bottom:4px;">🚀 Your First 7 Days with Money</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:var(--sp-3);">Gain 100% clarity over your bank accounts, leaks, and cashflow in 7 simple daily steps.</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${LEARNING_JOURNEYS[0].steps.map(s => `
                <div style="font-size:12px;display:flex;align-items:flex-start;gap:6px;">
                  <span style="color:var(--accent);font-weight:700;">D${s.day}:</span>
                  <span><strong>${escapeHtml(s.title)}</strong> — ${escapeHtml(s.task)}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Journey 2: 30 Days -->
          <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-4);">
            <div style="font-size:var(--fs-sm);font-weight:700;margin-bottom:4px;">🏆 30 Days of Better Money Management</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:var(--sp-3);">A 4-week transformation blueprint to eliminate financial anxiety and automate wealth creation.</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${LEARNING_JOURNEYS[1].steps.map(s => `
                <div style="font-size:12px;display:flex;align-items:flex-start;gap:6px;">
                  <span style="color:var(--green);font-weight:700;">${s.week}:</span>
                  <div>
                    <strong>${escapeHtml(s.title)}</strong><br>
                    <span style="color:var(--text-secondary);font-size:11px;">${escapeHtml(s.description)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Category Filter Pills -->
      <div style="margin-bottom:var(--sp-4);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--sp-2);">
        <h3 style="font-size:var(--fs-base);font-weight:700;">📚 The 8 Core Financial Guides</h3>
        <div class="filter-presets" style="margin:0;">
          <button class="filter-preset-btn active" data-kcat="all">All</button>
          <button class="filter-preset-btn" data-kcat="Foundation">Foundation</button>
          <button class="filter-preset-btn" data-kcat="Budgeting">Budgeting</button>
          <button class="filter-preset-btn" data-kcat="Safety">Safety</button>
          <button class="filter-preset-btn" data-kcat="Debt Freedom">Debt</button>
          <button class="filter-preset-btn" data-kcat="Investing">Investing</button>
          <button class="filter-preset-btn" data-kcat="Protection">Insurance</button>
        </div>
      </div>

      <!-- Guides List -->
      <div id="guides-list"></div>
    </div>
  `;

  function renderGuidesList() {
    const listEl = $('#guides-list');
    const filtered = selectedCategory === 'all'
      ? KNOWLEDGE_GUIDES
      : KNOWLEDGE_GUIDES.filter(g => g.tag.toLowerCase() === selectedCategory.toLowerCase());

    listEl.innerHTML = filtered.map(guide => {
      // Basic markdown parser for headings and bullet points
      const bodyHtml = guide.content
        .replace(/### (.*?)\n/g, '<h3>$1</h3>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\* ([^\n]+)/g, '<li>$1</li>')
        .replace(/- \[ \] ([^\n]+)/g, '<li style="list-style:none;">⬜ $1</li>')
        .replace(/\n\n/g, '<br>');

      return `
        <div class="guide-article-card" id="card-${guide.id}">
          <button class="guide-header-btn" data-guide-toggle="${guide.id}">
            <div class="guide-title-wrap">
              <span class="guide-num">${guide.number}</span>
              <div>
                <div style="font-weight:700;font-size:var(--fs-base);color:var(--text-primary);display:flex;align-items:center;gap:6px;">
                  <span>${guide.icon}</span> ${escapeHtml(guide.title)}
                  <span class="badge-status active" style="font-size:9px;">${guide.tag}</span>
                </div>
                <div style="font-size:var(--fs-xs);color:var(--text-secondary);">${escapeHtml(guide.subtitle)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:var(--sp-3);">
              <span style="font-size:11px;color:var(--text-muted);">${guide.readTime}</span>
              <span class="guide-toggle-icon" style="font-size:14px;transition:transform 0.2s;">▼</span>
            </div>
          </button>
          <div class="guide-content-body" id="body-${guide.id}" style="display:none;">
            <p style="font-weight:600;color:var(--text-primary);margin-bottom:var(--sp-3);">${escapeHtml(guide.summary)}</p>
            <div>${bodyHtml}</div>
          </div>
        </div>
      `;
    }).join('');

    // Toggle expand handler
    $$('[data-guide-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.guideToggle;
        const body = $(`#body-${id}`);
        const card = $(`#card-${id}`);
        const icon = btn.querySelector('.guide-toggle-icon');

        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        card.classList.toggle('open', !isOpen);
        if (icon) icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      });
    });
  }

  $$('[data-kcat]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-kcat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = btn.dataset.kcat;
      renderGuidesList();
    });
  });

  renderGuidesList();
}

// ── SETTINGS VIEW ─────────────────────────────────────────────────────

async function renderSettings(container) {
  const theme = await getSetting('theme') || 'dark';
  const categories = await getCategories();
  const expCats = categories.filter(c => c.type === 'expense');
  const incCats = categories.filter(c => c.type === 'income');
  const currentUser = await getCurrentUser();
  const allUsers = await getUsers();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const sbConfig = await getSupabaseConfig();
  const lastSyncTime = await getSetting('last_cloud_sync_time');

  container.innerHTML = `
    <div class="page-header">
      <h1>Settings & Management</h1>
      <p>PraNick Wealth Agent · User management, Supabase sync, and customizations</p>
    </div>

    <!-- Supabase Cloud Synchronization & Multi-Device Sync -->
    <div class="section" style="background:linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(15, 15, 30, 0.8));border:1.5px solid rgba(16, 185, 129, 0.4);border-radius:var(--radius-lg);padding:var(--sp-4);">
      <div class="section-header" style="flex-wrap:wrap;gap:var(--sp-2);">
        <h2 style="color:#10b981;display:flex;align-items:center;gap:var(--sp-2);">
          <span>☁️</span> Supabase Cloud Sync (2+ Mobiles & Devices)
        </h2>
        <span id="supabase-live-status-badge" style="font-size:11px;padding:3px 8px;border-radius:12px;font-weight:700;background:rgba(255,255,255,0.1);color:var(--text-secondary);">
          ${sbConfig.isConfigured ? '🟢 Configured' : '⚪ Offline / Not Configured'}
        </span>
      </div>
      <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-3);">
        Connect your Supabase project to synchronize all accounts, transactions, investments, and users across any mobile or laptop automatically.
      </p>

      <form id="supabase-config-form" style="margin-bottom:var(--sp-3);">
        <div class="form-group" style="margin-bottom:var(--sp-2);">
          <label style="font-size:12px;">Supabase Project URL</label>
          <input type="url" id="sb-project-url" class="form-control" placeholder="https://your-project-id.supabase.co" value="${escapeHtml(sbConfig.url || '')}" required>
        </div>
        <div class="form-group" style="margin-bottom:var(--sp-3);">
          <label style="font-size:12px;">Supabase Anon / Public API Key</label>
          <input type="password" id="sb-anon-key" class="form-control" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${escapeHtml(sbConfig.key || '')}" required>
        </div>

        <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;align-items:center;">
          <button type="submit" class="btn btn-primary btn-sm" id="btn-save-supabase">💾 Save & Connect Supabase</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-sync-supabase-now" style="border-color:#10b981;color:#10b981;">🔄 Sync Devices Now</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-view-supabase-sql">📋 View Supabase SQL Setup</button>
        </div>
      </form>

      <div id="supabase-sync-msg" style="font-size:12px;color:var(--text-muted);">
        ${lastSyncTime ? `Last synced: ${new Date(lastSyncTime).toLocaleString()}` : 'Not synced yet. Enter your Supabase credentials above to start cross-device sync.'}
      </div>
    </div>

    ${isAdmin ? `
      <!-- Super Admin User Management & Inspection Panel -->
      <div class="section" style="background:linear-gradient(135deg, rgba(212,175,55,0.08), rgba(15,15,30,0.6));border:1.5px solid rgba(212,175,55,0.4);border-radius:var(--radius-lg);padding:var(--sp-4);">
        <div class="section-header">
          <h2 style="color:var(--accent);">👑 Super Admin — Client & Family Users</h2>
          <button class="btn btn-sm btn-primary" id="admin-add-user-btn">+ Add User</button>
        </div>
        <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-3);">
          As Super Admin, you can click on any user below to inspect their live dashboard, accounts, and transactions in Auditor Mode.
        </p>
        <div style="display:flex;flex-direction:column;gap:var(--sp-2-5);">
          ${allUsers.map(u => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--sp-3);background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);flex-wrap:wrap;gap:var(--sp-2);">
              <div style="display:flex;align-items:center;gap:var(--sp-3);min-width:0;flex:1 1 180px;">
                <div style="font-size:1.6rem;flex-shrink:0;">${u.avatar || (u.role === 'admin' ? '👑' : '👸')}</div>
                <div style="min-width:0;">
                  <div style="font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.name)} (${escapeHtml(u.username)})</div>
                  <div style="font-size:11px;color:var(--text-muted);">${u.email || u.phone || 'No contact'} · PIN: ${u.pin} · Role: ${u.role}</div>
                </div>
              </div>
              <div style="display:flex;gap:var(--sp-2);align-items:center;flex-shrink:0;">
                ${u.id === currentUser.id 
                  ? '<span style="font-size:11px;background:rgba(212,175,55,0.2);color:var(--accent);padding:4px 8px;border-radius:12px;font-weight:600;">YOU (ADMIN)</span>'
                  : `<button class="btn btn-sm btn-primary admin-settings-inspect-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}">🔍 Inspect Dashboard ➔</button>
                     ${(u.role !== 'admin' && u.id !== 1) ? `<button class="btn btn-sm btn-danger admin-settings-delete-user-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="Delete user" style="padding:4px 8px;font-size:11px;">🗑️</button>` : ''}`
                }
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Quick Access Modules (Mobile & Desktop) -->
    <div class="section">
      <div class="section-header"><h2>Wealth Management Modules</h2></div>
      <div class="modules-grid">
        <a href="#/knowledge" class="module-link-card">
          <span class="module-card-icon">📚</span>
          <span class="module-card-title">Knowledge Base & Vastu</span>
        </a>
        <a href="#/lending" class="module-link-card">
          <span class="module-card-icon">🤝</span>
          <span class="module-card-title">Lending & Borrowing Ledger</span>
        </a>
        <a href="#/liabilities" class="module-link-card">
          <span class="module-card-icon">🏛️</span>
          <span class="module-card-title">Liabilities & Loans (EMI)</span>
        </a>
        <a href="#/insurance" class="module-link-card">
          <span class="module-card-icon">🛡️</span>
          <span class="module-card-title">Insurance Policies</span>
        </a>
      </div>
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
  $('#settings-theme')?.addEventListener('change', async (e) => {
    const theme = e.target.value;
    document.documentElement.setAttribute('data-theme', theme);
    await setSetting('theme', theme);
    showToast(`Theme changed to ${theme}`, 'success');
  });

  // Admin user management handlers
  $('#admin-add-user-btn')?.addEventListener('click', () => {
    showUserSwitchModal();
    setTimeout(() => {
      $('#auth-tab-create')?.click();
    }, 100);
  });

  // Admin Delete User in Settings
  $$('.admin-settings-delete-user-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = parseInt(btn.getAttribute('data-id'));
      const targetName = btn.getAttribute('data-name');
      if (!confirm(`Are you sure you want to permanently delete user "${targetName}" and all associated financial data?`)) {
        return;
      }
      try {
        await deleteUser(targetId);
        showToast(`User ${targetName} deleted`, 'success');
        renderSettings(container);
      } catch (err) {
        alert('Failed to delete user: ' + err.message);
      }
    });
  });

  // Supabase Configuration Form
  $('#supabase-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('#sb-project-url').value.trim();
    const key = $('#sb-anon-key').value.trim();

    try {
      await saveSupabaseConfig(url, key);
      showToast('Connecting to Supabase...', 'info');
      const test = await testSupabaseConnection();
      if (test.success) {
        showToast('🟢 Supabase Connected! Starting initial sync...', 'success');
        $('#supabase-live-status-badge').textContent = '🟢 Connected';
        $('#supabase-live-status-badge').style.color = '#10b981';
        const syncResult = await syncAllWithSupabase();
        if (syncResult.success) {
          showToast('✅ All devices synced with Supabase!', 'success');
          renderSettings(container);
        } else {
          showToast(syncResult.message, 'warning');
        }
      } else {
        alert('Could not connect to Supabase: ' + test.message);
        $('#supabase-live-status-badge').textContent = '❌ Connection Error';
        $('#supabase-live-status-badge').style.color = 'var(--red)';
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Supabase Sync Now Button
  $('#btn-sync-supabase-now')?.addEventListener('click', async () => {
    showToast('🔄 Synchronizing all data with Supabase Cloud...', 'info');
    try {
      const syncResult = await syncAllWithSupabase();
      if (syncResult.success) {
        showToast('✅ Cloud Sync Complete! All mobile & laptop data updated.', 'success');
        renderSettings(container);
      } else {
        alert('Sync Notice: ' + syncResult.message);
      }
    } catch (err) {
      alert('Sync Failed: ' + err.message);
    }
  });

  // Supabase SQL Setup Script Modal
  $('#btn-view-supabase-sql')?.addEventListener('click', () => {
    const sql = getSupabaseSetupSQL();
    showModal(`
      <div class="modal-header">
        <h3>📋 Supabase Cloud SQL Setup Script</h3>
        <button class="modal-close">✕</button>
      </div>
      <div style="padding:var(--sp-2) 0;">
        <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-2);">
          Copy and run this SQL once inside your <strong>Supabase Dashboard ➔ SQL Editor</strong> to enable instant cross-device sync for all family devices:
        </p>
        <textarea id="sb-sql-textarea" class="form-control" style="font-family:monospace;font-size:11px;height:240px;" readonly>${escapeHtml(sql)}</textarea>
        <div style="margin-top:var(--sp-3);display:flex;justify-content:flex-end;gap:var(--sp-2);">
          <button type="button" class="btn btn-secondary modal-close">Close</button>
          <button type="button" class="btn btn-primary" id="btn-copy-sb-sql">📋 Copy SQL to Clipboard</button>
        </div>
      </div>
    `);

    $('#btn-copy-sb-sql')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(sql);
        showToast('SQL script copied to clipboard!', 'success');
      } catch (e) {
        $('#sb-sql-textarea').select();
        document.execCommand('copy');
        showToast('SQL script copied!', 'success');
      }
    });
  });

  // Check live connection on settings view open
  testSupabaseConnection().then(test => {
    const badge = $('#supabase-live-status-badge');
    if (badge) {
      if (test.success) {
        badge.textContent = '🟢 Connected';
        badge.style.color = '#10b981';
      } else if (sbConfig.isConfigured) {
        badge.textContent = '⚠️ Check Credentials';
        badge.style.color = '#f59e0b';
      } else {
        badge.textContent = '⚪ Offline / Unconfigured';
      }
    }
  }).catch(() => {});

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
      syncAllWithSupabase().catch(() => {});
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ── Initialize App ────────────────────────────────────────────────────

async function init() {
  // Manifestation Screen logic (attached immediately so Enter button is responsive)
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
      sessionStorage.setItem('pam_nick_entered_engine', 'true');
    }
  }

  if (enterAppBtn) {
    enterAppBtn.addEventListener('click', closeManifestation);
  }

  if (profileTrigger) {
    profileTrigger.addEventListener('click', openManifestation);
  }

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

  // Update user display initially
  await updateUserDisplay();

  // User Switcher triggers
  $('#user-switcher-btn')?.addEventListener('click', () => showUserSwitchModal());
  $('#mobile-user-switch-btn')?.addEventListener('click', () => showUserSwitchModal());
  $('#mobile-profile-trigger')?.addEventListener('click', openManifestation);

  // Global Quick Add Floating Action Button (Attached immediately)
  const fab = $('#global-fab');
  if (fab) {
    fab.addEventListener('click', (e) => {
      e.preventDefault();
      showTransactionModal();
    });
  }

  // Admin Auditor exit button
  $('#admin-exit-view-btn')?.addEventListener('click', async () => {
    sessionStorage.removeItem('admin_viewing_user_id');
    setActiveUserId(2); // Nick (Super Admin)
    const adminUser = await getUserById(2);
    await updateUserDisplay(adminUser);
    showToast('Exited to Admin Command Panel', 'info');
    handleRoute();
  });

  // Automatic Supabase Cloud Sync on Launch
  getSupabaseConfig().then(cfg => {
    if (cfg.isConfigured) {
      syncAllWithSupabase().then(res => {
        if (res.success) {
          console.log('Background Supabase Sync complete');
          handleRoute();
        }
      }).catch(err => console.warn('Background Supabase sync notice:', err));
    }
  }).catch(() => {});

  // Automatic Cross-Device Sync on Window/Mobile Tab Focus and every 45 seconds
  window.addEventListener('focus', () => {
    syncAllWithSupabase().then(() => handleRoute()).catch(() => {});
  });
  setInterval(() => {
    syncAllWithSupabase().catch(() => {});
  }, 45000);

  // Route handler
  window.addEventListener('hashchange', handleRoute);
  try {
    await handleRoute();
  } catch (routeErr) {
    console.error('Initial route handling error:', routeErr);
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
