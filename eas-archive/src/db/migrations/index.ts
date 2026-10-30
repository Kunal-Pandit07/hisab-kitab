export interface Migration { version: number; sql: string }

const cat = (id: string, name: string, kind: string, icon: string) =>
  `('${id}','${name}','${kind}','${icon}',1,datetime('now'))`;

const seed = [
  cat('inc_salary','Salary','income','briefcase-outline'),
  cat('inc_pocket','Pocket Money','income','wallet-outline'),
  cat('inc_business','Business','income','storefront-outline'),
  cat('inc_freelance','Freelancing','income','laptop-outline'),
  cat('inc_gift','Gift','income','gift-outline'),
  cat('inc_interest','Interest','income','trending-up-outline'),
  cat('inc_refund','Refund','income','return-down-back-outline'),
  cat('inc_other','Other Income','income','ellipse-outline'),
  cat('exp_food','Food','expense','restaurant-outline'),
  cat('exp_travel','Travel','expense','bus-outline'),
  cat('exp_shopping','Shopping','expense','bag-outline'),
  cat('exp_education','Education','expense','school-outline'),
  cat('exp_rent','Rent','expense','home-outline'),
  cat('exp_bills','Bills','expense','receipt-outline'),
  cat('exp_health','Health','expense','medkit-outline'),
  cat('exp_entertainment','Entertainment','expense','film-outline'),
  cat('exp_personal','Personal Care','expense','body-outline'),
  cat('exp_subs','Subscriptions','expense','repeat-outline'),
  cat('exp_other','Other Expense','expense','ellipse-outline'),
].join(',\n');

export const SEED_CATEGORIES_SQL = `INSERT INTO categories (id,name,kind,icon,is_default,created_at) VALUES
${seed};`;

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('cash','bank','upi','savings','custom')),
  opening_balance_paise INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  icon TEXT NOT NULL DEFAULT 'ellipse-outline',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  to_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id)
      OR (type <> 'transfer' AND to_account_id IS NULL))
);
CREATE INDEX idx_txn_occurred ON transactions(occurred_at DESC);
CREATE INDEX idx_txn_account ON transactions(account_id, occurred_at);
CREATE INDEX idx_txn_to_account ON transactions(to_account_id);
CREATE INDEX idx_txn_category ON transactions(category_id, type);
CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
INSERT INTO categories (id,name,kind,icon,is_default,created_at) VALUES
${seed};
`,
  },
  {
    version: 2,
    sql: `
CREATE TABLE savings_targets (
  id TEXT PRIMARY KEY NOT NULL,
  effective_from TEXT NOT NULL UNIQUE,            -- local date YYYY-MM-DD; history keeps old targets intact
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  created_at TEXT NOT NULL
);
CREATE TABLE no_spend_days (
  date TEXT PRIMARY KEY NOT NULL,                 -- only ever set by the user
  created_at TEXT NOT NULL
);
CREATE TABLE goals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  target_paise INTEGER NOT NULL CHECK (target_paise > 0),
  target_date TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Goal allocations are bookkeeping labels on money you already have. They never touch account balances.
CREATE TABLE goal_contributions (
  id TEXT PRIMARY KEY NOT NULL,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise <> 0),  -- negative = removed from goal
  note TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_goal_contrib_goal ON goal_contributions(goal_id, occurred_at);
CREATE TABLE budgets (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,  -- NULL = overall monthly budget
  limit_paise INTEGER NOT NULL CHECK (limit_paise > 0),
  thresholds TEXT NOT NULL DEFAULT '[50,75,90,100]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_budget_scope ON budgets(COALESCE(category_id, '__overall__'));
CREATE TABLE budget_alerts (
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                            -- YYYY-MM
  threshold INTEGER NOT NULL,
  fired_at TEXT NOT NULL,
  PRIMARY KEY (budget_id, period, threshold)       -- one alert per threshold per period
);
`,
  },
  {
    version: 3,
    sql: `
-- Udhaar principal lives here, NOT in transactions, so it can never leak into income/expense totals.
CREATE TABLE udhaar_records (
  id TEXT PRIMARY KEY NOT NULL,
  person_name TEXT NOT NULL CHECK (length(trim(person_name)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('lent','borrowed')),
  principal_paise INTEGER NOT NULL CHECK (principal_paise > 0),
  occurred_on TEXT NOT NULL,
  due_on TEXT,
  description TEXT NOT NULL DEFAULT '',
  contact TEXT,
  account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,  -- optional: where the money actually moved
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (due_on IS NULL OR due_on >= occurred_on)
);
CREATE TABLE udhaar_repayments (
  id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL REFERENCES udhaar_records(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  paid_on TEXT NOT NULL,
  note TEXT,
  account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_udhaar_due ON udhaar_records(due_on);
CREATE INDEX idx_udhaar_repay_record ON udhaar_repayments(record_id, paid_on);
CREATE TRIGGER trg_udhaar_repayment_cap BEFORE INSERT ON udhaar_repayments
BEGIN
  SELECT RAISE(ABORT, 'Repayment is more than the outstanding amount.')
  WHERE (SELECT COALESCE(SUM(amount_paise),0) FROM udhaar_repayments WHERE record_id = NEW.record_id) + NEW.amount_paise
        > (SELECT principal_paise FROM udhaar_records WHERE id = NEW.record_id);
END;
CREATE TRIGGER trg_udhaar_principal_floor BEFORE UPDATE OF principal_paise ON udhaar_records
BEGIN
  SELECT RAISE(ABORT, 'Amount cannot be less than what has already been repaid.')
  WHERE NEW.principal_paise < (SELECT COALESCE(SUM(amount_paise),0) FROM udhaar_repayments WHERE record_id = NEW.id);
END;
`,
  },
];

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1].version;
