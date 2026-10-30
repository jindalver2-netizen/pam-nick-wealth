/**
 * Wealthbook / Nick Wealth OS — Quick Entry Parser
 * Parses natural language financial commands in English, Hindi, and Hinglish
 * into structured transaction data.
 * Works entirely offline with local rules — no AI API calls needed.
 */

const TRANSFER_KEYWORDS = [
  'transferred', 'transfer', 'moved', 'sent', 'shifted', 'bheje', 'bheja', 'transfer kiya', 'shift kiya', 'daale', 'daala'
];

const INCOME_KEYWORDS = [
  'received', 'income', 'salary', 'earned', 'got', 'refund', 'cashback', 'bonus', 'payment received',
  'aaye', 'aaya', 'mile', 'mila', 'credit hua', 'jama hue', 'jama hua', 'pese aaye', 'paise aaye', 'kamaya'
];

const EXPENSE_KEYWORDS = [
  'spent', 'paid', 'paid to', 'bought', 'expense', 'diye', 'diya', 'kharch', 'kharcha', 'kharch kiya',
  'bhara', 'bhari', 'de diya', 'dediya', 'chuka diya', 'kharida'
];

const INVESTMENT_KEYWORDS = ['invested', 'investment', 'sip', 'lagaye', 'lagaya'];

/**
 * Parse date expressions like "aaj", "today", "kal", "yesterday", "parso"
 */
function extractDate(tokens, lower) {
  const now = new Date();
  let dateObj = new Date(now);
  let matchedTokens = [];

  // Yesterday / Kal (check if past tense words present)
  if (tokens.includes('yesterday') || lower.includes('beeta kal') || (tokens.includes('kal') && (lower.includes('aaye') || lower.includes('diye') || lower.includes('mila') || lower.includes('gaya') || lower.includes('tha')))) {
    dateObj.setDate(now.getDate() - 1);
    matchedTokens.push('yesterday', 'kal');
  } else if (tokens.includes('today') || tokens.includes('aaj')) {
    matchedTokens.push('today', 'aaj');
  } else if (tokens.includes('parso') || tokens.includes('day before yesterday')) {
    dateObj.setDate(now.getDate() - 2);
    matchedTokens.push('parso');
  }

  // ISO string formatted with Indian timezone considerations (local midnight or current time)
  return {
    date: dateObj.toISOString(),
    matchedTokens
  };
}

/**
 * Parse a quick-entry command string.
 * @param {string} input  - Raw user input, e.g. "50 chai PhonePe"
 * @param {Array}  accounts  - Array of account objects { id, name, type }
 * @param {Array}  categories - Array of category objects { id, name, type, keywords }
 * @returns {Object} Parsed transaction data
 */
