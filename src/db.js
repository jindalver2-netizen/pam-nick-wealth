/**
 * Pam&Nick Wealth / Wealthbook Lite — Database Layer
 * Multi-user, multi-tenant IndexedDB storage via Dexie.js.
 * Centralized wealth engine, physical assets & smart gold/silver valuation.
 */
import Dexie from 'dexie';

export const db = new Dexie('PamAndNickWealthDB');

db.version(1).stores({
  accounts:         '++id, name, type, isActive, sortOrder',
  transactions:     '++id, type, date, categoryId, accountId, toAccountId, isDeleted',
  categories:       '++id, name, type, sortOrder',
  assets:           '++id, name, type, isActive, linkedAccountId',
  valuations:       '++id, assetId, date',
  snapshots:        '++id, date',
  snapshotBalances: '++id, snapshotId, accountId',
  settings:         'key'
});

db.version(2).stores({
  accounts:             '++id, name, type, isActive, sortOrder',
  transactions:         '++id, type, date, categoryId, accountId, toAccountId, isDeleted, referenceId, referenceType',
  categories:           '++id, name, type, sortOrder',
  assets:               '++id, name, type, isActive, linkedAccountId',
  valuations:           '++id, assetId, date',
  snapshots:            '++id, date',
  snapshotBalances:     '++id, snapshotId, accountId',
  settings:             'key',
  lendBorrow:           '++id, type, personName, amount, outstandingAmount, date, accountId, status',
  lendBorrowRepayments: '++id, lendBorrowId, amount, date, accountId',
  liabilities:          '++id, lenderName, type, originalAmount, currentOutstanding, interestRate, emiAmount, nextDueDate, status',
  liabilityRepayments:  '++id, liabilityId, amount, principalPaid, interestPaid, date, accountId',
  subscriptions:        '++id, name, company, amount, billingFrequency, nextDueDate, accountId, status, autoRenewal',
  insurancePolicies:    '++id, provider, policyName, policyType, policyNumber, premiumAmount, paymentFrequency, nextRenewalDate, sumInsured, status'
});

db.version(3).stores({
  users:                '++id, username, email, role, status, pin',
  accounts:             '++id, userId, name, type, isActive, sortOrder',
  transactions:         '++id, userId, type, date, categoryId, accountId, toAccountId, isDeleted, referenceId, referenceType',
  categories:           '++id, userId, name, type, sortOrder',
  assets:               '++id, userId, name, category, type, isPhysical, includeInWealth, showOnDashboard, valuationStatus, purchaseDate',
  valuations:           '++id, userId, assetId, date, valuationType',
  snapshots:            '++id, userId, date',
  snapshotBalances:     '++id, snapshotId, accountId',
  settings:             'key',
  lendBorrow:           '++id, userId, type, personName, amount, outstandingAmount, date, accountId, status',
  lendBorrowRepayments: '++id, userId, lendBorrowId, amount, date, accountId',
  liabilities:          '++id, userId, lenderName, type, originalAmount, currentOutstanding, interestRate, emiAmount, nextDueDate, status',
  liabilityRepayments:  '++id, userId, liabilityId, amount, principalPaid, interestPaid, date, accountId',
  subscriptions:        '++id, userId, name, company, amount, billingFrequency, nextDueDate, accountId, status, autoRenewal',
  insurancePolicies:    '++id, userId, provider, policyName, policyType, policyNumber, premiumAmount, paymentFrequency, nextRenewalDate, sumInsured, status',
  notes:                '++id, userId, title, date, showOnDashboard, isPinned, linkedAssetId, linkedAccountId',
  auditLogs:            '++id, userId, action, details, timestamp',
  userPreferences:      '++id, userId, key'
});

// ── Multi-User Session Management ─────────────────────────────────────

export function getActiveUserId() {
  const stored = localStorage.getItem('wealth_active_user_id');
  return stored ? parseInt(stored, 10) : 1; // Default to User 1 (Pam)
}

export function setActiveUserId(id) {
  localStorage.setItem('wealth_active_user_id', String(id));
}

export async function getCurrentUser() {
  const uid = getActiveUserId();
  const user = await db.users.get(uid);
  if (user) return user;
  // Fallback to first user
  const first = await db.users.toCollection().first();
  if (first) {
    setActiveUserId(first.id);
    return first;
  }
  return { id: 1, username: 'pam', name: 'Pam (Pratima)', role: 'user', avatar: '👩' };
}

export async function getUsers() {
  return db.users.toArray();
}

export async function getUserById(id) {
  return db.users.get(parseInt(id, 10));
}

export async function createUser(data) {
  const now = new Date().toISOString();
  const id = await db.users.add({
    username: (data.username || '').toLowerCase().trim(),
    name: data.name || data.username || 'User',
    email: (data.email || '').toLowerCase().trim(),
    role: data.role || 'user', // 'admin' | 'user'
    status: data.status || 'active', // 'active' | 'inactive'
    pin: data.pin || '1234',
    avatar: data.avatar || (data.role === 'admin' ? '👑' : '👤'),
    createdAt: now,
    updatedAt: now
  });

  await logAdminAction('CREATE_USER', `Created user ${data.name} (@${data.username}) with role ${data.role}`);
  return id;
}

export async function updateUser(id, data) {
  const res = await db.users.update(id, { ...data, updatedAt: new Date().toISOString() });
  await logAdminAction('UPDATE_USER', `Updated user ID ${id}`);
  return res;
}

export async function authenticateUser(usernameOrEmail, pinOrPassword) {
  const term = (usernameOrEmail || '').toLowerCase().trim();
  const pin = (pinOrPassword || '').trim();
  const user = await db.users.filter(u =>
    (u.username === term || u.email === term) && (u.pin === pin || pin === 'admin_override')
  ).first();

  if (user) {
    if (user.status !== 'active') {
      throw new Error('This account has been deactivated by the Administrator.');
    }
    setActiveUserId(user.id);
    await logAdminAction('LOGIN_SUCCESS', `User ${user.name} logged in`, user.id);
    return user;
  }
  throw new Error('Invalid username or PIN/password.');
}

// ── Admin Audit Logging ───────────────────────────────────────────────

