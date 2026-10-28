/** تایپ‌های مشترک فرانت‌اند — مطابق پاسخ APIها */

export interface AccountDTO {
  id: string
  name: string
  type: "CASH" | "BANK" | "CARD" | "SAVINGS" | "OTHER"
  color: string
  icon: string
  initialBalance: number
  isArchived: boolean
  sortOrder: number
  createdAt: string
  balance: number
  monthIn: number
  monthOut: number
  transactionCount: number
}

export interface CategoryDTO {
  id: string
  name: string
  type: "INCOME" | "EXPENSE"
  color: string
  icon: string
  createdAt: string
  transactionCount: number
  budgetCount: number
}

export interface TxAccount {
  id: string
  name: string
  color: string
  icon: string
}

export interface TransactionDTO {
  id: string
  type: "INCOME" | "EXPENSE" | "TRANSFER"
  amount: number
  accountId: string
  account?: TxAccount | null
  toAccountId?: string | null
  toAccount?: TxAccount | null
  categoryId?: string | null
  category?: (TxAccount & { type: string }) | null
  date: string
  note?: string | null
  recurringRuleId?: string | null
  recurringRule?: { id: string; title: string } | null
  debtId?: string | null
  createdAt: string
}

export interface RangeTotalsDTO {
  income: number
  expense: number
  profit: number
  count: number
}

export interface TransactionsResponseDTO {
  transactions: TransactionDTO[]
  total: number
  page: number
  pageSize: number
  totals: RangeTotalsDTO
}

export interface BudgetDTO {
  id: string
  categoryId: string
  category: CategoryDTO
  amount: number
  monthJalali: string
  alertThreshold: number
  spent: number
  remaining: number
  percent: number
}

export interface BudgetsResponseDTO {
  monthJalali: string
  monthLabel: string
  budgets: BudgetDTO[]
  summary: {
    totalAmount: number
    totalSpent: number
    totalRemaining: number
    percent: number
  }
}

export interface RecurringDTO {
  id: string
  title: string
  type: "INCOME" | "EXPENSE"
  amount: number
  accountId: string
  account: TxAccount
  categoryId: string | null
  category: TxAccount | null
  frequency: "DAILY" | "WEEKLY" | "MONTHLY_JALALI"
  frequencyLabel: string
  interval: number
  dayOfMonth: number | null
  nextRunAt: string
  lastRunAt: string | null
  isActive: boolean
  createdAt: string
  runCount: number
  generated: TransactionDTO[]
}

export interface DebtDTO {
  id: string
  direction: "I_OWE" | "OWED_TO_ME"
  person: string
  amount: number
  settledAmount: number
  dueDate: string | null
  note: string | null
  isSettled: boolean
  createdAt: string
  remaining: number
  settledTransactions: { id: string; amount: number; date: string; note: string | null; accountId: string }[]
}

export interface DashboardDTO {
  totalBalance: number
  accountsCount: number
  month: {
    key: string
    label: string
    income: number
    expense: number
    profit: number
    count: number
    prevIncome: number
    prevExpense: number
    prevProfit: number
  }
  series: { key: string; label: string; income: number; expense: number }[]
  expenseByCategory: {
    categoryId: string
    name: string
    color: string
    icon: string
    amount: number
    percent: number
  }[]
  lastTransactions: TransactionDTO[]
  budgetsAtRisk: {
    id: string
    categoryId: string
    categoryName: string
    categoryColor: string
    categoryIcon: string
    amount: number
    spent: number
    percent: number
    alertThreshold: number
  }[]
  debtsSummary: { iOweRemaining: number; owedToMeRemaining: number }
}

export interface ReportDTO {
  range: { from: string; to: string; days: number }
  totals: RangeTotalsDTO
  previous: RangeTotalsDTO
  series: { key: string; label: string; income: number; expense: number }[]
  byCategory: {
    categoryId: string
    name: string
    color: string
    icon: string
    amount: number
    count: number
    percent: number
  }[]
}

export interface AlertRuleDTO {
  id: string
  type: "BUDGET_THRESHOLD" | "LOW_BALANCE" | "DEBT_DUE" | "RECURRING_RUN"
  label: string
  accountId: string | null
  accountName: string | null
  threshold: number | null
  isActive: boolean
  lastFiredAt: string | null
  createdAt: string
}

export interface SettingsDTO {
  botTokenMasked: string | null
  hasBotToken: boolean
  botTokenSource: "db" | "env" | null
  adminChatId: string | null
  hasAdminChatId: boolean
  adminChatIdSource: "db" | "env" | null
  miniAppUrl: string
  miniAppUrlSource: "db" | "env" | null
  lowBalanceDefault: number
}
