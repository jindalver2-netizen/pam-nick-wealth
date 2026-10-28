/**
 * DhanRakshak — Database Layer
 * Uses Dexie.js (IndexedDB wrapper) for offline-first local storage.
 */
import Dexie from 'dexie';

export const db = new Dexie('DhanRakshakDB');

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

// ── Default Data Seeding ──────────────────────────────────────────────

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
  { name: 'Personal',          type: 'expense', icon: '👤', keywords: 'personal,haircut,salon,grooming,parlour', sortOrder: 11 },
  { name: 'Education',         type: 'expense', icon: '📚', keywords: 'education,book,books,course,tuition,school,college,coaching,fees', sortOrder: 12 },
  { name: 'Travel',            type: 'expense', icon: '✈️', keywords: 'travel,flight,hotel,vacation,trip,booking,stay', sortOrder: 13 },
  { name: 'Business',          type: 'expense', icon: '💼', keywords: 'business,office,client,customer,inventory,stock,supplies', sortOrder: 14 },
  { name: 'Gifts & Donations', type: 'expense', icon: '🎁', keywords: 'gift,donation,charity,temple,church,mosque,offering', sortOrder: 15 },
  { name: 'EMI & Loans',       type: 'expense', icon: '🏦', keywords: 'emi,loan,installment,interest,repayment', sortOrder: 16 },
  { name: 'Insurance',         type: 'expense', icon: '🛡️', keywords: 'insurance,premium,lic,policy', sortOrder: 17 },
  { name: 'Subscriptions',     type: 'expense', icon: '📱', keywords: 'subscription,membership,annual,monthly,plan', sortOrder: 18 },
  { name: 'Other Expense',     type: 'expense', icon: '📌', keywords: 'other,misc,miscellaneous', sortOrder: 99 },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary',            type: 'income', icon: '💰', keywords: 'salary,wages,pay,paycheck', sortOrder: 1 },
  { name: 'Business Income',   type: 'income', icon: '💼', keywords: 'business,revenue,sales,client,customer,freelance,project', sortOrder: 2 },
  { name: 'Cash Received',     type: 'income', icon: '💵', keywords: 'cash,received,got', sortOrder: 3 },
  { name: 'Interest',          type: 'income', icon: '🏦', keywords: 'interest,fd,bank,saving', sortOrder: 4 },
  { name: 'Investment Income', type: 'income', icon: '📈', keywords: 'dividend,investment,mutual,stock,return', sortOrder: 5 },
  { name: 'Refund',            type: 'income', icon: '↩️', keywords: 'refund,cashback,return,reversal', sortOrder: 6 },
  { name: 'Gift Received',     type: 'income', icon: '🎁', keywords: 'gift,present,birthday,wedding', sortOrder: 7 },
  { name: 'Loan Repayment',    type: 'income', icon: '🤝', keywords: 'loan,repayment,lent,returned,lending', sortOrder: 8 },
  { name: 'Rental Income',     type: 'income', icon: '🏠', keywords: 'rent,rental,tenant,lease', sortOrder: 9 },
  { name: 'Other Income',      type: 'income', icon: '📌', keywords: 'other,misc', sortOrder: 99 },
];

export async function seedDefaults() {
  const catCount = await db.categories.count();
  if (catCount === 0) {
    await db.categories.bulkAdd([...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]);
  }

  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.bulkPut([
      { key: 'theme', value: 'dark' },
      { key: 'currency', value: '₹' },
      { key: 'dateFormat', value: 'DD/MM/YYYY' },
      { key: 'initialized', value: 'true' },
    ]);
  }

  const accCount = await db.accounts.count();
  if (accCount === 0) {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    await db.accounts.bulkAdd([
      { name: 'Cash in Hand', type: 'cash', icon: '💵', openingBalance: 5000, openingBalanceDate: today, notes: 'Physical cash & wallet', isActive: 1, sortOrder: 1, createdAt: now, updatedAt: now },
      { name: 'HDFC Bank', type: 'bank', icon: '🏦', openingBalance: 45000, openingBalanceDate: today, notes: 'Primary salary / savings account', isActive: 1, sortOrder: 2, createdAt: now, updatedAt: now },
      { name: 'PhonePe / UPI', type: 'upi', icon: '📱', openingBalance: 3500, openingBalanceDate: today, notes: 'Daily digital payments', isActive: 1, sortOrder: 3, createdAt: now, updatedAt: now },
    ]);
  }
}

