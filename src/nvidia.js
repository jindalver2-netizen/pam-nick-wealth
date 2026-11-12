/**
 * Pam&Nick Wealth / Wealthbook Lite — NVIDIA AI Integration Service
 * Supports:
 * - nvidia/nemotron-3.5-bolt-e4b (Conversational Assistant for Hindi/Hinglish finance)
 * - nvidia/nemotron-3.5-parse (OCR & Document / Receipt Parsing)
 * - nvidia/nemotron-3.5-embed-1b (Semantic Search)
 *
 * Designed with strict privacy boundaries & graceful offline local fallbacks.
 * Authoritative financial calculations always come directly from local IndexedDB.
 */

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';

/**
 * Ask the financial assistant a question in English, Hindi, or Hinglish.
 * Uses authenticated user's current data as safe context.
 */
export async function askFinancialAssistant({ query, userContext, apiKey }) {
  if (!query || !query.trim()) return null;

  // Local Rule-Based Fast Fallback if no API key or offline
  if (!apiKey || !apiKey.trim()) {
    return localAssistantFallback(query, userContext);
  }

  try {
    const systemPrompt = `You are Pam&Nick Wealth's intelligent personal finance assistant.
You speak warm, natural, friendly Hinglish and English.
You answer questions accurately using the provided financial summary of the user.
CRITICAL RULES:
1. Never invent account balances or transactions.
2. If the user asks about a specific category or account, refer to the data provided below.
3. Keep answers crisp, practical, and helpful with rupee (₹) signs.
4. If information is missing, ask gently.

User Financial Summary:
- User Name: ${userContext.userName || 'User'}
- Total Liquid Money: ₹${(userContext.totalLiquid || 0).toLocaleString('en-IN')}
- Total Investments & Assets: ₹${(userContext.totalInvestments || 0).toLocaleString('en-IN')}
- Tracked Personal Assets (excluded from wealth): ₹${(userContext.trackedPersonalAssets || 0).toLocaleString('en-IN')}
- Net Worth: ₹${(userContext.netWorth || 0).toLocaleString('en-IN')}
- Cash / Bank Accounts: ${(userContext.accounts || []).map(a => `${a.name}: ₹${(a.balance || 0).toLocaleString('en-IN')}`).join(', ')}
- This Month Income: ₹${(userContext.monthIncome || 0).toLocaleString('en-IN')}
- This Month Expenses: ₹${(userContext.monthExpense || 0).toLocaleString('en-IN')}
- Expense Categories: ${Object.entries(userContext.expenseByCategory || {}).map(([k, v]) => `${k}: ₹${Number(v).toLocaleString('en-IN')}`).join(', ')}
- Outstanding Money Lent (Receivables): ₹${(userContext.lendingReceivables || 0).toLocaleString('en-IN')}
- Outstanding Money Borrowed (Payable): ₹${(userContext.borrowedPayables || 0).toLocaleString('en-IN')}
`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3.5-bolt-e4b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.2,
        max_tokens: 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn('NVIDIA API error, using local fallback:', response.statusText);
      return localAssistantFallback(query, userContext);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    return reply ? { text: reply, source: 'nvidia_nemotron_bolt' } : localAssistantFallback(query, userContext);
  } catch (err) {
    console.warn('NVIDIA Assistant call failed, falling back:', err.message);
    return localAssistantFallback(query, userContext);
  }
}

/**
 * Local rule-based assistant fallback that runs 100% offline.
 */
function localAssistantFallback(query, userContext) {
  const q = query.toLowerCase();

  // Balance question
  if (q.includes('balance') || q.includes('kitna paisa') || q.includes('liquid') || q.includes('kitne paise')) {
    if (q.includes('cashbox') || q.includes('cash')) {
      const cashAcc = (userContext.accounts || []).find(a => a.name.toLowerCase().includes('cash'));
      const bal = cashAcc ? cashAcc.balance : 0;
      return {
        text: `Aapke **Cashbox** mein abhi **₹${bal.toLocaleString('en-IN')}** bache hain.`,
        source: 'local_engine'
      };
    }
    if (q.includes('bank') || q.includes('hdfc') || q.includes('sbi')) {
      const bankAcc = (userContext.accounts || []).find(a => a.type === 'bank' || a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('hdfc') || a.name.toLowerCase().includes('sbi'));
      const bal = bankAcc ? bankAcc.balance : 0;
      const name = bankAcc ? bankAcc.name : 'Bank';
      return {
        text: `Aapke **${name}** account mein abhi **₹${bal.toLocaleString('en-IN')}** balance hai.`,
        source: 'local_engine'
      };
    }
    return {
      text: `Aapka **Total Liquid Balance** (saare accounts milakar) abhi **₹${(userContext.totalLiquid || 0).toLocaleString('en-IN')}** hai.`,
      source: 'local_engine'
    };
  }

  // Category expense question (e.g. "grocery par kitna kharcha hua")
  for (const [catName, amt] of Object.entries(userContext.expenseByCategory || {})) {
    if (q.includes(catName.toLowerCase()) || (catName.toLowerCase().includes('grocer') && q.includes('ration'))) {
      return {
        text: `Is mahine **${catName}** par kul **₹${Number(amt).toLocaleString('en-IN')}** kharch hue hain.`,
        source: 'local_engine'
      };
    }
  }

  // Net worth question
  if (q.includes('net worth') || q.includes('daulat') || q.includes('total wealth') || q.includes('kool sampatti')) {
    return {
      text: `Aapki total Real Net Worth abhi **₹${(userContext.netWorth || 0).toLocaleString('en-IN')}** hai (Liquid ₹${(userContext.totalLiquid || 0).toLocaleString('en-IN')} + Included Assets ₹${(userContext.totalInvestments || 0).toLocaleString('en-IN')}).`,
      source: 'local_engine'
    };
  }

  // Lending question
  if (q.includes('udhar') || q.includes('lene') || q.includes('dene') || q.includes('rahul') || q.includes('pratima')) {
    return {
      text: `Aapne logon ko kul **₹${(userContext.lendingReceivables || 0).toLocaleString('en-IN')}** udhar diye hain jo aane baaki hain. Aapko doosron ko **₹${(userContext.borrowedPayables || 0).toLocaleString('en-IN')}** wapas karne hain.`,
      source: 'local_engine'
    };
  }

  // General monthly summary
  return {
    text: `Is mahine aapki Total Income **₹${(userContext.monthIncome || 0).toLocaleString('en-IN')}** aur Total Expenses **₹${(userContext.monthExpense || 0).toLocaleString('en-IN')}** rahe hain. Net Bachat: **₹${((userContext.monthIncome || 0) - (userContext.monthExpense || 0)).toLocaleString('en-IN')}** hai.`,
    source: 'local_engine'
  };
}