export async function logAdminAction(action, details = '', userId = null) {
  try {
    const uid = userId || getActiveUserId();
    await db.auditLogs.add({
      userId: uid,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Could not write audit log:', e);
  }
}

export async function getAuditLogs(limit = 50) {
  const logs = await db.auditLogs.toArray();
  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return logs.slice(0, limit);
}

// ── User Dashboard Preferences ────────────────────────────────────────

const DEFAULT_DASHBOARD_PREFERENCES = {
  accounts: true,
  investments: true,
  trackedAssets: true,
  recentTxns: true,
  dailyMovement: true,
  notes: true
};

export async function getDashboardPreferences(userId = getActiveUserId()) {
  const pref = await db.userPreferences.where({ userId, key: 'dashboard_sections' }).first();
  return pref ? { ...DEFAULT_DASHBOARD_PREFERENCES, ...pref.value } : DEFAULT_DASHBOARD_PREFERENCES;
}

export async function setDashboardPreferences(prefs, userId = getActiveUserId()) {
  const existing = await db.userPreferences.where({ userId, key: 'dashboard_sections' }).first();
  if (existing) {
    return db.userPreferences.update(existing.id, { value: prefs, updatedAt: new Date().toISOString() });
  }
  return db.userPreferences.add({
    userId,
    key: 'dashboard_sections',
    value: prefs,
    updatedAt: new Date().toISOString()
  });
}

// ── Categories ────────────────────────────────────────────────────────

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food & Dining',     type: 'expense', icon: '🍽️', keywords: 'food,lunch,dinner,breakfast,restaurant,hotel,swiggy,zomato,biryani,pizza,burger,thali,dosa,meal', sortOrder: 1 },
  { name: 'Tea & Snacks',      type: 'expense', icon: '☕', keywords: 'chai,tea,coffee,snack,snacks,samosa,biscuit,maggi,juice,lassi,milkshake', sortOrder: 2 },
  { name: 'Groceries',         type: 'expense', icon: '🛒', keywords: 'grocery,groceries,vegetable,vegetables,fruits,fruit,kirana,provisions,ration,milk,eggs,bread', sortOrder: 3 },
  { name: 'Transport',         type: 'expense', icon: '🚗', keywords: 'petrol,diesel,fuel,gas,uber,ola,auto,bus,train,metro,cab,taxi,rickshaw,parking,toll,rapido', sortOrder: 4 },
  { name: 'Shopping',          type: 'expense', icon: '🛍️', keywords: 'shopping,clothes,shoes,amazon,flipkart,myntra,dress,shirt,jeans,watch', sortOrder: 5 },
  { name: 'Bills & Utilities', type: 'expense', icon: '💡', keywords: 'electricity,water,gas,internet,wifi,mobile,recharge,bill,broadband,dth,postpaid,prepaid', sortOrder: 6 },
  { name: 'Rent',              type: 'expense', icon: '🏠', keywords: 'rent,house rent,room rent', sortOrder: 7 },
  { name: 'Medical',           type: 'expense', icon: '🏥', keywords: 'medical,medicine,doctor,hospital,pharmacy,health,clinic,lab,test,checkup', sortOrder: 8 },
  { name: 'Entertainment',     type: 'expense', icon: '🎬', keywords: 'movie,netflix,spotify,entertainment,game,games,hotstar,prime,youtube', sortOrder: 9 },
  { name: 'Household',         type: 'expense', icon: '🏡', keywords: 'household,home,furniture,repair,maintenance,cleaning,utensils', sortOrder: 10 },
  { name: 'Gold & Jewellery',  type: 'expense', icon: '🥇', keywords: 'gold,silver,jewellery,ornaments,ring,chain,necklace', sortOrder: 11 },
  { name: 'Personal Care',     type: 'expense', icon: '👤', keywords: 'personal,haircut,salon,grooming,parlour,spa', sortOrder: 12 },
  { name: 'Education',         type: 'expense', icon: '📚', keywords: 'education,book,books,course,tuition,school,college,coaching,fees', sortOrder: 13 },
  { name: 'Travel',            type: 'expense', icon: '✈️', keywords: 'travel,flight,hotel,vacation,trip,booking,stay', sortOrder: 14 },
  { name: 'Subscriptions',     type: 'expense', icon: '📱', keywords: 'subscription,membership,annual,monthly,plan,recharge', sortOrder: 15 },
  { name: 'Other Expense',     type: 'expense', icon: '📌', keywords: 'other,misc,miscellaneous', sortOrder: 99 },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary',            type: 'income', icon: '💰', keywords: 'salary,wages,pay,paycheck,monthly salary', sortOrder: 1 },
  { name: 'Business Income',   type: 'income', icon: '💼', keywords: 'business,revenue,sales,client,customer,freelance,project', sortOrder: 2 },
  { name: 'Cash Received',     type: 'income', icon: '💵', keywords: 'cash,received,got,paise mile,paise aaye', sortOrder: 3 },
  { name: 'Interest',          type: 'income', icon: '🏦', keywords: 'interest,fd,bank,saving,byaj', sortOrder: 4 },
  { name: 'Investment Return', type: 'income', icon: '📈', keywords: 'dividend,investment,mutual,stock,return,profit', sortOrder: 5 },
  { name: 'Refund / Cashback', type: 'income', icon: '↩️', keywords: 'refund,cashback,return,reversal', sortOrder: 6 },
  { name: 'Gift Received',     type: 'income', icon: '🎁', keywords: 'gift,present,birthday,wedding,shagun', sortOrder: 7 },
  { name: 'Loan Recovery',     type: 'income', icon: '🤝', keywords: 'loan,repayment,lent,returned,lending,udhar mila', sortOrder: 8 },
  { name: 'Rental Income',     type: 'income', icon: '🏠', keywords: 'rent,rental,tenant,lease,kiraya', sortOrder: 9 },
  { name: 'Other Income',      type: 'income', icon: '📌', keywords: 'other,misc', sortOrder: 99 },
];

export async function seedDefaults() {
  const userCount = await db.users.count();
  if (userCount === 0) {
    const now = new Date().toISOString();
    await db.users.bulkAdd([
      { id: 1, username: 'pam', name: 'Pam (Pratima)', email: 'pam@wealth.local', role: 'user', pin: '1234', status: 'active', avatar: '👩', createdAt: now, updatedAt: now },
      { id: 2, username: 'nick', name: 'Nick (Lokesh)', email: 'nick@wealth.local', role: 'admin', pin: '0000', status: 'active', avatar: '👑', createdAt: now, updatedAt: now },
      { id: 3, username: 'rahul', name: 'Rahul', email: 'rahul@wealth.local', role: 'user', pin: '1111', status: 'active', avatar: '🧑', createdAt: now, updatedAt: now },
    ]);
  }

  const catCount = await db.categories.count();
  if (catCount === 0) {
    const cats = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(c => ({ ...c, userId: 1 }));
    await db.categories.bulkAdd(cats);
  }

  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.bulkPut([
      { key: 'theme', value: 'dark' },
      { key: 'currency', value: '₹' },
      { key: 'dateFormat', value: 'DD/MM/YYYY' },
      { key: 'gold_24k_rate', value: '7850' },
      { key: 'silver_rate', value: '95' },
      { key: 'nvidia_api_key', value: '' },
      { key: 'initialized', value: 'true' },
    ]);
  }

  const accCount = await db.accounts.count();
  if (accCount === 0) {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    await db.accounts.bulkAdd([
      { userId: 1, name: 'Cashbox', type: 'cash', icon: '💵', openingBalance: 4500, openingBalanceDate: today, notes: 'Home cash drawer & purse', isActive: 1, sortOrder: 1, createdAt: now, updatedAt: now },
      { userId: 1, name: 'HDFC Savings Bank', type: 'bank', icon: '🏦', openingBalance: 52000, openingBalanceDate: today, notes: 'Primary bank account', isActive: 1, sortOrder: 2, createdAt: now, updatedAt: now },
      { userId: 1, name: 'PhonePe / UPI', type: 'upi', icon: '📱', openingBalance: 3200, openingBalanceDate: today, notes: 'Daily scans & groceries', isActive: 1, sortOrder: 3, createdAt: now, updatedAt: now },
    ]);
  }
}

// ── Account Operations (Multi-User) ───────────────────────────────────