// ── Account Operations ────────────────────────────────────────────────

export async function createAccount(data) {
  const now = new Date().toISOString();
  const maxSort = (await db.accounts.orderBy('sortOrder').last())?.sortOrder || 0;
  return db.accounts.add({
    name: data.name,
    type: data.type || 'cash',
    openingBalance: parseFloat(data.openingBalance) || 0,
    openingBalanceDate: data.openingBalanceDate || new Date().toISOString().split('T')[0],
    notes: data.notes || '',
    icon: data.icon || getAccountIcon(data.type),
    isActive: 1,
    sortOrder: maxSort + 1,
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

export async function getActiveAccounts() {
  return db.accounts.where('isActive').equals(1).sortBy('sortOrder');
}

export async function getAllAccounts() {
  return db.accounts.orderBy('sortOrder').toArray();
}

export async function getAccountById(id) {
  return db.accounts.get(id);
}

function getAccountIcon(type) {
  const icons = { cash: '💵', bank: '🏦', wallet: '👛', upi: '📱', other: '💳' };
  return icons[type] || '💳';
}

// ── Category Operations ───────────────────────────────────────────────

export async function getCategories(type) {
  if (type) return db.categories.where('type').equals(type).sortBy('sortOrder');
  return db.categories.orderBy('sortOrder').toArray();
}

export async function createCategory(data) {
  const maxSort = (await db.categories.where('type').equals(data.type).last())?.sortOrder || 0;
  return db.categories.add({
    name: data.name,
    type: data.type,
    icon: data.icon || '📌',
    keywords: data.keywords || data.name.toLowerCase(),
    sortOrder: maxSort + 1,
  });
}

export async function updateCategory(id, data) {
  return db.categories.update(id, data);
}

export async function deleteCategory(id) {
  return db.categories.delete(id);
}

// ── Transaction Operations ────────────────────────────────────────────

export async function createTransaction(data) {
  const now = new Date().toISOString();
  const id = await db.transactions.add({
    type: data.type,
    amount: Math.abs(parseFloat(data.amount)),
    description: data.description || '',
    categoryId: data.categoryId || null,
    accountId: data.accountId,
    toAccountId: data.toAccountId || null,
    date: data.date || now,
    tags: data.tags || '',
    notes: data.notes || '',
    isDeleted: 0,
    createdAt: now,
    updatedAt: now,
  });
  return id;
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

export async function getTransactions({ type, accountId, startDate, endDate, limit, offset, categoryId } = {}) {
  let collection = db.transactions.where('isDeleted').equals(0);
  let results = await collection.toArray();

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

export async function getRecentTransactions(limit = 20) {
  return getTransactions({ limit });
}

// ── Balance Calculations ──────────────────────────────────────────────

export async function getAccountBalance(accountId) {
  const account = await db.accounts.get(accountId);
  if (!account) return 0;

  const txns = await db.transactions.where('isDeleted').equals(0).toArray();
  let balance = account.openingBalance || 0;

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

export async function getAllBalances() {
  const accounts = await getActiveAccounts();
  const txns = await db.transactions.where('isDeleted').equals(0).toArray();
  const balances = {};

  for (const acc of accounts) {
    balances[acc.id] = acc.openingBalance || 0;
  }

  for (const t of txns) {
    if (t.type === 'income' && balances[t.accountId] !== undefined) {
      balances[t.accountId] += t.amount;
    } else if (t.type === 'expense' && balances[t.accountId] !== undefined) {
      balances[t.accountId] -= t.amount;
    } else if (t.type === 'transfer') {
      if (balances[t.accountId] !== undefined) balances[t.accountId] -= t.amount;
      if (balances[t.toAccountId] !== undefined) balances[t.toAccountId] += t.amount;
    }
  }

  return balances;
}

export async function getTotalLiquidMoney() {
  const balances = await getAllBalances();
  return Object.values(balances).reduce((s, b) => s + b, 0);
}

// ── Report Queries ────────────────────────────────────────────────────

export async function getMonthlyReport(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const txns = await getTransactions({ startDate, endDate });
  const categories = await db.categories.toArray();
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c);

  let totalIncome = 0, totalExpense = 0;
  const incomeByCategory = {};
  const expenseByCategory = {};
  const expenseByAccount = {};
  let largestExpense = null;
  const dailyExpenses = {};

  for (const t of txns) {
    if (t.type === 'income') {
      totalIncome += t.amount;
      const catName = catMap[t.categoryId]?.name || 'Uncategorized';
      incomeByCategory[catName] = (incomeByCategory[catName] || 0) + t.amount;
    } else if (t.type === 'expense') {
      totalExpense += t.amount;
      const catName = catMap[t.categoryId]?.name || 'Uncategorized';
      expenseByCategory[catName] = (expenseByCategory[catName] || 0) + t.amount;
      expenseByAccount[t.accountId] = (expenseByAccount[t.accountId] || 0) + t.amount;
      if (!largestExpense || t.amount > largestExpense.amount) largestExpense = t;
      const day = t.date.split('T')[0];
      dailyExpenses[day] = (dailyExpenses[day] || 0) + t.amount;
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysPassed = month === new Date().getMonth() + 1 && year === new Date().getFullYear()
    ? new Date().getDate() : daysInMonth;

  return {
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    savingsRate: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0,
    dailyAvgSpending: daysPassed > 0 ? totalExpense / daysPassed : 0,
    incomeByCategory,
    expenseByCategory,
    expenseByAccount,
    largestExpense,
    dailyExpenses,
    transactions: txns,
    daysInMonth,
    daysPassed,
  };
}

export async function getPreviousMonthReport(year, month) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return getMonthlyReport(prevYear, prevMonth);
}

// ── Asset Operations ──────────────────────────────────────────────────

export async function createAsset(data) {
  const now = new Date().toISOString();
  const id = await db.assets.add({
    name: data.name,
    type: data.type || 'other',
    institution: data.institution || '',
    investedAmount: parseFloat(data.investedAmount) || 0,
    currentValue: parseFloat(data.currentValue) || 0,
    purchaseDate: data.purchaseDate || '',
    lastValuationDate: data.lastValuationDate || new Date().toISOString().split('T')[0],
    notes: data.notes || '',
    linkedAccountId: data.linkedAccountId || null,
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  });

  if (data.currentValue) {
    await db.valuations.add({
      assetId: id,
      date: data.lastValuationDate || new Date().toISOString().split('T')[0],
      value: parseFloat(data.currentValue),
      notes: 'Initial valuation',
    });
  }

  return id;
}

export async function updateAsset(id, data) {
  return db.assets.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function getActiveAssets() {
  return db.assets.where('isActive').equals(1).toArray();
}

export async function addValuation(assetId, value, date, notes = '') {
  await db.valuations.add({ assetId, date, value: parseFloat(value), notes });
  await db.assets.update(assetId, {
    currentValue: parseFloat(value),
    lastValuationDate: date,
    updatedAt: new Date().toISOString(),
  });
}

export async function getValuations(assetId) {
  return db.valuations.where('assetId').equals(assetId).sortBy('date');
}

// ── Net Worth Calculation ─────────────────────────────────────────────

export async function getNetWorth() {
  const balances = await getAllBalances();
  const accounts = await getActiveAccounts();
  const assets = await getActiveAssets();

  let totalLiquid = 0;
  let totalInvestments = 0;
  const linkedAccountIds = new Set();

  for (const asset of assets) {
    if (asset.linkedAccountId) linkedAccountIds.add(asset.linkedAccountId);
    totalInvestments += asset.currentValue || 0;
  }

  for (const acc of accounts) {
    if (!linkedAccountIds.has(acc.id)) {
      totalLiquid += balances[acc.id] || 0;
    }
  }

  const totalAssets = totalLiquid + totalInvestments;

  return {
    totalLiquid,
    totalInvestments,
    totalAssets,
    totalLiabilities: 0,
    netWorth: totalAssets,
    accounts,
    balances,
    assets,
  };
}

// ── Snapshot Operations ───────────────────────────────────────────────

export async function createSnapshot(date, balanceEntries, notes = '') {
  const id = await db.snapshots.add({
    date,
    notes,
    createdAt: new Date().toISOString(),
  });

  const entries = balanceEntries.map(e => ({
    snapshotId: id,
    accountId: e.accountId,
    balance: parseFloat(e.balance),
  }));

  await db.snapshotBalances.bulkAdd(entries);
  return id;
}

export async function getSnapshots() {
  return db.snapshots.orderBy('date').reverse().toArray();
}

export async function getSnapshotBalances(snapshotId) {
  return db.snapshotBalances.where('snapshotId').equals(snapshotId).toArray();
}

// ── Data Export ───────────────────────────────────────────────────────

export async function exportToCSV() {
  const transactions = await db.transactions.where('isDeleted').equals(0).toArray();
  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();

  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a.name);
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c.name);

  const header = 'Date,Type,Amount,Description,Category,Account,To Account,Tags,Notes\n';
  const rows = transactions.map(t =>
    `"${t.date}","${t.type}","${t.amount}","${(t.description || '').replace(/"/g, '""')}","${catMap[t.categoryId] || ''}","${accMap[t.accountId] || ''}","${accMap[t.toAccountId] || ''}","${t.tags || ''}","${(t.notes || '').replace(/"/g, '""')}"`
  ).join('\n');

  return header + rows;
}

export async function exportFullBackup() {
  const data = {
    version: 1,
    exportDate: new Date().toISOString(),
    accounts: await db.accounts.toArray(),
    transactions: await db.transactions.toArray(),
    categories: await db.categories.toArray(),
    assets: await db.assets.toArray(),
    valuations: await db.valuations.toArray(),
    snapshots: await db.snapshots.toArray(),
    snapshotBalances: await db.snapshotBalances.toArray(),
    settings: await db.settings.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importFullBackup(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data.version || !data.accounts) throw new Error('Invalid backup file');

  await db.transaction('rw',
    db.accounts, db.transactions, db.categories, db.assets,
    db.valuations, db.snapshots, db.snapshotBalances, db.settings,
    async () => {
      await db.accounts.clear();
      await db.transactions.clear();
      await db.categories.clear();
      await db.assets.clear();
      await db.valuations.clear();
      await db.snapshots.clear();
      await db.snapshotBalances.clear();
      await db.settings.clear();

      if (data.accounts.length) await db.accounts.bulkAdd(data.accounts);
      if (data.transactions.length) await db.transactions.bulkAdd(data.transactions);
      if (data.categories.length) await db.categories.bulkAdd(data.categories);
      if (data.assets.length) await db.assets.bulkAdd(data.assets);
      if (data.valuations.length) await db.valuations.bulkAdd(data.valuations);
      if (data.snapshots.length) await db.snapshots.bulkAdd(data.snapshots);
      if (data.snapshotBalances.length) await db.snapshotBalances.bulkAdd(data.snapshotBalances);
      if (data.settings.length) await db.settings.bulkPut(data.settings);
    }
  );
}

// ── Settings ──────────────────────────────────────────────────────────

export async function getSetting(key) {
  const s = await db.settings.get(key);
  return s?.value;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}

// ── Sample Data & Reset ───────────────────────────────────────────────

export async function clearAllData() {
  await db.transaction('rw',
    [db.accounts, db.transactions, db.categories, db.assets, db.valuations, db.snapshots, db.snapshotBalances, db.settings],
    async () => {
      await db.accounts.clear();
      await db.transactions.clear();
      await db.categories.clear();
      await db.assets.clear();
      await db.valuations.clear();
      await db.snapshots.clear();
      await db.snapshotBalances.clear();
      await db.settings.clear();
    }
  );
  await seedDefaults();
}

export async function seedSampleData() {
  await clearAllData();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const daysAgo = (d) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    return dt.toISOString();
  };

  // 1. Accounts
  const accCash = await db.accounts.add({
    name: 'Cash in Hand', type: 'cash', icon: '💵',
    openingBalance: 4000, openingBalanceDate: daysAgo(30).split('T')[0],
    notes: 'Wallet & drawer cash', isActive: 1, sortOrder: 1, createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  const accHdfc = await db.accounts.add({
    name: 'HDFC Bank', type: 'bank', icon: '🏦',
    openingBalance: 65000, openingBalanceDate: daysAgo(30).split('T')[0],
    notes: 'Salary and primary account', isActive: 1, sortOrder: 2, createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  const accSbi = await db.accounts.add({
    name: 'SBI Bank', type: 'bank', icon: '🏛️',
    openingBalance: 25000, openingBalanceDate: daysAgo(30).split('T')[0],
    notes: 'Emergency savings', isActive: 1, sortOrder: 3, createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  const accUpi = await db.accounts.add({
    name: 'PhonePe / UPI', type: 'upi', icon: '📱',
    openingBalance: 2500, openingBalanceDate: daysAgo(30).split('T')[0],
    notes: 'Daily merchant scans', isActive: 1, sortOrder: 4, createdAt: daysAgo(30), updatedAt: now.toISOString()
  });

  // 2. Categories lookup
  const cats = await db.categories.toArray();
  const catByName = (name) => cats.find(c => c.name.toLowerCase() === name.toLowerCase())?.id || null;

  // 3. Transactions
  const sampleTxns = [
    { type: 'income', amount: 75000, description: 'Monthly Salary', categoryId: catByName('Salary'), accountId: accHdfc, date: daysAgo(27) },
    { type: 'expense', amount: 18000, description: 'Apartment Rent', categoryId: catByName('Rent'), accountId: accHdfc, date: daysAgo(26) },
    { type: 'transfer', amount: 10000, description: 'ATM Cash Withdrawal', accountId: accHdfc, toAccountId: accCash, date: daysAgo(25) },
    { type: 'transfer', amount: 5000, description: 'Loaded PhonePe Wallet', accountId: accHdfc, toAccountId: accUpi, date: daysAgo(24) },
    { type: 'expense', amount: 3450, description: 'Weekly Groceries at D-Mart', categoryId: catByName('Groceries'), accountId: accUpi, date: daysAgo(22) },
    { type: 'expense', amount: 1450, description: 'Petrol for Bike', categoryId: catByName('Transport'), accountId: accUpi, date: daysAgo(20) },
    { type: 'expense', amount: 620, description: 'Swiggy Dinner Biryani', categoryId: catByName('Food & Dining'), accountId: accUpi, date: daysAgo(18) },
    { type: 'expense', amount: 80, description: 'Evening Chai with colleagues', categoryId: catByName('Tea & Snacks'), accountId: accCash, date: daysAgo(17) },
    { type: 'expense', amount: 1850, description: 'Electricity Bill', categoryId: catByName('Bills & Utilities'), accountId: accHdfc, date: daysAgo(15) },
    { type: 'expense', amount: 999, description: 'JioFiber Broadband Bill', categoryId: catByName('Bills & Utilities'), accountId: accUpi, date: daysAgo(14) },
    { type: 'income', amount: 12000, description: 'Freelance Web Design Project', categoryId: catByName('Business Income'), accountId: accHdfc, date: daysAgo(12) },
    { type: 'expense', amount: 2899, description: 'Amazon Shopping (Headphones)', categoryId: catByName('Shopping'), accountId: accHdfc, date: daysAgo(10) },
    { type: 'expense', amount: 450, description: 'Medicines from Apollo Pharmacy', categoryId: catByName('Medical'), accountId: accUpi, date: daysAgo(8) },
    { type: 'expense', amount: 350, description: 'Movie Tickets (BookMyShow)', categoryId: catByName('Entertainment'), accountId: accUpi, date: daysAgo(5) },
    { type: 'expense', amount: 120, description: 'Chai & Samosa snack', categoryId: catByName('Tea & Snacks'), accountId: accCash, date: daysAgo(3) },
    { type: 'expense', amount: 1800, description: 'Fresh Vegetables & Milk', categoryId: catByName('Groceries'), accountId: accCash, date: daysAgo(1) },
    { type: 'income', amount: 1450, description: 'Stock Dividend', categoryId: catByName('Investment Income'), accountId: accHdfc, date: daysAgo(2) },
  ];

  for (const t of sampleTxns) {
    await db.transactions.add({
      ...t,
      isDeleted: 0,
      createdAt: t.date,
      updatedAt: t.date,
    });
  }

  // 4. Assets & Investments
  const asset1 = await db.assets.add({
    name: 'Public Provident Fund (PPF)', type: 'ppf',
    currentValue: 168000, investedAmount: 150000,
    institution: 'State Bank of India', accountNumber: 'PPF-9823412',
    notes: '7.1% tax-free compound interest', isActive: 1,
    createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  await db.valuations.add({ assetId: asset1, date: daysAgo(30), value: 162000, notes: 'Quarterly update' });
  await db.valuations.add({ assetId: asset1, date: todayStr, value: 168000, notes: 'Latest balance' });

  const asset2 = await db.assets.add({
    name: 'Nifty 50 Index Mutual Fund', type: 'mutual_fund',
    currentValue: 148500, investedAmount: 120000,
    institution: 'UTI Mutual Fund', accountNumber: 'FOLIO-847291',
    notes: 'Monthly SIP ₹5,000', isActive: 1,
    createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  await db.valuations.add({ assetId: asset2, date: daysAgo(30), value: 139000, notes: 'Monthly NAV' });
  await db.valuations.add({ assetId: asset2, date: todayStr, value: 148500, notes: 'Latest NAV' });

  const asset3 = await db.assets.add({
    name: '24K Digital Gold (10g)', type: 'gold',
    currentValue: 74200, investedAmount: 62000,
    institution: 'MMTC-PAMP', accountNumber: 'GOLD-30219',
    notes: 'Long-term inflation hedge', isActive: 1,
    createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  await db.valuations.add({ assetId: asset3, date: daysAgo(30), value: 69000, notes: 'Gold price update' });
  await db.valuations.add({ assetId: asset3, date: todayStr, value: 74200, notes: 'Current market rate' });

  const asset4 = await db.assets.add({
    name: 'HDFC 1-Year Fixed Deposit', type: 'fd',
    currentValue: 107200, investedAmount: 100000,
    institution: 'HDFC Bank', accountNumber: 'FD-5010049281',
    notes: '7.25% p.a. matures in 4 months', isActive: 1,
    createdAt: daysAgo(30), updatedAt: now.toISOString()
  });
  await db.valuations.add({ assetId: asset4, date: todayStr, value: 107200, notes: 'Accrued interest value' });

  // 5. Initial snapshot
  const snapshotDate = daysAgo(7).split('T')[0];
  const snapId = await db.snapshots.add({
    date: snapshotDate,
    totalLiquid: 88500,
    totalAssets: 497900,
    netWorth: 586400,
    notes: 'Weekly portfolio snapshot'
  });
  await db.snapshotBalances.bulkAdd([
    { snapshotId: snapId, accountId: accCash, accountName: 'Cash in Hand', balance: 5200 },
    { snapshotId: snapId, accountId: accHdfc, accountName: 'HDFC Bank', balance: 58100 },
    { snapshotId: snapId, accountId: accSbi, accountName: 'SBI Bank', balance: 25000 },
    { snapshotId: snapId, accountId: accUpi, accountName: 'PhonePe / UPI', balance: 2000 },
  ]);
}