export function parseEntry(input, accounts = [], categories = []) {
  if (!input || !input.trim()) return null;

  // Auto-detect bank SMS format
  if (/(?:debited|credited|avail(?:able)?\s*bal|a\/c[:\s*xX]+|acct\b|upi\s*ref|vpa[:\s])/i.test(input)) {
    const smsParsed = parseBankSMS(input, accounts, categories);
    if (smsParsed && smsParsed.amount) {
      return smsParsed;
    }
  }

  const raw = input.trim();
  const lower = raw.toLowerCase();
  const tokens = tokenize(lower);

  // 1. Extract Date (Today, Kal, Yesterday, etc.)
  const dateInfo = extractDate(tokens, lower);
  let workingTokens = tokens.filter(t => !dateInfo.matchedTokens.includes(t));

  // 2. Extract amount
  const amountInfo = extractAmount(raw, workingTokens);
  if (!amountInfo.amount) {
    return { error: 'Could not find an amount in your entry.', raw };
  }

  // 3. Remove amount tokens from working set
  workingTokens = workingTokens.filter((_, i) => !amountInfo.usedIndices.has(i));
  let workingLower = workingTokens.join(' ');

  // 4. Detect transaction type (Expense vs Income vs Transfer)
  let type = 'expense';
  let fromAccount = null, toAccount = null;
  let description = '';
  let categoryMatch = null;

  // Check for transfer pattern
  const transferResult = detectTransfer(workingLower, workingTokens, accounts);
  if (transferResult) {
    type = 'transfer';
    fromAccount = transferResult.from;
    toAccount = transferResult.to;
    description = `Transfer from ${fromAccount?.name || '?'} to ${toAccount?.name || '?'}`;
    workingTokens = transferResult.remainingTokens;
  }

  // Check for income pattern
  let detectedIncomeKeyword = null;
  if (type !== 'transfer') {
    const incomeResult = detectIncome(workingLower, workingTokens);
    if (incomeResult) {
      type = 'income';
      detectedIncomeKeyword = incomeResult.keyword;
      workingTokens = incomeResult.remainingTokens;
    } else {
      // Check for explicit expense keywords to clean up description tokens
      const expenseResult = detectExpense(workingLower, workingTokens);
      if (expenseResult) {
        type = 'expense';
        workingTokens = expenseResult.remainingTokens;
      }
    }
  }

  // 5. Match account (for non-transfer types, find the payment account)
  let accountMatch = null;
  if (type !== 'transfer') {
    const accResult = matchAccount(workingTokens, accounts);
    if (accResult) {
      accountMatch = accResult.account;
      workingTokens = accResult.remainingTokens;
    }
  }

  // 6. Match category
  if (type !== 'transfer') {
    const relevantCats = categories.filter(c => c.type === type);
    const catResult = matchCategory(workingTokens, relevantCats);
    if (catResult) {
      categoryMatch = catResult.category;
      workingTokens = catResult.remainingTokens;
    } else if (detectedIncomeKeyword) {
      // If income keyword was also a category like 'salary', match it
      const fallbackCat = relevantCats.find(c => c.name.toLowerCase() === detectedIncomeKeyword.toLowerCase() || (c.keywords && c.keywords.toLowerCase().includes(detectedIncomeKeyword.toLowerCase())));
      if (fallbackCat) {
        categoryMatch = fallbackCat;
      }
    }
  }

  // Common Hindi / Hinglish and English filler stop words
  const stopWords = [
    'from', 'to', 'in', 'on', 'for', 'the', 'a', 'an', 'of', 'my', 'and', 'with',
    'rupees', 'rs', 'rupee', 'inr', 'rupaye', 'rupiye', 'rupya', 'ka', 'ke', 'ki', 'ko',
    'mein', 'me', 'se', 'par', 'diye', 'diya', 'aaye', 'aaya', 'mile', 'mila', 'kharch',
    'kharcha', 'bheja', 'bheje', 'hua', 'hue', 'tha', 'thi'
  ];

  // 7. Remaining tokens become description
  const descTokens = workingTokens.filter(t =>
    t.length > 1 && !stopWords.includes(t)
  );

  if (!description) {
    description = descTokens.length > 0 ? capitalizeFirst(descTokens.join(' ')) : (categoryMatch?.name || '');
  }

  // 8. Build result
  const result = {
    type,
    amount: amountInfo.amount,
    description,
    categoryId: categoryMatch?.id || null,
    categoryName: categoryMatch?.name || null,
    accountId: type === 'transfer' ? (fromAccount?.id || null) : (accountMatch?.id || null),
    accountName: type === 'transfer' ? (fromAccount?.name || null) : (accountMatch?.name || null),
    toAccountId: toAccount?.id || null,
    toAccountName: toAccount?.name || null,
    date: dateInfo.date,
    confidence: calculateConfidence(amountInfo.amount, accountMatch || fromAccount, categoryMatch, type),
    raw,
    needsClarification: [],
  };

  // Flag missing critical fields
  if (!result.accountId && type !== 'transfer') {
    result.needsClarification.push('account');
  }
  if (type === 'transfer' && (!result.accountId || !result.toAccountId)) {
    result.needsClarification.push('transfer_accounts');
  }

  return result;
}

// ── Tokenization ──────────────────────────────────────────────────────