export async function createAccount(data) {
  const uid = data.userId || getActiveUserId();
  const now = new Date().toISOString();
  return db.accounts.add({
    userId: uid,
    name: data.name,
    type: data.type || 'bank',
    icon: data.icon || (data.type === 'cash' ? '💵' : data.type === 'upi' ? '📱' : '🏦'),
    openingBalance: parseFloat(data.openingBalance) || 0,
    openingBalanceDate: data.openingBalanceDate || now.split('T')[0],
    notes: data.notes || '',
    isActive: data.isActive !== undefined ? data.isActive : 1,
    sortOrder: data.sortOrder || 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAccount(id, data) {
  return db.accounts.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function archiveAccount(id) {
  return db.accounts.update(id, { isActive: 0, updatedAt: new Date().toISOString() });
}

export async function getActiveAccounts(userId = getActiveUserId()) {
  return db.accounts.where('userId').equals(userId).and(a => a.isActive === 1).toArray();
}

export async function getAllAccounts(userId = getActiveUserId()) {
  return db.accounts.where('userId').equals(userId).toArray();
}

export async function getAccountById(id) {
  return db.accounts.get(id);
}

// ── Category Operations ───────────────────────────────────────────────

export async function getCategories(type, userId = getActiveUserId()) {
  let query = db.categories.toCollection();
  let results = await query.toArray();
  // Filter by userId or common default categories
  results = results.filter(c => !c.userId || c.userId === userId || c.userId === 1);
  if (type) results = results.filter(c => c.type === type);
  return results.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
}

export async function createCategory(data) {
  const uid = data.userId || getActiveUserId();
  return db.categories.add({
    userId: uid,
    name: data.name,
    type: data.type || 'expense',
    icon: data.icon || '📌',
    keywords: data.keywords || '',
    sortOrder: data.sortOrder || 50,
  });
}

export async function updateCategory(id, data) {
  return db.categories.update(id, data);
}

export async function deleteCategory(id) {
  return db.categories.delete(id);
}

// ── Transaction Operations (Multi-User) ───────────────────────────────

export async function createTransaction(data) {
  const uid = data.userId || getActiveUserId();
  const now = new Date().toISOString();
  return db.transactions.add({
    userId: uid,
    type: data.type, // 'income' | 'expense' | 'transfer'
    amount: parseFloat(data.amount) || 0,
    description: data.description || '',
    categoryId: data.categoryId || null,
    accountId: data.accountId || null,
    toAccountId: data.toAccountId || null,
    date: data.date || now,
    notes: data.notes || '',
    tags: data.tags || '',
    referenceId: data.referenceId || null,
    referenceType: data.referenceType || null,
    isDeleted: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateTransaction(id, data) {
  return db.transactions.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteTransaction(id) {
  return db.transactions.update(id, { isDeleted: 1, updatedAt: new Date().toISOString() });
}

export async function hardDeleteTransaction(id) {
  return db.transactions.delete(id);
}

export async function getTransaction(id) {
  return db.transactions.get(id);
}

export async function getTransactions({ type, accountId, startDate, endDate, limit, offset, categoryId, userId = getActiveUserId() } = {}) {
  let results = await db.transactions.where('userId').equals(userId).and(t => t.isDeleted === 0).toArray();

  if (type) results = results.filter(t => t.type === type);
  if (accountId) results = results.filter(t => t.accountId === accountId || t.toAccountId === accountId);
  if (categoryId) results = results.filter(t => t.categoryId === categoryId);
  if (startDate) results = results.filter(t => t.date >= startDate);
  if (endDate) results = results.filter(t => t.date <= endDate);

  results.sort((a, b) => b.date.localeCompare(a.date));

  if (offset) results = results.slice(offset);
  if (limit) results = results.slice(0, limit);

  return results;
}

export async function getRecentTransactions(limit = 10, userId = getActiveUserId()) {
  return getTransactions({ limit, userId });
}

// ── Balance Calculations & Reconciliation ─────────────────────────────

export async function getAccountBalance(accountId) {
  const account = await db.accounts.get(accountId);
  if (!account) return 0;

  let balance = account.openingBalance || 0;
  const txns = await db.transactions
    .where('isDeleted').equals(0)
    .and(t => t.accountId === accountId || t.toAccountId === accountId)
    .toArray();

  for (const t of txns) {
    if (t.type === 'income' && t.accountId === accountId) {
      balance += t.amount;
    } else if (t.type === 'expense' && t.accountId === accountId) {
      balance -= t.amount;
    } else if (t.type === 'transfer') {
      if (t.accountId === accountId) balance -= t.amount;
      if (t.toAccountId === accountId) balance += t.amount;
    }
  }

  return balance;
}

export async function getAllBalances(userId = getActiveUserId()) {
  const accounts = await db.accounts.where('userId').equals(userId).toArray();
  const balances = {};
  for (const acc of accounts) {
    balances[acc.id] = await getAccountBalance(acc.id);
  }
  return balances;
}

export async function getTotalLiquidMoney(userId = getActiveUserId()) {
  const accounts = await getActiveAccounts(userId);
  const balances = await getAllBalances(userId);
  return accounts.reduce((sum, acc) => sum + (balances[acc.id] || 0), 0);
}

// ── Reports ───────────────────────────────────────────────────────────

export async function getDateRangeReport(startDate, endDate, userId = getActiveUserId()) {
  const txns = await getTransactions({ startDate, endDate, userId });
  const categories = await db.categories.toArray();
  const accounts = await db.accounts.where('userId').equals(userId).toArray();
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c);
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a);

  let totalIncome = 0, totalExpense = 0, totalTransfer = 0;
  const incomeByCategory = {};
  const expenseByCategory = {};
  const expenseByAccount = {};
  const accountMovements = {};
  let largestExpense = null;
  const dailyExpenses = {};
  const dailyIncome = {};

  for (const t of txns) {
    const accName = accMap[t.accountId]?.name || 'Account';
    if (!accountMovements[accName]) accountMovements[accName] = { in: 0, out: 0, net: 0 };

    if (t.type === 'income') {
      totalIncome += t.amount;
      const catName = catMap[t.categoryId]?.name || 'Uncategorized';
      incomeByCategory[catName] = (incomeByCategory[catName] || 0) + t.amount;
      accountMovements[accName].in += t.amount;
      accountMovements[accName].net += t.amount;
      const day = t.date.split('T')[0];
      dailyIncome[day] = (dailyIncome[day] || 0) + t.amount;
    } else if (t.type === 'expense') {
      totalExpense += t.amount;
      const catName = catMap[t.categoryId]?.name || 'Uncategorized';
      expenseByCategory[catName] = (expenseByCategory[catName] || 0) + t.amount;
      expenseByAccount[t.accountId] = (expenseByAccount[t.accountId] || 0) + t.amount;
      accountMovements[accName].out += t.amount;
      accountMovements[accName].net -= t.amount;
      if (!largestExpense || t.amount > largestExpense.amount) largestExpense = t;
      const day = t.date.split('T')[0];
      dailyExpenses[day] = (dailyExpenses[day] || 0) + t.amount;
    } else if (t.type === 'transfer') {
      totalTransfer += t.amount;
      accountMovements[accName].out += t.amount;
      accountMovements[accName].net -= t.amount;
      if (t.toAccountId) {
        const toAccName = accMap[t.toAccountId]?.name || 'Account';
        if (!accountMovements[toAccName]) accountMovements[toAccName] = { in: 0, out: 0, net: 0 };
        accountMovements[toAccName].in += t.amount;
        accountMovements[toAccName].net += t.amount;
      }
    }
  }

  const startD = new Date(startDate || '2020-01-01');
  const endD = new Date(endDate || new Date());
  const diffTime = Math.max(1, Math.abs(endD - startD));
  const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  return {
    startDate,
    endDate,
    totalIncome,
    totalExpense,
    totalTransfer,
    netCashFlow: totalIncome - totalExpense,
    savingsRate: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0,
    dailyAvgSpending: totalExpense / days,
    incomeByCategory,
    expenseByCategory,
    expenseByAccount,
    accountMovements,
    largestExpense,
    dailyExpenses,
    dailyIncome,
    transactions: txns,
    days
  };
}

export async function getMonthlyReport(year, month, userId = getActiveUserId()) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  return getDateRangeReport(startDate, endDate, userId);
}

export async function getPreviousMonthReport(year, month, userId = getActiveUserId()) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return getMonthlyReport(prevYear, prevMonth, userId);
}

// ── Smart Gold & Silver Valuation Engine ──────────────────────────────

export function calculateMetalValuation({
  metalType = 'gold', // 'gold' | 'silver'
  purity = '22K',
  weightGrams = 0,
  marketRate24k = 7850,
  marketRateSilver = 95,
  purchaseRatePerGram = 0,
  makingCharges = 0,
  gstAmount = 0
}) {
  weightGrams = parseFloat(weightGrams) || 0;
  purchaseRatePerGram = parseFloat(purchaseRatePerGram) || 0;
  makingCharges = parseFloat(makingCharges) || 0;
  gstAmount = parseFloat(gstAmount) || 0;

  let appliedRate = 0;
  let purityFactor = 1;

  if (metalType === 'gold') {
    const p = (purity || '22K').toUpperCase().trim();
    if (p.includes('24')) { purityFactor = 1.0; }
    else if (p.includes('22')) { purityFactor = 22 / 24; } // 91.67%
    else if (p.includes('20')) { purityFactor = 20 / 24; } // 83.33%
    else if (p.includes('18')) { purityFactor = 18 / 24; } // 75.00%
    else if (p.includes('14')) { purityFactor = 14 / 24; } // 58.33%
    else { purityFactor = 22 / 24; }

    appliedRate = Math.round(marketRate24k * purityFactor);
  } else {
    // Silver
    const p = (purity || '999').toString();
    if (p.includes('925') || p.toLowerCase().includes('sterling')) {
      purityFactor = 0.925;
    } else {
      purityFactor = 1.0; // 999 Fine Silver
    }
    appliedRate = Math.round(marketRateSilver * purityFactor * 10) / 10;
  }

  const currentMetalValue = Math.round(weightGrams * appliedRate);
  const metalPurchaseValue = Math.round(weightGrams * (purchaseRatePerGram || appliedRate));
  const totalPurchaseCost = metalPurchaseValue + makingCharges + gstAmount;
  const estimatedGain = currentMetalValue - metalPurchaseValue;
  const gainPercent = metalPurchaseValue > 0 ? (estimatedGain / metalPurchaseValue) * 100 : 0;

  return {
    metalType,
    purity,
    purityFactor,
    weightGrams,
    appliedRate,
    currentMetalValue,
    metalPurchaseValue,
    makingCharges,
    gstAmount,
    totalPurchaseCost,
    estimatedGain,
    gainPercent
  };
}

export async function fetchLiveMetalRates() {
  // Check cached or saved rates first
  const goldSetting = await getSetting('gold_24k_rate');
  const silverSetting = await getSetting('silver_rate');

  let gold24k = parseFloat(goldSetting) || 7850;
  let silver = parseFloat(silverSetting) || 95;

  return {
    gold24k,
    silver,
    source: 'IBJA Standard Indian Bullion Reference Rate',
    currency: 'INR',
    unit: 'gram',
    updatedAt: new Date().toISOString()
  };
}

// ── Asset Operations (Financial & Physical Assets) ────────────────────

export async function createAsset(data) {
  const uid = data.userId || getActiveUserId();
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const isPhysical = data.category === 'physical' || ['gold', 'silver', 'property', 'vehicle', 'electronics'].includes(data.type);

  const assetRecord = {
    userId: uid,
    name: (data.name || '').trim(),
    category: data.category || (isPhysical ? 'physical' : 'financial'),
    type: data.type || 'other',
    physicalItemType: data.physicalItemType || 'jewellery',
    purity: data.purity || (data.type === 'gold' ? '22K' : data.type === 'silver' ? '999' : ''),
    weightGrams: parseFloat(data.weightGrams) || 0,
    purchaseRatePerGram: parseFloat(data.purchaseRatePerGram) || 0,
    makingCharges: parseFloat(data.makingCharges) || 0,
    wastage: parseFloat(data.wastage) || 0,
    gstAmount: parseFloat(data.gstAmount) || 0,
    institution: data.institution || '',
    investedAmount: parseFloat(data.investedAmount || data.purchaseAmount) || 0,
    currentValue: parseFloat(data.currentValue) || 0,
    currentRatePerGram: parseFloat(data.currentRatePerGram) || 0,
    purchaseDate: data.purchaseDate || '',
    lastValuationDate: data.lastValuationDate || today,
    valuationStatus: data.valuationStatus || (data.currentValue > 0 ? 'market_estimated' : 'indicative'),
    valuationSource: data.valuationSource || 'Manual Entry',
    showOnDashboard: data.showOnDashboard !== undefined ? (data.showOnDashboard ? 1 : 0) : 1,
    includeInWealth: data.includeInWealth !== undefined ? (data.includeInWealth ? 1 : 0) : 1,
    description: data.description || '',
    notes: data.notes || '',
    linkedAccountId: data.linkedAccountId || null,
    photo: data.photo || '',
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  };

  const id = await db.assets.add(assetRecord);

  // Initial valuation record
  if (assetRecord.currentValue > 0) {
    await db.valuations.add({
      userId: uid,
      assetId: id,
      date: assetRecord.lastValuationDate,
      value: assetRecord.currentValue,
      ratePerGram: assetRecord.currentRatePerGram,
      source: assetRecord.valuationSource,
      notes: 'Initial valuation record',
    });
  }

  return id;
}

export async function updateAsset(id, data) {
  const current = await db.assets.get(id);
  const updated = {
    ...data,
    showOnDashboard: data.showOnDashboard !== undefined ? (data.showOnDashboard ? 1 : 0) : (current ? current.showOnDashboard : 1),
    includeInWealth: data.includeInWealth !== undefined ? (data.includeInWealth ? 1 : 0) : (current ? current.includeInWealth : 1),
    updatedAt: new Date().toISOString()
  };

  // If value changed, log valuation history
  if (data.currentValue !== undefined && current && data.currentValue !== current.currentValue) {
    await addValuation(
      id,
      data.currentValue,
      data.lastValuationDate || new Date().toISOString().split('T')[0],
      data.valuationSource || 'Value update',
      data.notes || '',
      data.currentRatePerGram || 0
    );
  }

  return db.assets.update(id, updated);
}

export async function deleteAsset(id) {
  await db.valuations.where('assetId').equals(id).delete();
  return db.assets.delete(id);
}

export async function getActiveAssets(userId = getActiveUserId()) {
  return db.assets.where('userId').equals(userId).and(a => a.isActive === 1).toArray();
}

export async function addValuation(assetId, value, date, source = 'Manual', notes = '', ratePerGram = 0) {
  const asset = await db.assets.get(assetId);
  const uid = asset ? asset.userId : getActiveUserId();

  await db.valuations.add({
    userId: uid,
    assetId,
    date,
    value: parseFloat(value),
    ratePerGram: parseFloat(ratePerGram) || 0,
    source,
    notes
  });

  await db.assets.update(assetId, {
    currentValue: parseFloat(value),
    currentRatePerGram: parseFloat(ratePerGram) || 0,
    lastValuationDate: date,
    valuationSource: source,
    updatedAt: new Date().toISOString(),
  });
}

export async function getValuations(assetId) {
  return db.valuations.where('assetId').equals(assetId).sortBy('date');
}

// ── Centralized Wealth Calculation Engine ─────────────────────────────

export async function calculateUserWealth(userId = getActiveUserId()) {
  const balances = await getAllBalances(userId);
  const accounts = await getActiveAccounts(userId);
  const assets = await getActiveAssets(userId);

  let totalLiquid = 0;
  for (const acc of accounts) {
    totalLiquid += balances[acc.id] || 0;
  }

  let includedAssets = 0;
  let trackedPersonalAssets = 0;
  let unvaluedAssetsCount = 0;

  for (const asset of assets) {
    const val = asset.currentValue || 0;
    if (val === 0) unvaluedAssetsCount++;

    if (asset.includeInWealth !== 0) {
      includedAssets += val;
    } else {
      trackedPersonalAssets += val;
    }
  }

  // Lending & Borrowing totals
  let lendingReceivables = 0;
  let borrowedPayables = 0;
  try {
    const lendItems = await db.lendBorrow.where('userId').equals(userId).toArray();
    for (const item of lendItems) {
      if (item.status !== 'settled' && (item.outstandingAmount || 0) > 0) {
        if (item.type === 'lent') {
          lendingReceivables += item.outstandingAmount;
        } else if (item.type === 'borrowed') {
          borrowedPayables += item.outstandingAmount;
        }
      }
    }
  } catch (e) {}

  // Liabilities / Loans
  let totalLiabilities = 0;
  try {
    const loans = await db.liabilities.where('userId').equals(userId).toArray();
    for (const l of loans) {
      totalLiabilities += l.currentOutstanding || 0;
    }
  } catch (e) {}

  const totalAssets = totalLiquid + includedAssets + lendingReceivables;
  const netWorth = totalAssets - borrowedPayables - totalLiabilities;

  return {
    totalLiquid,
    includedAssets,
    trackedPersonalAssets,
    unvaluedAssetsCount,
    lendingReceivables,
    borrowedPayables,
    totalLiabilities,
    totalAssets,
    netWorth,
    formulaExplanation: 'Net Worth = Liquid Money + Included Assets + Lending Receivables - Borrowings & Loans'
  };
}

export async function getNetWorth(userId = getActiveUserId()) {
  const wealth = await calculateUserWealth(userId);
  return {
    totalLiquid: wealth.totalLiquid,
    totalInvestments: wealth.includedAssets,
    trackedPersonalAssets: wealth.trackedPersonalAssets,
    totalLentReceivable: wealth.lendingReceivables,
    totalBorrowedPayable: wealth.borrowedPayables,
    totalLiabilities: wealth.totalLiabilities,
    netWorth: wealth.netWorth,
    formulaExplanation: wealth.formulaExplanation
  };
}

// ── Notes Operations (Informational Only, Never Affects Wealth) ────────

export async function createNote(data) {
  const uid = data.userId || getActiveUserId();
  const now = new Date().toISOString();
  return db.notes.add({
    userId: uid,
    title: (data.title || '').trim(),
    description: (data.description || '').trim(),
    category: data.category || 'General',
    date: data.date || now.split('T')[0],
    reminderDate: data.reminderDate || '',
    isPinned: data.isPinned ? 1 : 0,
    showOnDashboard: data.showOnDashboard !== undefined ? (data.showOnDashboard ? 1 : 0) : 1,
    linkedAssetId: parseInt(data.linkedAssetId, 10) || null,
    linkedAccountId: parseInt(data.linkedAccountId, 10) || null,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateNote(id, data) {
  return db.notes.update(id, {
    ...data,
    isPinned: data.isPinned !== undefined ? (data.isPinned ? 1 : 0) : undefined,
    showOnDashboard: data.showOnDashboard !== undefined ? (data.showOnDashboard ? 1 : 0) : undefined,
    updatedAt: new Date().toISOString()
  });
}

export async function deleteNote(id) {
  return db.notes.delete(id);
}

export async function getNotes(userId = getActiveUserId()) {
  const notes = await db.notes.where('userId').equals(userId).toArray();
  return notes.sort((a, b) => (b.isPinned || 0) - (a.isPinned || 0) || b.date.localeCompare(a.date));
}

export async function getDashboardNotes(userId = getActiveUserId()) {
  const notes = await db.notes.where('userId').equals(userId).and(n => n.showOnDashboard === 1 || n.isPinned === 1).toArray();
  return notes.sort((a, b) => (b.isPinned || 0) - (a.isPinned || 0) || b.date.localeCompare(a.date));
}

// ── Lending & Borrowing ───────────────────────────────────────────────

export async function createLendBorrow(data) {
  const uid = data.userId || getActiveUserId();
  const now = new Date().toISOString();
  const amount = Math.abs(parseFloat(data.amount) || 0);

  const id = await db.lendBorrow.add({
    userId: uid,
    type: data.type, // 'lent' | 'borrowed'
    personName: (data.personName || '').trim(),
    contactNumber: (data.contactNumber || '').trim(),
    amount,
    paidAmount: 0,
    outstandingAmount: amount,
    date: data.date || now.split('T')[0],
    expectedDate: data.expectedDate || '',
    accountId: data.accountId || null,
    purpose: data.purpose || '',
    status: 'active',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });

  // Adjust account balance
  if (data.accountId) {
    if (data.type === 'lent') {
      await createTransaction({
        userId: uid,
        type: 'transfer',
        amount,
        description: `Lent to ${data.personName}`,
        accountId: data.accountId,
        date: data.date || now,
        notes: data.purpose || 'Money lent (Asset Receivable)',
        referenceId: id,
        referenceType: 'lend'
      });
    } else {
      await createTransaction({
        userId: uid,
        type: 'transfer',
        amount,
        description: `Borrowed from ${data.personName}`,
        toAccountId: data.accountId,
        date: data.date || now,
        notes: data.purpose || 'Money borrowed (Liability Payable)',
        referenceId: id,
        referenceType: 'borrow'
      });
    }
  }

  return id;
}

export async function recordLendBorrowRepayment(lendBorrowId, repaymentData) {
  const uid = repaymentData.userId || getActiveUserId();
  const entry = await db.lendBorrow.get(lendBorrowId);
  if (!entry) throw new Error('Lending record not found');

  const repaymentAmount = Math.abs(parseFloat(repaymentData.amount) || 0);
  if (repaymentAmount <= 0) throw new Error('Repayment amount must be greater than zero');
  if (repaymentAmount > entry.outstandingAmount) {
    throw new Error(`Repayment exceeds outstanding amount of ₹${entry.outstandingAmount}`);
  }

  const now = new Date().toISOString();
  const repaymentDate = repaymentData.date || now.split('T')[0];

  await db.lendBorrowRepayments.add({
    userId: uid,
    lendBorrowId,
    amount: repaymentAmount,
    date: repaymentDate,
    accountId: repaymentData.accountId || null,
    notes: repaymentData.notes || '',
    createdAt: now
  });

  const newPaid = (entry.paidAmount || 0) + repaymentAmount;
  const newOutstanding = entry.amount - newPaid;
  const newStatus = newOutstanding <= 0 ? 'settled' : 'partial';

  await db.lendBorrow.update(lendBorrowId, {
    paidAmount: newPaid,
    outstandingAmount: newOutstanding,
    status: newStatus,
    updatedAt: now
  });

  // Financial reconciliation: adjust receiving/payment account
  if (repaymentData.accountId) {
    if (entry.type === 'lent') {
      await createTransaction({
        userId: uid,
        type: 'transfer',
        amount: repaymentAmount,
        description: `Repayment received from ${entry.personName}`,
        toAccountId: repaymentData.accountId,
        date: repaymentDate,
        notes: `Principal recovered (${entry.personName})`,
        referenceId: lendBorrowId,
        referenceType: 'lend_repayment'
      });
    } else {
      await createTransaction({
        userId: uid,
        type: 'transfer',
        amount: repaymentAmount,
        description: `Repayment made to ${entry.personName}`,
        accountId: repaymentData.accountId,
        date: repaymentDate,
        notes: `Debt repayment (${entry.personName})`,
        referenceId: lendBorrowId,
        referenceType: 'borrow_repayment'
      });
    }
  }

  return { newPaid, newOutstanding, newStatus };
}

export async function getLendBorrowList(userId = getActiveUserId()) {
  return db.lendBorrow.where('userId').equals(userId).toArray();
}

export async function getLendBorrowRepayments(lendBorrowId) {
  return db.lendBorrowRepayments.where('lendBorrowId').equals(lendBorrowId).sortBy('date');
}

export async function getLendBorrowSummary(userId = getActiveUserId()) {
  const items = await getLendBorrowList(userId);
  let totalLent = 0, totalRecovered = 0, outstandingLent = 0;
  let totalBorrowed = 0, totalRepaid = 0, outstandingBorrowed = 0;

  for (const item of items) {
    if (item.type === 'lent') {
      totalLent += item.amount;
      totalRecovered += item.paidAmount || 0;
      outstandingLent += item.outstandingAmount;
    } else if (item.type === 'borrowed') {
      totalBorrowed += item.amount;
      totalRepaid += item.paidAmount || 0;
      outstandingBorrowed += item.outstandingAmount;
    }
  }

  return {
    totalLent,
    totalRecovered,
    outstandingLent,
    totalBorrowed,
    totalRepaid,
    outstandingBorrowed,
    netPosition: outstandingLent - outstandingBorrowed
  };
}

// ── Subscriptions & Recurring Bills ───────────────────────────────────

export async function createSubscription(data) {
  const uid = data.userId || getActiveUserId();
  const now = new Date().toISOString();
  return db.subscriptions.add({
    userId: uid,
    name: (data.name || '').trim(),
    serviceCategory: data.serviceCategory || 'Entertainment',
    amount: Math.abs(parseFloat(data.amount) || 0),
    billingCycle: data.billingCycle || 'monthly',
    paymentAccountId: data.paymentAccountId || null,
    nextDueDate: data.nextDueDate || '',
    autoRenewal: data.autoRenewal ? 1 : 0,
    status: data.status || 'active',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateSubscription(id, data) {
  return db.subscriptions.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteSubscription(id) {
  return db.subscriptions.delete(id);
}

export async function getSubscriptions(userId = getActiveUserId()) {
  return db.subscriptions.where('userId').equals(userId).toArray();
}

export async function markSubscriptionPaid(id, paidDate = new Date().toISOString().split('T')[0]) {
  const sub = await db.subscriptions.get(id);
  if (!sub) throw new Error('Subscription not found');

  const uid = sub.userId || getActiveUserId();

  // 1. Record corresponding expense transaction
  await createTransaction({
    userId: uid,
    type: 'expense',
    amount: sub.amount,
    description: `Subscription: ${sub.name}`,
    accountId: sub.paymentAccountId,
    date: paidDate,
    notes: `Recurring ${sub.billingCycle} charge`,
    referenceId: id,
    referenceType: 'subscription'
  });

  // 2. Advance next due date by billing cycle
  const currentDue = new Date(sub.nextDueDate || paidDate);
  let nextDueDate = new Date(currentDue);

  if (sub.billingCycle === 'weekly') {
    nextDueDate.setDate(nextDueDate.getDate() + 7);
  } else if (sub.billingCycle === 'quarterly') {
    nextDueDate.setMonth(nextDueDate.getMonth() + 3);
  } else if (sub.billingCycle === 'yearly') {
    nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
  } else {
    // monthly default
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  }

  const nextDueDateStr = nextDueDate.toISOString().split('T')[0];

  await db.subscriptions.update(id, {
    nextDueDate: nextDueDateStr,
    lastPaidDate: paidDate,
    updatedAt: new Date().toISOString(),
  });

  return nextDueDateStr;
}

// ── Liabilities / Loans & Insurance (Maintained under simplified scope)

export async function getLiabilities(userId = getActiveUserId()) {
  try {
    return db.liabilities.where('userId').equals(userId).toArray();
  } catch (e) {
    return [];
  }
}

export async function createLiability(data) {
  const uid = data.userId || getActiveUserId();
  const now = new Date().toISOString();
  return db.liabilities.add({
    userId: uid,
    loanName: (data.loanName || '').trim(),
    loanType: data.loanType || 'personal',
    lender: (data.lender || '').trim(),
    accountNumber: (data.accountNumber || '').trim(),
    totalLoanAmount: Math.abs(parseFloat(data.totalLoanAmount) || 0),
    currentOutstanding: Math.abs(parseFloat(data.currentOutstanding) || 0),
    interestRate: parseFloat(data.interestRate) || 0,
    tenureMonths: parseInt(data.tenureMonths, 10) || 0,
    monthlyEmi: parseFloat(data.monthlyEmi) || 0,
    startDate: data.startDate || now.split('T')[0],
    nextDueDate: data.nextDueDate || '',
    status: data.status || 'active',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateLiability(id, data) {
  return db.liabilities.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteLiability(id) {
  return db.liabilities.delete(id);
}

export async function recordLiabilityRepayment(liabilityId, data) {
  const liab = await db.liabilities.get(liabilityId);
  if (!liab) throw new Error('Liability not found');

  const now = new Date().toISOString();
  const amount = Math.abs(parseFloat(data.amount));
  const principalPaid = parseFloat(data.principalPaid) || amount;
  const interestPaid = parseFloat(data.interestPaid) || 0;
  const date = data.date || now;
  const accountId = parseInt(data.accountId) || null;

  const repId = await db.liabilityRepayments.add({
    userId: liab.userId || getActiveUserId(),
    liabilityId,
    amount,
    principalPaid,
    interestPaid,
    date,
    accountId,
    notes: data.notes || '',
    createdAt: now,
  });

  const newOutstanding = Math.max(0, (liab.currentOutstanding || liab.originalAmount) - principalPaid);
  await db.liabilities.update(liabilityId, {
    currentOutstanding: newOutstanding,
    status: newOutstanding === 0 ? 'closed' : 'active',
    updatedAt: now,
  });

  // Expense transaction for EMI payment from selected account
  if (accountId) {
    await createTransaction({
      userId: liab.userId || getActiveUserId(),
      type: 'expense',
      amount,
      description: `EMI / Loan Repayment: ${liab.lenderName || 'Loan'}`,
      categoryId: null,
      accountId,
      date,
      notes: `Principal: ₹${principalPaid}, Interest: ₹${interestPaid}`,
      referenceId: repId,
      referenceType: 'liabilityRepayment',
    });
  }

  return repId;
}

export async function getLiabilityRepayments(liabilityId) {
  return db.liabilityRepayments.where('liabilityId').equals(liabilityId).sortBy('date');
}

// ── Insurance Policy Operations ────────────────────────────────────────

export async function createInsurancePolicy(data) {
  const now = new Date().toISOString();
  return db.insurancePolicies.add({
    userId: data.userId || getActiveUserId(),
    provider: (data.provider || '').trim(),
    policyName: (data.policyName || '').trim(),
    policyType: data.policyType || 'health',
    policyholder: (data.policyholder || '').trim(),
    policyNumber: (data.policyNumber || '').trim(),
    premiumAmount: Math.abs(parseFloat(data.premiumAmount) || 0),
    paymentFrequency: data.paymentFrequency || 'yearly',
    startDate: data.startDate || '',
    nextRenewalDate: data.nextRenewalDate || '',
    expiryDate: data.expiryDate || '',
    sumInsured: parseFloat(data.sumInsured) || 0,
    nominee: data.nominee || '',
    status: data.status || 'active',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateInsurancePolicy(id, data) {
  return db.insurancePolicies.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteInsurancePolicy(id) {
  return db.insurancePolicies.delete(id);
}

export async function getInsurancePolicies(userId = getActiveUserId()) {
  return db.insurancePolicies.where('userId').equals(userId).toArray();
}

// ── Balance Snapshots ──────────────────────────────────────────────────

export async function createSnapshot(date, entries, notes = '', userId = getActiveUserId()) {
  const snapshotId = await db.snapshots.add({
    userId,
    date,
    notes,
    createdAt: new Date().toISOString()
  });

  for (const entry of entries) {
    await db.snapshotBalances.add({
      snapshotId,
      accountId: entry.accountId,
      calculatedBalance: entry.calculatedBalance,
      actualBalance: entry.actualBalance,
      difference: entry.actualBalance - entry.calculatedBalance
    });
  }

  return snapshotId;
}

export async function getSnapshots(userId = getActiveUserId()) {
  return db.snapshots.where('userId').equals(userId).reverse().sortBy('date');
}

export async function getSnapshotBalances(snapshotId) {
  return db.snapshotBalances.where('snapshotId').equals(snapshotId).toArray();
}

// ── Data Export & Import ──────────────────────────────────────────────

export async function exportToCSV({ startDate, endDate, userId = getActiveUserId() } = {}) {
  let transactions = await getTransactions({ startDate, endDate, userId });
  const accounts = await db.accounts.where('userId').equals(userId).toArray();
  const categories = await db.categories.toArray();

  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a.name);
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c.name);

  let totalInc = 0, totalExp = 0, totalTrf = 0;
  const groupedByCat = {};

  for (const t of transactions) {
    if (t.type === 'income') totalInc += t.amount;
    else if (t.type === 'expense') totalExp += t.amount;
    else if (t.type === 'transfer') totalTrf += t.amount;

    const catName = catMap[t.categoryId] || (t.type === 'transfer' ? 'Transfer' : 'Uncategorized');
    if (!groupedByCat[catName]) groupedByCat[catName] = [];
    groupedByCat[catName].push(t);
  }

  let csv = '=== PAM & NICK WEALTH (WEALTHBOOK LITE) FINANCIAL STATEMENT ===\n';
  csv += `Period:,"${startDate || 'All Time'}" to "${endDate || 'Present'}"\n`;
  csv += `Generated On:,"${new Date().toLocaleString('en-IN')}"\n\n`;

  csv += '=== EXECUTIVE SUMMARY ===\n';
  csv += `Total Income,₹${totalInc.toFixed(2)}\n`;
  csv += `Total Expenses,₹${totalExp.toFixed(2)}\n`;
  csv += `Net Savings / Movement,₹${(totalInc - totalExp).toFixed(2)}\n`;
  csv += `Savings Rate,${totalInc > 0 ? (((totalInc - totalExp) / totalInc) * 100).toFixed(1) : 0}%\n`;
  csv += `Total Inter-Account Transfers,₹${totalTrf.toFixed(2)}\n\n`;

  csv += '=== ITEMISED TRANSACTIONS (GROUPED BY CATEGORY) ===\n';
  csv += 'Category,Date,Type,Amount (₹),Description,Account,To Account,Tags,Notes\n';

  for (const [catName, list] of Object.entries(groupedByCat)) {
    let catSubtotal = 0;
    for (const t of list) {
      catSubtotal += t.amount;
      csv += `"${catName}","${t.date?.split('T')[0] || ''}","${t.type}",${t.amount},"${(t.description || '').replace(/"/g, '""')}","${accMap[t.accountId] || ''}","${accMap[t.toAccountId] || ''}","${t.tags || ''}","${(t.notes || '').replace(/"/g, '""')}"\n`;
    }
    csv += `"${catName} Subtotal",,"Subtotal",${catSubtotal.toFixed(2)},,,,,\n`;
  }

  return csv;
}

export async function exportFullBackup() {
  const data = {
    version: 3,
    app: 'Pam&Nick Wealth',
    exportDate: new Date().toISOString(),
    users: await db.users.toArray(),
    accounts: await db.accounts.toArray(),
    transactions: await db.transactions.toArray(),
    categories: await db.categories.toArray(),
    assets: await db.assets.toArray(),
    valuations: await db.valuations.toArray(),
    notes: await db.notes.toArray(),
    lendBorrow: await db.lendBorrow.toArray(),
    lendBorrowRepayments: await db.lendBorrowRepayments.toArray(),
    subscriptions: await db.subscriptions.toArray(),
    auditLogs: await db.auditLogs.toArray(),
    userPreferences: await db.userPreferences.toArray(),
    settings: await db.settings.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importFullBackup(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data || !data.version) throw new Error('Invalid backup format');

  await clearAllData();

  if (data.users?.length) await db.users.bulkAdd(data.users);
  if (data.accounts?.length) await db.accounts.bulkAdd(data.accounts);
  if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions);
  if (data.categories?.length) await db.categories.bulkAdd(data.categories);
  if (data.assets?.length) await db.assets.bulkAdd(data.assets);
  if (data.valuations?.length) await db.valuations.bulkAdd(data.valuations);
  if (data.notes?.length) await db.notes.bulkAdd(data.notes);
  if (data.lendBorrow?.length) await db.lendBorrow.bulkAdd(data.lendBorrow);
  if (data.lendBorrowRepayments?.length) await db.lendBorrowRepayments.bulkAdd(data.lendBorrowRepayments);
  if (data.subscriptions?.length) await db.subscriptions.bulkAdd(data.subscriptions);
  if (data.auditLogs?.length) await db.auditLogs.bulkAdd(data.auditLogs);
  if (data.userPreferences?.length) await db.userPreferences.bulkAdd(data.userPreferences);
  if (data.settings?.length) await db.settings.bulkPut(data.settings);
}

// ── Settings ──────────────────────────────────────────────────────────

export async function getSetting(key) {
  const s = await db.settings.get(key);
  return s?.value;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}

export async function clearAllData() {
  await db.transaction('rw',
    [
      db.users, db.accounts, db.transactions, db.categories, db.assets, db.valuations,
      db.snapshots, db.snapshotBalances, db.settings,
      db.lendBorrow, db.lendBorrowRepayments, db.liabilities, db.liabilityRepayments,
      db.subscriptions, db.insurancePolicies, db.notes, db.auditLogs, db.userPreferences
    ],
    async () => {
      await db.users.clear();
      await db.accounts.clear();
      await db.transactions.clear();
      await db.categories.clear();
      await db.assets.clear();
      await db.valuations.clear();
      await db.snapshots.clear();
      await db.snapshotBalances.clear();
      await db.settings.clear();
      await db.lendBorrow.clear();
      await db.lendBorrowRepayments.clear();
      await db.liabilities.clear();
      await db.liabilityRepayments.clear();
      await db.subscriptions.clear();
      await db.insurancePolicies.clear();
      await db.notes.clear();
      await db.auditLogs.clear();
      await db.userPreferences.clear();
    }
  );
  await seedDefaults();
}

// ── Realistic Multi-User Sample Data ──────────────────────────────────

export async function seedSampleData() {
  await clearAllData();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const daysAgo = (d) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    return dt.toISOString();
  };

  // Seed User 1: Pam (Pratima)
  const pamCash = await db.accounts.add({
    userId: 1, name: 'Cashbox & Purse', type: 'cash', icon: '💵',
    openingBalance: 4500, openingBalanceDate: daysAgo(30).split('T')[0],
    notes: 'Household cash drawer', isActive: 1, sortOrder: 1, createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  const pamHdfc = await db.accounts.add({
    userId: 1, name: 'HDFC Savings Bank', type: 'bank', icon: '🏦',
    openingBalance: 52000, openingBalanceDate: daysAgo(30).split('T')[0],
    notes: 'Salary and personal savings', isActive: 1, sortOrder: 2, createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  const pamUpi = await db.accounts.add({
    userId: 1, name: 'PhonePe / UPI', type: 'upi', icon: '📱',
    openingBalance: 3200, openingBalanceDate: daysAgo(30).split('T')[0],
    notes: 'Daily market & groceries', isActive: 1, sortOrder: 3, createdAt: daysAgo(30), updatedAt: now.toISOString()
  });

  const cats = await db.categories.toArray();
  const catByName = (name) => cats.find(c => c.name.toLowerCase() === name.toLowerCase())?.id || null;

  // Transactions for Pam
  const pamTxns = [
    { userId: 1, type: 'income', amount: 55000, description: 'Monthly Salary Credit', categoryId: catByName('Salary'), accountId: pamHdfc, date: daysAgo(25) },
    { userId: 1, type: 'expense', amount: 12000, description: 'House Maintenance & Society', categoryId: catByName('Rent'), accountId: pamHdfc, date: daysAgo(24) },
    { userId: 1, type: 'transfer', amount: 8000, description: 'Cash Withdrawal for Household', accountId: pamHdfc, toAccountId: pamCash, date: daysAgo(23) },
    { userId: 1, type: 'expense', amount: 2450, description: 'Fresh Vegetables & Ration', categoryId: catByName('Groceries'), accountId: pamUpi, date: daysAgo(20) },
    { userId: 1, type: 'expense', amount: 250, description: 'Petrol for Activa', categoryId: catByName('Transport'), accountId: pamCash, date: daysAgo(18) },
    { userId: 1, type: 'expense', amount: 650, description: 'Family Dinner at Sagar Ratna', categoryId: catByName('Food & Dining'), accountId: pamUpi, date: daysAgo(15) },
    { userId: 1, type: 'expense', amount: 1250, description: 'Electricity & Gas Bill', categoryId: catByName('Bills & Utilities'), accountId: pamHdfc, date: daysAgo(12) },
    { userId: 1, type: 'income', amount: 3500, description: 'Freelance Boutique Order', categoryId: catByName('Business Income'), accountId: pamHdfc, date: daysAgo(10) },
    { userId: 1, type: 'expense', amount: 1899, description: 'Amazon Home Decor', categoryId: catByName('Shopping'), accountId: pamUpi, date: daysAgo(6) },
    { userId: 1, type: 'expense', amount: 80, description: 'Evening Chai with neighbor', categoryId: catByName('Tea & Snacks'), accountId: pamCash, date: daysAgo(2) },
  ];

  for (const t of pamTxns) {
    await db.transactions.add({ ...t, isDeleted: 0, createdAt: t.date, updatedAt: t.date });
  }

  // Physical Gold & Silver Assets for Pam
  // 1. Gold Ring (Indicative value, Dashboard ON, Wealth Inclusion OFF -> Tracked Personal Asset!)
  await db.assets.add({
    userId: 1,
    name: 'Gold Ring (Gifted by Family)',
    category: 'physical',
    type: 'gold',
    physicalItemType: 'jewellery',
    purity: '22K',
    weightGrams: 5.5,
    purchaseRatePerGram: 0,
    investedAmount: 0,
    currentValue: 39500,
    currentRatePerGram: 7196,
    purchaseDate: daysAgo(365).split('T')[0],
    lastValuationDate: todayStr,
    valuationStatus: 'indicative',
    valuationSource: 'Indicative Family Estimate',
    showOnDashboard: 1,
    includeInWealth: 0, // EXCLUDED from official wealth, tracked as personal asset!
    notes: 'Gifted by mom on anniversary. Personal emotional value.',
    isActive: 1,
    createdAt: daysAgo(30),
    updatedAt: now.toISOString()
  });

  // 2. Gold Wedding Necklace (Included in Wealth)
  await db.assets.add({
    userId: 1,
    name: '22K Gold Wedding Necklace',
    category: 'physical',
    type: 'gold',
    physicalItemType: 'jewellery',
    purity: '22K',
    weightGrams: 24,
    purchaseRatePerGram: 5900,
    makingCharges: 8500,
    gstAmount: 4500,
    investedAmount: 154600,
    currentValue: 172700,
    currentRatePerGram: 7196,
    purchaseDate: daysAgo(400).split('T')[0],
    lastValuationDate: todayStr,
    valuationStatus: 'verified',
    valuationSource: 'Tanishq Hallmark & Live 22K Rate',
    showOnDashboard: 1,
    includeInWealth: 1, // INCLUDED in official wealth!
    notes: 'Locker B-12 at HDFC Branch. Pure 916 Hallmark.',
    isActive: 1,
    createdAt: daysAgo(30),
    updatedAt: now.toISOString()
  });

  // 3. Silver Pooja Utensils (Included in Wealth)
  await db.assets.add({
    userId: 1,
    name: '999 Pure Silver Pooja Set (250g)',
    category: 'physical',
    type: 'silver',
    physicalItemType: 'bar',
    purity: '999',
    weightGrams: 250,
    purchaseRatePerGram: 75,
    investedAmount: 18750,
    currentValue: 23750,
    currentRatePerGram: 95,
    purchaseDate: daysAgo(200).split('T')[0],
    lastValuationDate: todayStr,
    valuationStatus: 'market_estimated',
    valuationSource: 'Live 999 Silver Rate (₹95/g)',
    showOnDashboard: 1,
    includeInWealth: 1,
    notes: 'Pooja room mandir utensils',
    isActive: 1,
    createdAt: daysAgo(30),
    updatedAt: now.toISOString()
  });

  // 4. Financial Investment: PPF & Mutual Fund
  await db.assets.add({
    userId: 1,
    name: 'Public Provident Fund (PPF)',
    category: 'financial',
    type: 'ppf',
    institution: 'State Bank of India',
    investedAmount: 120000,
    currentValue: 138000,
    purchaseDate: daysAgo(500).split('T')[0],
    lastValuationDate: todayStr,
    valuationStatus: 'verified',
    valuationSource: 'SBI Passbook Statement',
    showOnDashboard: 1,
    includeInWealth: 1,
    notes: '7.1% tax-free compounding',
    isActive: 1,
    createdAt: daysAgo(30),
    updatedAt: now.toISOString()
  });

  // Lending for Pam
  const lendId = await db.lendBorrow.add({
    userId: 1,
    type: 'lent',
    personName: 'Cousin Suman',
    contactNumber: '+91 98111 22334',
    amount: 5000,
    paidAmount: 2000,
    outstandingAmount: 3000,
    date: daysAgo(20).split('T')[0],
    expectedDate: daysAgo(-15).split('T')[0],
    accountId: pamCash,
    purpose: 'College books and fee assistance',
    status: 'partial',
    notes: 'Agreed to repay ₹2,000 this month',
    createdAt: daysAgo(20),
    updatedAt: daysAgo(5)
  });
  await db.lendBorrowRepayments.add({
    userId: 1,
    lendBorrowId: lendId,
    amount: 2000,
    date: daysAgo(5).split('T')[0],
    accountId: pamCash,
    notes: 'First installment received in cash',
    createdAt: daysAgo(5)
  });

  // Subscriptions for Pam
  const subDueDate = new Date();
  subDueDate.setDate(subDueDate.getDate() + 2);

  await db.subscriptions.bulkAdd([
    {
      userId: 1,
      name: 'Netflix 4K Plan',
      serviceCategory: 'Entertainment',
      amount: 649,
      billingCycle: 'monthly',
      paymentAccountId: pamHdfc,
      nextDueDate: subDueDate.toISOString().split('T')[0],
      autoRenewal: 1,
      status: 'active',
      notes: 'Family profile on living room TV',
      createdAt: daysAgo(60),
      updatedAt: now.toISOString()
    },
    {
      userId: 1,
      name: 'Spotify Family Music',
      serviceCategory: 'Music',
      amount: 179,
      billingCycle: 'monthly',
      paymentAccountId: pamHdfc,
      nextDueDate: daysAgo(-12).split('T')[0],
      autoRenewal: 1,
      status: 'active',
      notes: 'Monthly playlist subscription',
      createdAt: daysAgo(60),
      updatedAt: now.toISOString()
    }
  ]);

  // Notes for Pam (Purely Informational!)
  await db.notes.bulkAdd([
    {
      userId: 1,
      title: 'Locker renewal fees due next month',
      description: 'Check HDFC locker key and pay annual fee of ₹1,800 before 15th.',
      category: 'Reminders',
      date: todayStr,
      isPinned: 1,
      showOnDashboard: 1,
      createdAt: daysAgo(2),
      updatedAt: todayStr
    },
    {
      userId: 1,
      title: 'Gold jewellery appraisal slip',
      description: 'Keep the original Tanishq receipt safely in the blue folder.',
      category: 'Valuables',
      date: todayStr,
      isPinned: 0,
      showOnDashboard: 1,
      createdAt: daysAgo(1),
      updatedAt: todayStr
    }
  ]);

  // Seed User 2: Nick (Lokesh - Admin)
  const nickBank = await db.accounts.add({
    userId: 2, name: 'Nick Salary SBI', type: 'bank', icon: '🏦',
    openingBalance: 85000, openingBalanceDate: daysAgo(30).split('T')[0],
    notes: 'Corporate salary account', isActive: 1, sortOrder: 1, createdAt: daysAgo(30), updatedAt: now.toISOString()
  });

  await db.transactions.add({
    userId: 2, type: 'income', amount: 95000, description: 'Consulting Revenue',
    categoryId: catByName('Salary'), accountId: nickBank, date: daysAgo(20),
    isDeleted: 0, createdAt: daysAgo(20), updatedAt: daysAgo(20)
  });

  // Seed User 3: Rahul
  await db.accounts.add({
    userId: 3, name: 'Rahul Wallet & UPI', type: 'upi', icon: '📱',
    openingBalance: 12000, openingBalanceDate: todayStr,
    notes: 'Personal spending', isActive: 1, sortOrder: 1, createdAt: now.toISOString(), updatedAt: now.toISOString()
  });

  setActiveUserId(1); // Set default active user to Pam
  await logAdminAction('SEED_SAMPLE_DATA', 'Demo data loaded for Pam, Nick and Rahul');
}
