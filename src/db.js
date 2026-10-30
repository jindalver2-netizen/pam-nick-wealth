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

export async function getDateRangeReport(startDate, endDate) {
  const txns = await getTransactions({ startDate, endDate });
  const categories = await db.categories.toArray();
  const accounts = await db.accounts.toArray();
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

  // Calculate Lending & Borrowing totals
  let totalLentReceivable = 0;
  let totalBorrowedPayable = 0;
  try {
    const lendItems = await db.lendBorrow.toArray();
    for (const item of lendItems) {
      if (item.status !== 'closed' && (item.outstandingAmount || 0) > 0) {
        if (item.type === 'lent') {
          totalLentReceivable += item.outstandingAmount;
        } else if (item.type === 'borrowed') {
          totalBorrowedPayable += item.outstandingAmount;
        }
      }
    }
  } catch (e) {
    console.warn('LendBorrow store query notice:', e);
  }

  // Calculate Liabilities outstanding
  let totalLiabilitiesLoans = 0;
  try {
    const liabs = await db.liabilities.toArray();
    for (const l of liabs) {
      if (l.status !== 'closed' && (l.currentOutstanding || 0) > 0) {
        totalLiabilitiesLoans += l.currentOutstanding;
      }
    }
  } catch (e) {
    console.warn('Liabilities store query notice:', e);
  }

  const totalAssets = totalLiquid + totalInvestments + totalLentReceivable;
  const totalLiabilities = totalLiabilitiesLoans + totalBorrowedPayable;

  return {
    totalLiquid,
    totalInvestments,
    totalLentReceivable,
    totalBorrowedPayable,
    totalLiabilitiesLoans,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
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

export async function exportToCSV({ startDate, endDate } = {}) {
  let query = db.transactions.where('isDeleted').equals(0);
  let transactions = await query.toArray();
  if (startDate) transactions = transactions.filter(t => t.date >= startDate);
  if (endDate) transactions = transactions.filter(t => t.date <= endDate);
  transactions.sort((a, b) => b.date.localeCompare(a.date));

  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();

  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a.name);
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c.name);

  // Group transactions by category to satisfy Excel/Sheets structured grouping
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

  let csv = '=== WEALTHBOOK FINANCIAL STATEMENT & REPORT ===\n';
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
    version: 2,
    exportDate: new Date().toISOString(),
    accounts: await db.accounts.toArray(),
    transactions: await db.transactions.toArray(),
    categories: await db.categories.toArray(),
    assets: await db.assets.toArray(),
    valuations: await db.valuations.toArray(),
    snapshots: await db.snapshots.toArray(),
    snapshotBalances: await db.snapshotBalances.toArray(),
    settings: await db.settings.toArray(),
    lendBorrow: await db.lendBorrow.toArray(),
    lendBorrowRepayments: await db.lendBorrowRepayments.toArray(),
    liabilities: await db.liabilities.toArray(),
    liabilityRepayments: await db.liabilityRepayments.toArray(),
    subscriptions: await db.subscriptions.toArray(),
    insurancePolicies: await db.insurancePolicies.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importFullBackup(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data.version || !data.accounts) throw new Error('Invalid backup file');

  const tables = [
    db.accounts, db.transactions, db.categories, db.assets,
    db.valuations, db.snapshots, db.snapshotBalances, db.settings,
    db.lendBorrow, db.lendBorrowRepayments, db.liabilities,
    db.liabilityRepayments, db.subscriptions, db.insurancePolicies
  ];

  await db.transaction('rw', tables, async () => {
    for (const table of tables) {
      await table.clear();
    }

    if (data.accounts?.length) await db.accounts.bulkAdd(data.accounts);
    if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions);
    if (data.categories?.length) await db.categories.bulkAdd(data.categories);
    if (data.assets?.length) await db.assets.bulkAdd(data.assets);
    if (data.valuations?.length) await db.valuations.bulkAdd(data.valuations);
    if (data.snapshots?.length) await db.snapshots.bulkAdd(data.snapshots);
    if (data.snapshotBalances?.length) await db.snapshotBalances.bulkAdd(data.snapshotBalances);
    if (data.settings?.length) await db.settings.bulkPut(data.settings);
    if (data.lendBorrow?.length) await db.lendBorrow.bulkAdd(data.lendBorrow);
    if (data.lendBorrowRepayments?.length) await db.lendBorrowRepayments.bulkAdd(data.lendBorrowRepayments);
    if (data.liabilities?.length) await db.liabilities.bulkAdd(data.liabilities);
    if (data.liabilityRepayments?.length) await db.liabilityRepayments.bulkAdd(data.liabilityRepayments);
    if (data.subscriptions?.length) await db.subscriptions.bulkAdd(data.subscriptions);
    if (data.insurancePolicies?.length) await db.insurancePolicies.bulkAdd(data.insurancePolicies);
  });
}