function tokenize(str) {
  return str
    .replace(/[,₹$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(t => t.length > 0);
}

// ── Amount Extraction ─────────────────────────────────────────────────

function extractAmount(raw, tokens) {
  const usedIndices = new Set();

  // Pattern: "₹50", "Rs.50", "Rs 50", "50 rupees", "50", "5,000", "5000"
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Direct number
    const num = parseNumber(token);
    if (num > 0) {
      usedIndices.add(i);
      // Check if next token is "k", "hazaar", "thousand", or "lakh" for multipliers
      if (i + 1 < tokens.length) {
        const next = tokens[i + 1];
        if (next === 'k' || next === 'thousand' || next === 'hazaar' || next === 'hazar') {
          usedIndices.add(i + 1);
          return { amount: num * 1000, usedIndices };
        }
        if (next === 'lakh' || next === 'lac' || next === 'lakhs') {
          usedIndices.add(i + 1);
          return { amount: num * 100000, usedIndices };
        }
        if (next === 'crore' || next === 'cr') {
          usedIndices.add(i + 1);
          return { amount: num * 10000000, usedIndices };
        }
        if (next === 'sau' || next === 'hundred') {
          usedIndices.add(i + 1);
          return { amount: num * 100, usedIndices };
        }
      }
      // Check if previous token is "rs", "rs.", "rupaye", "₹"
      if (i > 0 && ['rs', 'rs.', 'rupaye', 'rupiye', 'rupees', 'inr'].includes(tokens[i - 1])) {
        usedIndices.add(i - 1);
      }
      return { amount: num, usedIndices };
    }

    // "rupees" / "rupaye" after checking if previous was a number
    if (['rupees', 'rupee', 'rs', 'rs.', 'inr', 'rupaye', 'rupiye', 'rupya'].includes(token)) {
      usedIndices.add(i);
      if (i + 1 < tokens.length) {
        const nextNum = parseNumber(tokens[i + 1]);
        if (nextNum > 0) {
          usedIndices.add(i + 1);
          if (i + 2 < tokens.length && ['hazaar', 'hazar', 'thousand', 'k'].includes(tokens[i + 2])) {
            usedIndices.add(i + 2);
            return { amount: nextNum * 1000, usedIndices };
          }
          return { amount: nextNum, usedIndices };
        }
      }
    }
  }

  return { amount: null, usedIndices };
}

function parseNumber(str) {
  // Support Hindi / Hinglish number words
  const wordsMap = {
    'sau': 100,
    'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
    'panch': 5, 'che': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10
  };
  if (wordsMap[str]) return wordsMap[str];

  // Remove commas and try to parse
  const cleaned = str.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── Transfer Detection ────────────────────────────────────────────────

function detectTransfer(lower, tokens, accounts) {
  // Patterns:
  //   "transferred X from A to B"
  //   "transfer from A to B"
  //   "moved X from A to B"
  //   "X from A to B" (with "to" keyword)
  //   "A to B" (simple transfer)

  const hasTransferKeyword = TRANSFER_KEYWORDS.some(k => lower.includes(k));

  // Also detect "from ... to ..." pattern even without transfer keyword
  const fromIdx = tokens.indexOf('from');
  const toIdx = tokens.indexOf('to');

  if (!hasTransferKeyword && (fromIdx === -1 || toIdx === -1)) return null;

  // Try to find "from X to Y" pattern
  if (fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx) {
    const fromTokens = tokens.slice(fromIdx + 1, toIdx);
    const toTokens = tokens.slice(toIdx + 1);

    const fromAcc = findAccountByTokens(fromTokens, accounts);
    const toAcc = findAccountByTokens(toTokens, accounts);

    if (fromAcc || toAcc) {
      const remaining = tokens.slice(0, fromIdx).filter(t => !TRANSFER_KEYWORDS.includes(t));
      return { from: fromAcc, to: toAcc, remainingTokens: remaining };
    }
  }

  // Try "transferred/moved ACCOUNT to ACCOUNT" pattern
  if (hasTransferKeyword && toIdx !== -1) {
    const kwIdx = tokens.findIndex(t => TRANSFER_KEYWORDS.includes(t));
    const beforeTo = tokens.slice(kwIdx + 1, toIdx);
    const afterTo = tokens.slice(toIdx + 1);

    const fromAcc = findAccountByTokens(beforeTo, accounts);
    const toAcc = findAccountByTokens(afterTo, accounts);

    if (fromAcc || toAcc) {
      const remaining = tokens.slice(0, kwIdx);
      return { from: fromAcc, to: toAcc, remainingTokens: remaining };
    }
  }

  // Simple "X to Y" where both are accounts
  if (toIdx !== -1 && hasTransferKeyword) {
    const before = tokens.filter(t => !TRANSFER_KEYWORDS.includes(t));
    const bToIdx = before.indexOf('to');
    if (bToIdx !== -1) {
      const fromAcc = findAccountByTokens(before.slice(0, bToIdx), accounts);
      const toAcc = findAccountByTokens(before.slice(bToIdx + 1), accounts);
      if (fromAcc && toAcc) {
        return { from: fromAcc, to: toAcc, remainingTokens: [] };
      }
    }
  }

  return null;
}

// ── Income Detection ──────────────────────────────────────────────────

function detectIncome(lower, tokens) {
  for (const keyword of INCOME_KEYWORDS) {
    if (lower.includes(keyword)) {
      const kwTokens = keyword.split(' ');
      const remaining = tokens.filter(t => !kwTokens.includes(t));
      return { keyword, remainingTokens: remaining };
    }
  }
  return null;
}

function detectExpense(lower, tokens) {
  for (const keyword of EXPENSE_KEYWORDS) {
    if (lower.includes(keyword)) {
      const kwTokens = keyword.split(' ');
      const remaining = tokens.filter(t => !kwTokens.includes(t));
      return { keyword, remainingTokens: remaining };
    }
  }
  return null;
}

// ── Account Matching ──────────────────────────────────────────────────

function matchAccount(tokens, accounts) {
  if (!accounts.length || !tokens.length) return null;

  // Try matching from the end (account name is usually last)
  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    const candidateTokens = tokens.slice(-len);
    const candidate = candidateTokens.join(' ');
    const acc = findAccountByName(candidate, accounts);
    if (acc) {
      return { account: acc, remainingTokens: tokens.slice(0, -len) };
    }
  }

  // Try matching from anywhere
  for (const token of tokens) {
    const acc = findAccountByName(token, accounts);
    if (acc) {
      return { account: acc, remainingTokens: tokens.filter(t => t !== token) };
    }
  }

  return null;
}

function findAccountByTokens(tokens, accounts) {
  if (!tokens.length) return null;
  const combined = tokens.join(' ');
  return findAccountByName(combined, accounts) || findAccountByName(tokens[0], accounts);
}

function findAccountByName(name, accounts) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  // Exact match
  let match = accounts.find(a => a.name.toLowerCase() === lower);
  if (match) return match;

  // Starts with
  match = accounts.find(a => a.name.toLowerCase().startsWith(lower));
  if (match) return match;

  // Contains
  match = accounts.find(a => a.name.toLowerCase().includes(lower));
  if (match) return match;

  // Reverse contains (account name is substring of input)
  match = accounts.find(a => lower.includes(a.name.toLowerCase()));
  if (match) return match;

  // Abbreviation matching (HDFC → HDFC Savings Account)
  match = accounts.find(a => {
    const words = a.name.split(/\s+/);
    const abbr = words.map(w => w[0]).join('').toLowerCase();
    return abbr === lower || words[0].toLowerCase() === lower;
  });

  // Match synonyms like "cashbox" -> "Cash in Hand", "bank" -> first bank account
  if (lower === 'cashbox' || lower === 'cash' || lower === 'wallet' || lower === 'galla') {
    match = accounts.find(a => a.type === 'cash' || a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('wallet'));
    if (match) return match;
  }
  if (lower === 'bank') {
    match = accounts.find(a => a.type === 'bank' || a.name.toLowerCase().includes('bank'));
    if (match) return match;
  }

  return match || null;
}

