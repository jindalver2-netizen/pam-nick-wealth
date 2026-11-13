/**
 * Supabase Cloud Synchronization Layer for PraNick Wealth
 * Enables real-time cross-device data sync between multiple mobiles and laptops.
 */
import { createClient } from '@supabase/supabase-js';
import { db, getSetting, setSetting } from './db.js';

let supabaseClient = null;

export async function getSupabaseConfig() {
  const url = (await getSetting('supabase_url')) || localStorage.getItem('supabase_url') || '';
  const key = (await getSetting('supabase_key')) || localStorage.getItem('supabase_key') || '';
  return { url: url.trim(), key: key.trim(), isConfigured: Boolean(url.trim() && key.trim()) };
}

export async function saveSupabaseConfig(url, key) {
  const cleanUrl = url.trim();
  const cleanKey = key.trim();
  await setSetting('supabase_url', cleanUrl);
  await setSetting('supabase_key', cleanKey);
  localStorage.setItem('supabase_url', cleanUrl);
  localStorage.setItem('supabase_key', cleanKey);
  
  if (cleanUrl && cleanKey) {
    supabaseClient = createClient(cleanUrl, cleanKey);
  } else {
    supabaseClient = null;
  }
}

export async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const config = await getSupabaseConfig();
  if (config.isConfigured) {
    try {
      supabaseClient = createClient(config.url, config.key);
      return supabaseClient;
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
    }
  }
  return null;
}