// ── Lending & Borrowing Operations ────────────────────────────────────

export async function createLendBorrow(data) {
  const now = new Date().toISOString();
  const amount = Math.abs(parseFloat(data.amount));
  const accountId = parseInt(data.accountId) || null;

  const id = await db.lendBorrow.add({
    type: data.type, // 'lent' | 'borrowed'
    personName: (data.personName || '').trim(),
    amount,
    outstandingAmount: amount,
    date: data.date || now,
    expectedDate: data.expectedDate || '',
    accountId,
    purpose: data.purpose || '',
    contact: data.contact || '',
    interestRate: parseFloat(data.interestRate) || 0,
    notes: data.notes || '',
    status: 'active', // 'active' | 'partial' | 'closed'
    createdAt: now,
    updatedAt: now,
  });

  // Account integration:
  // When lending: money leaves accountId (e.g. transfer to person / receivable)
  // When borrowing: money enters accountId
  // We record an internal transaction linked to this record so accounts reflect true money position
  if (accountId) {
    const isLent = data.type === 'lent';
    await createTransaction({
      type: isLent ? 'expense' : 'income',
      amount,
      description: isLent ? `Lent to ${data.personName}` : `Borrowed from ${data.personName}`,
      categoryId: null,
      accountId,
      date: data.date || now,
      notes: `Lending/Borrowing principal: ${data.purpose || ''}`,
      referenceId: id,
      referenceType: 'lendBorrow',
    });
  }

  return id;
}

export async function recordLendBorrowRepayment(lendBorrowId, repaymentData) {
  const item = await db.lendBorrow.get(lendBorrowId);
  if (!item) throw new Error('Record not found');

  const amount = Math.abs(parseFloat(repaymentData.amount));
  const now = new Date().toISOString();
  const date = repaymentData.date || now;
  const accountId = parseInt(repaymentData.accountId) || null;

  const repaymentId = await db.lendBorrowRepayments.add({
    lendBorrowId,
    amount,
    date,
    accountId,
    notes: repaymentData.notes || '',
    createdAt: now,
  });

  const newOutstanding = Math.max(0, (item.outstandingAmount || item.amount) - amount);
  const newStatus = newOutstanding === 0 ? 'closed' : 'partial';

  await db.lendBorrow.update(lendBorrowId, {
    outstandingAmount: newOutstanding,
    status: newStatus,
    updatedAt: now,
  });

  // Balance update:
  // Repayment of lent money: money enters accountId (income movement)
  // Repayment of borrowed money: money leaves accountId (expense movement)
  if (accountId) {
    const isLent = item.type === 'lent';
    await createTransaction({
      type: isLent ? 'income' : 'expense',
      amount,
      description: isLent ? `Repayment received from ${item.personName}` : `Repayment paid to ${item.personName}`,
      categoryId: null,
      accountId,
      date,
      notes: `Repayment for ${item.type} #${lendBorrowId}: ${repaymentData.notes || ''}`,
      referenceId: repaymentId,
      referenceType: 'lendBorrowRepayment',
    });
  }

  return repaymentId;
}

export async function getLendBorrowList() {
  return db.lendBorrow.orderBy('date').reverse().toArray();
}

export async function getLendBorrowRepayments(lendBorrowId) {
  return db.lendBorrowRepayments.where('lendBorrowId').equals(lendBorrowId).sortBy('date');
}

export async function getLendBorrowSummary() {
  const items = await db.lendBorrow.toArray();
  let totalLent = 0;
  let totalLentRecovered = 0;
  let totalLentOutstanding = 0;
  let totalBorrowed = 0;
  let totalBorrowedRepaid = 0;
  let totalBorrowedOutstanding = 0;

  for (const item of items) {
    const amt = item.amount || 0;
    const out = item.outstandingAmount !== undefined ? item.outstandingAmount : amt;
    const rep = Math.max(0, amt - out);

    if (item.type === 'lent') {
      totalLent += amt;
      totalLentOutstanding += out;
      totalLentRecovered += rep;
    } else {
      totalBorrowed += amt;
      totalBorrowedOutstanding += out;
      totalBorrowedRepaid += rep;
    }
  }

  return {
    totalLent,
    totalLentRecovered,
    totalLentOutstanding,
    totalBorrowed,
    totalBorrowedRepaid,
    totalBorrowedOutstanding,
  };
}