// ── Category Matching ─────────────────────────────────────────────────

function matchCategory(tokens, categories) {
  if (!tokens.length || !categories.length) return null;

  let bestMatch = null;
  let bestScore = 0;
  let matchedTokens = [];

  for (const cat of categories) {
    const keywords = (cat.keywords || '').toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
    const catNameLower = cat.name.toLowerCase();

    for (const token of tokens) {
      // Direct keyword match
      if (keywords.includes(token)) {
        const score = 3;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = cat;
          matchedTokens = [token];
        }
      }

      // Partial keyword match
      const partialKw = keywords.find(k => k.includes(token) || token.includes(k));
      if (partialKw && !bestMatch) {
        bestScore = 1;
        bestMatch = cat;
        matchedTokens = [token];
      }

      // Category name match
      if (catNameLower.includes(token) || token.includes(catNameLower.split(' ')[0]?.toLowerCase())) {
        const score = 2;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = cat;
          matchedTokens = [token];
        }
      }
    }
  }

  if (bestMatch) {
    return {
      category: bestMatch,
      remainingTokens: tokens.filter(t => !matchedTokens.includes(t)),
    };
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function calculateConfidence(amount, account, category, type) {
  let score = 0;
  if (amount) score += 0.3;
  if (account) score += 0.3;
  if (category || type === 'transfer') score += 0.2;
  if (type) score += 0.2;
  return Math.min(score, 1);
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Bank SMS Parser ───────────────────────────────────────────────────

export function parseBankSMS(text, accounts = [], categories = []) {
  if (!text || !text.trim()) return null;
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. Detect debit vs credit
  let type = 'expense';
  if (/credit(?:ed)?|received|deposit(?:ed)?|refund|cashback/i.test(raw)) {
    type = 'income';
  } else if (/debit(?:ed)?|paid|spent|sent|withdrawn|purchase/i.test(raw)) {
    type = 'expense';
  }

  // 2. Extract Amount
  let amount = null;
  const amtMatch = raw.match(/(?:(?:rs\.?|inr|₹)\s*|\bamount\s*(?:of\s*)?)([0-9,]+(?:\.[0-9]{1,2})?)/i) ||
                   raw.match(/([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:rs|inr|rupees)/i);
  if (amtMatch) {
    amount = parseFloat(amtMatch[1].replace(/,/g, ''));
  }

  // 3. Extract Payee / Merchant / Description
  let merchant = '';
  const payeeMatch = raw.match(/(?:to|at|info[:\s]+|towards|vpa[:\s]+|for)\s+([A-Za-z0-9\s&._'-]+?)(?:\s+(?:on|via|ref|bal|using|thru|dated|avl|\.|$))/i);
  if (payeeMatch) {
    merchant = payeeMatch[1].trim();
  }

  // 4. Extract Account / Card last digits
  let matchedAccount = null;
  const acctMatch = raw.match(/(?:a\/c|acct|account|card)(?:\s+(?:no|ending|is))?\s*[:*xX]*([0-9]{3,4})/i);
  const acctDigits = acctMatch ? acctMatch[1] : null;

  if (acctDigits && accounts.length) {
    matchedAccount = accounts.find(a => (a.notes && a.notes.includes(acctDigits)) || a.name.includes(acctDigits));
  }
  if (!matchedAccount && accounts.length) {
    matchedAccount = accounts.find(a => {
      const firstWord = a.name.split(/\s+/)[0].toLowerCase();
      return lower.includes(firstWord);
    });
  }

  // 5. Match Category based on merchant or keywords
  let categoryMatch = null;
  const relevantCats = categories.filter(c => c.type === type);
  const searchStr = `${merchant} ${raw}`.toLowerCase();
  for (const cat of relevantCats) {
    const kws = (cat.keywords || '').toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
    if (kws.some(kw => searchStr.includes(kw))) {
      categoryMatch = cat;
      break;
    }
  }

  // 6. Remaining balance
  let remainingBalance = null;
  const balMatch = raw.match(/(?:bal(?:ance)?|avl\s*bal|avail\s*bal)[:\s]*(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (balMatch) {
    remainingBalance = parseFloat(balMatch[1].replace(/,/g, ''));
  }

  // 7. Reference number
  let refNumber = null;
  const refMatch = raw.match(/(?:ref(?:erence)?(?:\s*no\.?)?|txn\s*(?:id)?|rrn)[:\s]*([A-Za-z0-9]+)/i);
  if (refMatch) {
    refNumber = refMatch[1];
  }

  return {
    isSMS: true,
    type,
    amount: amount || 0,
    description: merchant ? (merchant.charAt(0).toUpperCase() + merchant.slice(1)) : (type === 'income' ? 'Income Received' : 'Bank Debit'),
    accountId: matchedAccount?.id || null,
    accountName: matchedAccount?.name || null,
    categoryId: categoryMatch?.id || null,
    categoryName: categoryMatch?.name || null,
    remainingBalance,
    refNumber,
    raw,
    date: new Date().toISOString()
  };
}