export async function testSupabaseConnection() {
  const client = await getSupabase();
  if (!client) return { success: false, message: 'Supabase URL or Key is not configured.' };
  try {
    const { data, error } = await client.from('users').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116') {
      return { success: false, message: error.message || 'Connection test failed.' };
    }
    return { success: true, message: 'Connected successfully to Supabase!' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Sync all local Dexie tables with Supabase Cloud
 */
export async function syncAllWithSupabase() {
  const client = await getSupabase();
  if (!client) return { success: false, message: 'Cloud sync not configured.' };

  const syncTables = [
    { name: 'users', dexie: db.users },
    { name: 'accounts', dexie: db.accounts },
    { name: 'transactions', dexie: db.transactions },
    { name: 'assets', dexie: db.assets },
    { name: 'valuations', dexie: db.valuations },
    { name: 'lend_borrow', dexie: db.lendBorrow },
    { name: 'liabilities', dexie: db.liabilities },
    { name: 'subscriptions', dexie: db.subscriptions },
    { name: 'insurance_policies', dexie: db.insurancePolicies }
  ];

  let syncedCount = 0;
  const errors = [];

  for (const table of syncTables) {
    try {
      // 1. Pull latest from Supabase
      const { data: cloudRecords, error: pullErr } = await client
        .from(table.name)
        .select('*');

      if (!pullErr && cloudRecords && cloudRecords.length > 0) {
        // Upsert into local Dexie
        await table.dexie.bulkPut(cloudRecords);
      }

      // 2. Push local changes to Supabase
      const localRecords = await table.dexie.toArray();
      if (localRecords.length > 0) {
        // Upsert to Supabase in batches of 50
        const batchSize = 50;
        for (let i = 0; i < localRecords.length; i += batchSize) {
          const batch = localRecords.slice(i, i + batchSize);
          const { error: pushErr } = await client
            .from(table.name)
            .upsert(batch, { onConflict: 'id' });
          if (pushErr) {
            console.warn(`Sync push warning for ${table.name}:`, pushErr.message);
          }
        }
      }
      syncedCount++;
    } catch (tblErr) {
      console.warn(`Sync table error for ${table.name}:`, tblErr);
      errors.push(`${table.name}: ${tblErr.message}`);
    }
  }

  const now = new Date().toISOString();
  await setSetting('last_cloud_sync_time', now);

  if (errors.length > 0) {
    return { success: false, message: `Synced with warnings: ${errors.join('; ')}` };
  }
  return { success: true, message: 'All devices synchronized with Supabase!' };
}

/**
 * Returns clean SQL to create the required tables in Supabase SQL editor
 */
export function getSupabaseSetupSQL() {
  return `-- ========================================================
-- PraNick Wealth Agent: Supabase Cross-Device Sync Schema
-- Run this once in your Supabase project's SQL Editor
-- ========================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Table
create table if not exists users (
  id bigint primary key,
  username text,
  name text,
  email text,
  phone text,
  role text default 'user',
  status text default 'active',
  pin text default '1234',
  avatar text default '👸',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Accounts Table
create table if not exists accounts (
  id bigint primary key,
  user_id bigint,
  name text not null,
  type text not null,
  icon text,
  opening_balance numeric default 0,
  opening_balance_date text,
  notes text,
  is_active int default 1,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Transactions Table
create table if not exists transactions (
  id bigint primary key,
  user_id bigint,
  type text not null,
  amount numeric not null,
  date text not null,
  time text,
  category_id bigint,
  account_id bigint,
  to_account_id bigint,
  description text,
  notes text,
  tags text,
  is_deleted int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Assets & Investments Table
create table if not exists assets (
  id bigint primary key,
  user_id bigint,
  name text not null,
  category text,
  type text not null,
  invested_amount numeric default 0,
  current_value numeric default 0,
  quantity numeric,
  unit text,
  institution text,
  folio_number text,
  purchase_date text,
  last_valuation_date text,
  notes text,
  is_physical int default 0,
  include_in_wealth int default 1,
  show_on_dashboard int default 1,
  valuation_status text,
  is_active int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Valuations Table
create table if not exists valuations (
  id bigint primary key,
  user_id bigint,
  asset_id bigint,
  value numeric not null,
  date text not null,
  notes text,
  valuation_type text,
  created_at timestamptz default now()
);

-- 6. Lending & Borrowing Table
create table if not exists lend_borrow (
  id bigint primary key,
  user_id bigint,
  type text not null,
  person_name text not null,
  person_phone text,
  amount numeric not null,
  outstanding_amount numeric not null,
  date text not null,
  due_date text,
  account_id bigint,
  notes text,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. Liabilities & Loans Table
create table if not exists liabilities (
  id bigint primary key,
  user_id bigint,
  lender_name text not null,
  type text not null,
  original_amount numeric not null,
  current_outstanding numeric not null,
  interest_rate numeric,
  emi_amount numeric,
  start_date text,
  end_date text,
  next_due_date text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 8. Subscriptions Table
create table if not exists subscriptions (
  id bigint primary key,
  user_id bigint,
  name text not null,
  company text,
  amount numeric not null,
  billing_frequency text,
  next_due_date text,
  account_id bigint,
  status text default 'active',
  auto_renewal int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 9. Insurance Policies Table
create table if not exists insurance_policies (
  id bigint primary key,
  user_id bigint,
  provider text not null,
  policy_name text not null,
  policy_type text not null,
  policy_number text,
  premium_amount numeric not null,
  payment_frequency text,
  next_renewal_date text,
  sum_insured numeric,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable public access for anon key
alter table users enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table assets enable row level security;
alter table valuations enable row level security;
alter table lend_borrow enable row level security;
alter table liabilities enable row level security;
alter table subscriptions enable row level security;
alter table insurance_policies enable row level security;

create policy "Allow all operations for anon" on users for all using (true) with check (true);
create policy "Allow all operations for anon" on accounts for all using (true) with check (true);
create policy "Allow all operations for anon" on transactions for all using (true) with check (true);
create policy "Allow all operations for anon" on assets for all using (true) with check (true);
create policy "Allow all operations for anon" on valuations for all using (true) with check (true);
create policy "Allow all operations for anon" on lend_borrow for all using (true) with check (true);
create policy "Allow all operations for anon" on liabilities for all using (true) with check (true);
create policy "Allow all operations for anon" on subscriptions for all using (true) with check (true);
create policy "Allow all operations for anon" on insurance_policies for all using (true) with check (true);
`;
}