// ── Liabilities Management Operations ─────────────────────────────────

export async function createLiability(data) {
  const now = new Date().toISOString();
  const originalAmount = Math.abs(parseFloat(data.originalAmount));
  const currentOutstanding = parseFloat(data.currentOutstanding) !== undefined
    ? Math.abs(parseFloat(data.currentOutstanding))
    : originalAmount;

  return db.liabilities.add({
    lenderName: (data.lenderName || '').trim(),
    type: data.type || 'personal_loan', // home_loan, personal_loan, car_loan, education_loan, credit_card, business_loan, friend_family, other
    originalAmount,
    currentOutstanding,
    interestRate: parseFloat(data.interestRate) || 0,
    emiAmount: parseFloat(data.emiAmount) || 0,
    emiFrequency: data.emiFrequency || 'monthly',
    nextDueDate: data.nextDueDate || '',
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    accountNumber: data.accountNumber || '',
    notes: data.notes || '',
    status: currentOutstanding <= 0 ? 'closed' : 'active',
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

export async function getLiabilities() {
  return db.liabilities.toArray();
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
      type: 'expense',
      amount,
      description: `EMI / Loan Repayment: ${liab.lenderName} (${liab.type.replace('_', ' ')})`,
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

// ── Subscription Operations ───────────────────────────────────────────

export async function createSubscription(data) {
  const now = new Date().toISOString();
  return db.subscriptions.add({
    name: (data.name || '').trim(),
    company: (data.company || '').trim(),
    amount: Math.abs(parseFloat(data.amount)),
    billingFrequency: data.billingFrequency || 'monthly', // monthly, quarterly, yearly, custom
    nextDueDate: data.nextDueDate || new Date().toISOString().split('T')[0],
    accountId: parseInt(data.accountId) || null,
    autoRenewal: data.autoRenewal !== undefined ? data.autoRenewal : 1,
    status: data.status || 'active', // active, cancelled
    category: data.category || 'Subscriptions',
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

export async function getSubscriptions() {
  return db.subscriptions.toArray();
}

export async function markSubscriptionPaid(id, paidDate = new Date().toISOString().split('T')[0]) {
  const sub = await db.subscriptions.get(id);
  if (!sub) throw new Error('Subscription not found');

  // Record actual expense transaction if accountId is configured
  if (sub.accountId) {
    await createTransaction({
      type: 'expense',
      amount: sub.amount,
      description: `Subscription: ${sub.name} (${sub.company || 'Service'})`,
      categoryId: null,
      accountId: sub.accountId,
      date: new Date().toISOString(),
      notes: `Auto-logged from subscription manager`,
      referenceId: id,
      referenceType: 'subscriptionPayment',
    });
  }

  // Calculate next due date
  const currDate = new Date(sub.nextDueDate || paidDate);
  if (sub.billingFrequency === 'yearly') {
    currDate.setFullYear(currDate.getFullYear() + 1);
  } else if (sub.billingFrequency === 'quarterly') {
    currDate.setMonth(currDate.getMonth() + 3);
  } else {
    // monthly default
    currDate.setMonth(currDate.getMonth() + 1);
  }
  const nextDueDate = currDate.toISOString().split('T')[0];

  await db.subscriptions.update(id, {
    nextDueDate,
    lastPaidDate: paidDate,
    updatedAt: new Date().toISOString(),
  });

  return nextDueDate;
}

// ── Insurance Policy Operations ───────────────────────────────────────

export async function createInsurancePolicy(data) {
  const now = new Date().toISOString();
  return db.insurancePolicies.add({
    provider: (data.provider || '').trim(),
    policyName: (data.policyName || '').trim(),
    policyType: data.policyType || 'health', // health, life, term, vehicle, accident, other
    policyholder: (data.policyholder || '').trim(),
    policyNumber: (data.policyNumber || '').trim(),
    premiumAmount: Math.abs(parseFloat(data.premiumAmount) || 0),
    paymentFrequency: data.paymentFrequency || 'yearly',
    startDate: data.startDate || '',
    nextRenewalDate: data.nextRenewalDate || '',
    expiryDate: data.expiryDate || '',
    sumInsured: parseFloat(data.sumInsured) || 0,
    nominee: data.nominee || '',
    status: data.status || 'active', // active, expired, lapsed
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

export async function getInsurancePolicies() {
  return db.insurancePolicies.toArray();
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
    [
      db.accounts, db.transactions, db.categories, db.assets, db.valuations,
      db.snapshots, db.snapshotBalances, db.settings,
      db.lendBorrow, db.lendBorrowRepayments, db.liabilities, db.liabilityRepayments,
      db.subscriptions, db.insurancePolicies
    ],
    async () => {
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

  // 6. Lending & Borrowing Sample
  const lendId = await db.lendBorrow.add({
    type: 'lent',
    personName: 'Rahul Sharma',
    contactNumber: '+91 98765 43210',
    amount: 10000,
    paidAmount: 4000,
    outstandingAmount: 6000,
    date: daysAgo(20).split('T')[0],
    expectedDate: daysAgo(-10).split('T')[0],
    accountId: accCash,
    purpose: 'Emergency medical assistance',
    status: 'partial',
    notes: 'Agreed to repay before 10th of next month',
    createdAt: daysAgo(20),
    updatedAt: daysAgo(5)
  });
  await db.lendBorrowRepayments.add({
    lendBorrowId: lendId,
    amount: 4000,
    date: daysAgo(5).split('T')[0],
    accountId: accCash,
    notes: 'First installment received in cash',
    createdAt: daysAgo(5)
  });

  // 7. Liabilities Sample
  const liabilityId = await db.liabilities.add({
    loanName: 'Two-Wheeler Loan (Royal Enfield)',
    loanType: 'vehicle',
    lender: 'HDFC Bank',
    accountNumber: 'LOAN-839219',
    totalLoanAmount: 90000,
    currentOutstanding: 42000,
    totalPaid: 48000,
    interestRate: 9.5,
    tenureMonths: 24,
    monthlyEmi: 4132,
    startDate: daysAgo(365).split('T')[0],
    nextDueDate: daysAgo(-7).split('T')[0],
    status: 'active',
    notes: 'Auto-debited from HDFC salary account on 5th',
    createdAt: daysAgo(365),
    updatedAt: now.toISOString()
  });

  // 8. Subscriptions Sample
  const subDueDate1 = new Date();
  subDueDate1.setDate(subDueDate1.getDate() + 2);
  const subDueDate2 = new Date();
  subDueDate2.setDate(subDueDate2.getDate() + 15);

  await db.subscriptions.bulkAdd([
    {
      name: 'Spotify Premium Family',
      serviceCategory: 'Music & Streaming',
      amount: 179,
      billingCycle: 'monthly',
      paymentAccountId: accHdfc,
      nextDueDate: subDueDate1.toISOString().split('T')[0],
      autoRenewal: 1,
      status: 'active',
      notes: 'Family plan shared with brother',
      createdAt: daysAgo(60),
      updatedAt: now.toISOString()
    },
    {
      name: 'Netflix 4K Ultra HD',
      serviceCategory: 'Entertainment',
      amount: 649,
      billingCycle: 'monthly',
      paymentAccountId: accHdfc,
      nextDueDate: subDueDate2.toISOString().split('T')[0],
      autoRenewal: 1,
      status: 'active',
      notes: 'Auto-renewal via HDFC Credit/Debit card',
      createdAt: daysAgo(90),
      updatedAt: now.toISOString()
    }
  ]);

  // 9. Insurance Sample
  const insRenewalDate = new Date();
  insRenewalDate.setMonth(insRenewalDate.getMonth() + 4);

  await db.insurancePolicies.add({
    provider: 'HDFC ERGO',
    policyName: 'Optima Secure Individual Health Plan',
    policyType: 'health',
    policyholder: 'Self',
    policyNumber: 'HDFC-HL-2948102',
    sumInsured: 1000000,
    premiumAmount: 13500,
    paymentFrequency: 'yearly',
    startDate: daysAgo(240).split('T')[0],
    nextRenewalDate: insRenewalDate.toISOString().split('T')[0],
    expiryDate: insRenewalDate.toISOString().split('T')[0],
    nominee: 'Parents',
    status: 'active',
    notes: 'Cashless hospital network covers Apollo and Fortis',
    createdAt: daysAgo(240),
    updatedAt: now.toISOString()
  });
}

