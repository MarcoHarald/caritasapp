export type Shop = {
  id: string;
  owner_user_id: string;
  name: string;
  currency: "EUR";
  timezone: string;
  created_at: string;
};

export type VolunteerHour = {
  id: string;
  shop_id: string;
  volunteer_name: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type CashEntryType =
  | "sale"
  | "expense"
  | "float_in"
  | "float_out"
  | "deposit_to_bank"
  | "adjustment";

export type Direction = "in" | "out";

export type CashEntry = {
  id: string;
  shop_id: string;
  entry_date: string;
  type: CashEntryType;
  direction: Direction;
  category: string | null;
  substore: string | null;
  amount: number;
  description: string | null;
  created_by: string;
  created_at: string;
};

export type BankEntryType =
  | "cash_deposit"
  | "withdrawal"
  | "bank_fee"
  | "adjustment"
  | "other";

export type BankLedgerEntry = {
  id: string;
  shop_id: string;
  entry_date: string;
  type: BankEntryType;
  direction: Direction;
  amount: number;
  reference: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
};

export type Receipt = {
  id: string;
  shop_id: string;
  entity_type: "cash_entry" | "bank_entry";
  entity_id: string;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
};