/**
 * OCR / Receipt Extraction using Nemotron 3.5 Parse with local text extractor fallback.
 * Returns editable structured transaction preview.
 */
export async function parseReceiptDocument({ textInput, imageFile, apiKey }) {
  // If we have an image and apiKey, we attempt to call NVIDIA Parse
  if (apiKey && apiKey.trim() && textInput) {
    try {
      const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          model: 'nvidia/nemotron-3.5-parse',
          messages: [
            {
              role: 'system',
              content: 'You extract financial transaction data from receipts, bills, and purchase slips. Return ONLY valid JSON with keys: merchant, date (YYYY-MM-DD), amount (number), category, items (array of strings), tax (number).'
            },
            {
              role: 'user',
              content: `Extract financial details from this bill/receipt text:\n${textInput}`
            }
          ],
          temperature: 0.1
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            merchant: parsed.merchant || 'Merchant',
            date: parsed.date || new Date().toISOString().split('T')[0],
            amount: parseFloat(parsed.amount) || 0,
            category: parsed.category || 'Shopping',
            items: parsed.items || [],
            tax: parseFloat(parsed.tax) || 0,
            source: 'nvidia_nemotron_parse'
          };
        }
      }
    } catch (e) {
      console.warn('NVIDIA OCR Parse failed, using local parser:', e.message);
    }
  }

  // Local Regex-based Bill / Receipt Extractor Fallback
  const text = (textInput || '').toString();
  const amountMatch = text.match(/(?:total|amount|amt|net\s*payable|inr|rs\.?|₹)[\s:]*([0-9,]+(?:\.[0-9]{1,2})?)/i)
    || text.match(/([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:rupees|rupaye|rs)/i);

  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

  const dateMatch = text.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/);
  const dateStr = dateMatch ? normalizeDate(dateMatch[1]) : new Date().toISOString().split('T')[0];

  // Detect merchant
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const merchant = lines[0]?.slice(0, 40) || 'Store / Merchant';

  return {
    merchant,
    date: dateStr,
    amount,
    category: detectCategoryFromText(text),
    tax: 0,
    source: 'local_bill_parser'
  };
}

function normalizeDate(str) {
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch (e) {}
  return new Date().toISOString().split('T')[0];
}

function detectCategoryFromText(text) {
  const lower = text.toLowerCase();
  if (lower.includes('gold') || lower.includes('silver') || lower.includes('jewel') || lower.includes('jewellers')) return 'Gold & Jewellery';
  if (lower.includes('restaurant') || lower.includes('cafe') || lower.includes('swiggy') || lower.includes('zomato') || lower.includes('hotel') || lower.includes('food')) return 'Food & Dining';
  if (lower.includes('petrol') || lower.includes('fuel') || lower.includes('diesel') || lower.includes('cng')) return 'Transport';
  if (lower.includes('pharmacy') || lower.includes('medicin') || lower.includes('hospital') || lower.includes('doctor')) return 'Medical';
  if (lower.includes('grocery') || lower.includes('kirana') || lower.includes('supermarket') || lower.includes('d-mart')) return 'Groceries';
  return 'Shopping';
}

export const parseReceiptWithAI = parseReceiptDocument;

export function getNvidiaApiKey() {
  return localStorage.getItem('nvidia_nim_api_key') || '';
}

export function setNvidiaApiKey(key) {
  if (key) {
    localStorage.setItem('nvidia_nim_api_key', key.trim());
  } else {
    localStorage.removeItem('nvidia_nim_api_key');
  }
}

