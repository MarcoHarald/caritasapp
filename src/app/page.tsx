"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";
import type {
  BankEntryType,
  BankLedgerEntry,
  CashEntry,
  CashEntryType,
  CashSession,
  Direction,
  Receipt,
  Shop,
  VolunteerHour,
} from "@/lib/types";
import {
  computeHoursBetween,
  dateKeyInItaly,
  downloadCsv,
  formatEur,
  getTodayInItaly,
  localDateTimeDefault,
  sanitizeFileName,
  toCsv,
  toIsoStringFromLocal,
} from "@/lib/utils";

type Tab = "dashboard" | "volunteers" | "cash" | "bank" | "receipts" | "reports";

const tabs: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "volunteers", label: "Volunteer Hours" },
  { key: "cash", label: "Cash Ledger" },
  { key: "bank", label: "Bank Ledger" },
  { key: "receipts", label: "Receipts" },
  { key: "reports", label: "Reports" },
];

const cashEntryTypeOptions: CashEntryType[] = [
  "sale",
  "expense",
  "float_in",
  "float_out",
  "deposit_to_bank",
  "adjustment",
];

const bankEntryTypeOptions: BankEntryType[] = [
  "cash_deposit",
  "withdrawal",
  "bank_fee",
  "adjustment",
  "other",
];

function toNumber(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("it-IT", { timeZone: "Europe/Rome" });
}

function normalizeVolunteerHours(rows: unknown[]) {
  return rows.map((row) => {
    const typed = row as VolunteerHour;
    return {
      ...typed,
      hours: toNumber(typed.hours),
    };
  });
}

function normalizeCashSessions(rows: unknown[]) {
  return rows.map((row) => {
    const typed = row as CashSession;
    return {
      ...typed,
      opening_cash: toNumber(typed.opening_cash),
      closing_cash_counted:
        typed.closing_cash_counted === null ? null : toNumber(typed.closing_cash_counted),
    };
  });
}

function normalizeCashEntries(rows: unknown[]) {
  return rows.map((row) => {
    const typed = row as CashEntry;
    return {
      ...typed,
      amount: toNumber(typed.amount),
    };
  });
}

function normalizeBankEntries(rows: unknown[]) {
  return rows.map((row) => {
    const typed = row as BankLedgerEntry;
    return {
      ...typed,
      amount: toNumber(typed.amount),
    };
  });
}

export default function Home() {
  const configured = isSupabaseConfigured();
  const supabase = useMemo(
    () => (configured ? getSupabaseBrowserClient() : null),
    [configured],
  );

  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [workingAction, setWorkingAction] = useState("");

  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState("");

  const [volunteerHours, setVolunteerHours] = useState<VolunteerHour[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  const [bankEntries, setBankEntries] = useState<BankLedgerEntry[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptSignedUrls, setReceiptSignedUrls] = useState<Record<string, string>>({});
  const [shopDataLoading, setShopDataLoading] = useState(false);

  const [newShopName, setNewShopName] = useState("");

  const [volunteerName, setVolunteerName] = useState("");
  const [volunteerDate, setVolunteerDate] = useState(getTodayInItaly());
  const [volunteerStartTime, setVolunteerStartTime] = useState("09:00");
  const [volunteerEndTime, setVolunteerEndTime] = useState("13:00");
  const [volunteerNotes, setVolunteerNotes] = useState("");

  const [cashSessionDate, setCashSessionDate] = useState(getTodayInItaly());
  const [cashSessionOpening, setCashSessionOpening] = useState("0");
  const [cashSessionNotes, setCashSessionNotes] = useState("");

  const [cashEntrySessionId, setCashEntrySessionId] = useState("");
  const [cashEntryDateTime, setCashEntryDateTime] = useState(localDateTimeDefault());
  const [cashEntryType, setCashEntryType] = useState<CashEntryType>("sale");
  const [cashEntryDirection, setCashEntryDirection] = useState<Direction>("in");
  const [cashEntryCategory, setCashEntryCategory] = useState("");
  const [cashEntryAmount, setCashEntryAmount] = useState("");
  const [cashEntryDescription, setCashEntryDescription] = useState("");

  const [bankEntryDateTime, setBankEntryDateTime] = useState(localDateTimeDefault());
  const [bankEntryType, setBankEntryType] = useState<BankEntryType>("cash_deposit");
  const [bankEntryDirection, setBankEntryDirection] = useState<Direction>("in");
  const [bankEntryAmount, setBankEntryAmount] = useState("");
  const [bankEntryReference, setBankEntryReference] = useState("");
  const [bankEntryDescription, setBankEntryDescription] = useState("");

  const [receiptEntityType, setReceiptEntityType] = useState<"cash_entry" | "bank_entry">(
    "cash_entry",
  );
  const [receiptEntityId, setReceiptEntityId] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const user = session?.user ?? null;
  const activeShop = shops.find((shop) => shop.id === activeShopId) ?? null;

  const setFeedback = (message: string) => {
    setNotice(message);
    setError("");
  };

  const setFailure = (message: string) => {
    setError(message);
    setNotice("");
  };

  const loadShops = useCallback(async () => {
    if (!supabase || !user) {
      return;
    }

    const { data, error: queryError } = await supabase
      .from("shops")
      .select("*")
      .order("created_at", { ascending: false });

    if (queryError) {
      setFailure(`Failed to load shops: ${queryError.message}`);
      return;
    }

    const loaded = (data ?? []) as Shop[];
    setShops(loaded);

    setActiveShopId((current) => {
      if (current && loaded.some((shop) => shop.id === current)) {
        return current;
      }

      const storageKey = `caritas.activeShop.${user.id}`;
      const saved =
        typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
      if (saved && loaded.some((shop) => shop.id === saved)) {
        return saved;
      }

      return loaded[0]?.id ?? "";
    });
  }, [supabase, user]);

  const loadShopData = useCallback(async () => {
    if (!supabase || !activeShopId) {
      setVolunteerHours([]);
      setCashSessions([]);
      setCashEntries([]);
      setBankEntries([]);
      setReceipts([]);
      setReceiptSignedUrls({});
      return;
    }

    setShopDataLoading(true);

    const [volunteerResult, sessionResult, cashResult, bankResult, receiptResult] =
      await Promise.all([
        supabase
          .from("volunteer_hours")
          .select("*")
          .eq("shop_id", activeShopId)
          .order("work_date", { ascending: false }),
        supabase
          .from("cash_sessions")
          .select("*")
          .eq("shop_id", activeShopId)
          .order("session_date", { ascending: false }),
        supabase
          .from("cash_entries")
          .select("*")
          .eq("shop_id", activeShopId)
          .order("entry_date", { ascending: false })
          .limit(400),
        supabase
          .from("bank_ledger_entries")
          .select("*")
          .eq("shop_id", activeShopId)
          .order("entry_date", { ascending: false })
          .limit(400),
        supabase
          .from("receipts")
          .select("*")
          .eq("shop_id", activeShopId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    const firstError =
      volunteerResult.error ||
      sessionResult.error ||
      cashResult.error ||
      bankResult.error ||
      receiptResult.error;

    if (firstError) {
      setFailure(`Failed to load data: ${firstError.message}`);
      setShopDataLoading(false);
      return;
    }

    const normalizedVolunteer = normalizeVolunteerHours(volunteerResult.data ?? []);
    const normalizedSessions = normalizeCashSessions(sessionResult.data ?? []);
    const normalizedCashEntries = normalizeCashEntries(cashResult.data ?? []);
    const normalizedBankEntries = normalizeBankEntries(bankResult.data ?? []);

    setVolunteerHours(normalizedVolunteer);
    setCashSessions(normalizedSessions);
    setCashEntries(normalizedCashEntries);
    setBankEntries(normalizedBankEntries);
    setReceipts((receiptResult.data ?? []) as Receipt[]);

    setCashEntrySessionId((current) => {
      const hasCurrent = current && normalizedSessions.some((session) => session.id === current);
      if (hasCurrent) {
        return current;
      }

      const openSession = normalizedSessions.find((session) => !session.closed_at);
      return openSession?.id ?? normalizedSessions[0]?.id ?? "";
    });

    setShopDataLoading(false);
  }, [activeShopId, supabase]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) {
          return;
        }

        if (sessionError) {
          setFailure(`Failed to read session: ${sessionError.message}`);
        }

        setSession(data.session);
        setAuthLoading(false);
      })
      .catch((unexpectedError) => {
        if (!mounted) {
          return;
        }

        setFailure(
          unexpectedError instanceof Error
            ? unexpectedError.message
            : "Unexpected auth error",
        );
        setAuthLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user) {
      setShops([]);
      setActiveShopId("");
      return;
    }

    const fullName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : "";

    void supabase.from("profiles").upsert({
      id: user.id,
      full_name: fullName,
      email: user.email ?? "",
    });

    void loadShops();
  }, [loadShops, supabase, user]);

  useEffect(() => {
    if (!user || !activeShopId || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(`caritas.activeShop.${user.id}`, activeShopId);
  }, [activeShopId, user]);

  useEffect(() => {
    void loadShopData();
  }, [loadShopData]);

  useEffect(() => {
    const ids =
      receiptEntityType === "cash_entry"
        ? cashEntries.map((entry) => entry.id)
        : bankEntries.map((entry) => entry.id);

    if (!ids.includes(receiptEntityId)) {
      setReceiptEntityId(ids[0] ?? "");
    }
  }, [receiptEntityId, receiptEntityType, cashEntries, bankEntries]);

  useEffect(() => {
    const client = supabase;
    if (!client || receipts.length === 0) {
      setReceiptSignedUrls({});
      return;
    }

    let cancelled = false;

    async function generateSignedUrls() {
      if (!client) {
        return;
      }

      const pairs = await Promise.all(
        receipts.slice(0, 40).map(async (receipt) => {
          const { data, error: signedUrlError } = await client.storage
            .from("receipts")
            .createSignedUrl(receipt.storage_path, 60 * 30);
          if (signedUrlError || !data?.signedUrl) {
            return [receipt.id, ""] as const;
          }

          return [receipt.id, data.signedUrl] as const;
        }),
      );

      if (!cancelled) {
        setReceiptSignedUrls(Object.fromEntries(pairs));
      }
    }

    void generateSignedUrls();

    return () => {
      cancelled = true;
    };
  }, [receipts, supabase]);

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      return;
    }

    setWorkingAction("signin");
    setNotice("");
    setError("");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setFailure(`Google sign-in failed: ${oauthError.message}`);
    }

    setWorkingAction("");
  };

  const handleSignOut = async () => {
    if (!supabase) {
      return;
    }

    setWorkingAction("signout");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setFailure(`Sign out failed: ${signOutError.message}`);
      setWorkingAction("");
      return;
    }

    setSession(null);
    setActiveShopId("");
    setShops([]);
    setWorkingAction("");
    setFeedback("Signed out.");
  };

  const handleCreateShop = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user) {
      return;
    }

    const trimmed = newShopName.trim();
    if (!trimmed) {
      setFailure("Enter a shop name.");
      return;
    }

    setWorkingAction("create-shop");

    const { data, error: insertError } = await supabase
      .from("shops")
      .insert({
        name: trimmed,
        owner_user_id: user.id,
      })
      .select("*")
      .single();

    if (insertError) {
      setFailure(`Failed to create shop: ${insertError.message}`);
      setWorkingAction("");
      return;
    }

    const createdShop = data as Shop;
    setNewShopName("");
    setFeedback("Shop created.");
    await loadShops();
    setActiveShopId(createdShop.id);
    setWorkingAction("");
  };

  const handleAddVolunteerHour = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !activeShopId || !user) {
      return;
    }

    if (!volunteerName.trim()) {
      setFailure("Volunteer name is required.");
      return;
    }

    const hours = computeHoursBetween(volunteerStartTime, volunteerEndTime);
    if (hours <= 0) {
      setFailure("End time must be after start time.");
      return;
    }

    setWorkingAction("add-volunteer-hour");

    const { error: insertError } = await supabase.from("volunteer_hours").insert({
      shop_id: activeShopId,
      volunteer_name: volunteerName.trim(),
      work_date: volunteerDate,
      start_time: volunteerStartTime,
      end_time: volunteerEndTime,
      hours,
      notes: volunteerNotes.trim() || null,
      created_by: user.id,
    });

    if (insertError) {
      setFailure(`Failed to save volunteer hours: ${insertError.message}`);
      setWorkingAction("");
      return;
    }

    setVolunteerName("");
    setVolunteerNotes("");
    setFeedback("Volunteer hours added.");
    await loadShopData();
    setWorkingAction("");
  };

  const handleOpenCashSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !activeShopId) {
      return;
    }

    const openingCash = toNumber(cashSessionOpening);
    if (openingCash < 0) {
      setFailure("Opening cash must be a positive value.");
      return;
    }

    setWorkingAction("open-cash-session");

    const { error: insertError } = await supabase.from("cash_sessions").insert({
      shop_id: activeShopId,
      session_date: cashSessionDate,
      opening_cash: openingCash,
      notes: cashSessionNotes.trim() || null,
    });

    if (insertError) {
      setFailure(`Failed to open cash session: ${insertError.message}`);
      setWorkingAction("");
      return;
    }

    setCashSessionNotes("");
    setFeedback("Cash session opened.");
    await loadShopData();
    setWorkingAction("");
  };

  const handleCloseCashSession = async (sessionToClose: CashSession) => {
    if (!supabase || !user) {
      return;
    }

    const value = window.prompt(
      `Closing cash counted for session ${sessionToClose.session_date}`,
      String(sessionToClose.opening_cash),
    );

    if (value === null) {
      return;
    }

    const closingValue = toNumber(value);
    if (closingValue < 0) {
      setFailure("Closing cash must be a positive value.");
      return;
    }

    setWorkingAction("close-cash-session");

    const { error: updateError } = await supabase
      .from("cash_sessions")
      .update({
        closing_cash_counted: closingValue,
        closed_at: new Date().toISOString(),
        closed_by: user.id,
      })
      .eq("id", sessionToClose.id);

    if (updateError) {
      setFailure(`Failed to close cash session: ${updateError.message}`);
      setWorkingAction("");
      return;
    }

    setFeedback("Cash session closed.");
    await loadShopData();
    setWorkingAction("");
  };

  const handleAddCashEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !activeShopId || !user) {
      return;
    }

    const amount = toNumber(cashEntryAmount);
    if (!cashEntrySessionId) {
      setFailure("Select a cash session first.");
      return;
    }

    if (amount <= 0) {
      setFailure("Amount must be greater than zero.");
      return;
    }

    setWorkingAction("add-cash-entry");

    const { error: insertError } = await supabase.from("cash_entries").insert({
      shop_id: activeShopId,
      cash_session_id: cashEntrySessionId,
      entry_date: toIsoStringFromLocal(cashEntryDateTime),
      type: cashEntryType,
      direction: cashEntryDirection,
      category: cashEntryCategory.trim() || null,
      amount,
      description: cashEntryDescription.trim() || null,
      created_by: user.id,
    });

    if (insertError) {
      setFailure(`Failed to add cash entry: ${insertError.message}`);
      setWorkingAction("");
      return;
    }

    setCashEntryAmount("");
    setCashEntryCategory("");
    setCashEntryDescription("");
    setCashEntryDateTime(localDateTimeDefault());
    setFeedback("Cash entry added.");
    await loadShopData();
    setWorkingAction("");
  };

  const handleAddBankEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !activeShopId || !user) {
      return;
    }

    const amount = toNumber(bankEntryAmount);
    if (amount <= 0) {
      setFailure("Amount must be greater than zero.");
      return;
    }

    setWorkingAction("add-bank-entry");

    const { error: insertError } = await supabase.from("bank_ledger_entries").insert({
      shop_id: activeShopId,
      entry_date: toIsoStringFromLocal(bankEntryDateTime),
      type: bankEntryType,
      direction: bankEntryDirection,
      amount,
      reference: bankEntryReference.trim() || null,
      description: bankEntryDescription.trim() || null,
      created_by: user.id,
    });

    if (insertError) {
      setFailure(`Failed to add bank entry: ${insertError.message}`);
      setWorkingAction("");
      return;
    }

    setBankEntryAmount("");
    setBankEntryReference("");
    setBankEntryDescription("");
    setBankEntryDateTime(localDateTimeDefault());
    setFeedback("Bank ledger entry added.");
    await loadShopData();
    setWorkingAction("");
  };

  const handleUploadReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || !activeShopId) {
      return;
    }

    if (!receiptEntityId) {
      setFailure("Select the record this receipt belongs to.");
      return;
    }

    if (!receiptFile) {
      setFailure("Select an image file.");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(receiptFile.type)) {
      setFailure("Only JPG, PNG, and WebP files are allowed.");
      return;
    }

    if (receiptFile.size > 5 * 1024 * 1024) {
      setFailure("Max receipt size is 5 MB.");
      return;
    }

    setWorkingAction("upload-receipt");

    const filePath = `shop/${activeShopId}/${receiptEntityType}/${receiptEntityId}/${Date.now()}_${sanitizeFileName(receiptFile.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(filePath, receiptFile);

    if (uploadError) {
      setFailure(`Upload failed: ${uploadError.message}`);
      setWorkingAction("");
      return;
    }

    const { error: insertError } = await supabase.from("receipts").insert({
      shop_id: activeShopId,
      entity_type: receiptEntityType,
      entity_id: receiptEntityId,
      storage_path: filePath,
      uploaded_by: user.id,
    });

    if (insertError) {
      setFailure(`Failed to store receipt metadata: ${insertError.message}`);
      setWorkingAction("");
      return;
    }

    setReceiptFile(null);
    setFeedback("Receipt uploaded.");
    await loadShopData();
    setWorkingAction("");
  };

  const exportVolunteerCsv = () => {
    const csv = toCsv(
      volunteerHours.map((entry) => ({
        work_date: entry.work_date,
        volunteer_name: entry.volunteer_name,
        start_time: entry.start_time,
        end_time: entry.end_time,
        hours: entry.hours,
        notes: entry.notes ?? "",
      })),
      ["work_date", "volunteer_name", "start_time", "end_time", "hours", "notes"],
    );

    downloadCsv(`volunteer_hours_${activeShop?.name ?? "shop"}.csv`, csv);
  };

  const exportCashCsv = () => {
    const csv = toCsv(
      cashEntries.map((entry) => ({
        entry_date: entry.entry_date,
        type: entry.type,
        direction: entry.direction,
        category: entry.category ?? "",
        amount: entry.amount,
        signed_amount: entry.direction === "in" ? entry.amount : -entry.amount,
        description: entry.description ?? "",
      })),
      [
        "entry_date",
        "type",
        "direction",
        "category",
        "amount",
        "signed_amount",
        "description",
      ],
    );

    downloadCsv(`cash_entries_${activeShop?.name ?? "shop"}.csv`, csv);
  };

  const exportBankCsv = () => {
    const csv = toCsv(
      bankEntries.map((entry) => ({
        entry_date: entry.entry_date,
        type: entry.type,
        direction: entry.direction,
        amount: entry.amount,
        signed_amount: entry.direction === "in" ? entry.amount : -entry.amount,
        reference: entry.reference ?? "",
        description: entry.description ?? "",
      })),
      [
        "entry_date",
        "type",
        "direction",
        "amount",
        "signed_amount",
        "reference",
        "description",
      ],
    );

    downloadCsv(`bank_ledger_${activeShop?.name ?? "shop"}.csv`, csv);
  };

  const todayInItaly = getTodayInItaly();

  const todayCashIn = cashEntries
    .filter((entry) => entry.direction === "in" && dateKeyInItaly(entry.entry_date) === todayInItaly)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const todayCashOut = cashEntries
    .filter((entry) => entry.direction === "out" && dateKeyInItaly(entry.entry_date) === todayInItaly)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const todayCashNet = todayCashIn - todayCashOut;

  const bankNetBalance = bankEntries.reduce(
    (sum, entry) => sum + (entry.direction === "in" ? entry.amount : -entry.amount),
    0,
  );

  const openSession = cashSessions.find((sessionRow) => !sessionRow.closed_at) ?? null;

  if (!configured) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-12">
        <h1 className="text-3xl font-semibold">CaritasApp</h1>
        <p className="rounded-md border border-amber-500/40 bg-amber-100 p-4 text-amber-900">
          Missing Supabase configuration. Create a <code>.env.local</code> file from{" "}
          <code>.env.example</code> and set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </p>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4">
        <p>Loading authentication...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-4">
        <h1 className="text-3xl font-semibold">CaritasApp</h1>
        <p className="max-w-xl text-center text-zinc-600">
          Owner-only charity shop ledger with multi-shop support, EUR currency, and Italy timezone
          defaults.
        </p>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-60"
          disabled={workingAction === "signin"}
        >
          {workingAction === "signin" ? "Connecting..." : "Sign in with Google"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">CaritasApp Ledger</h1>
          <p className="text-sm text-zinc-600">
            Signed in as {user.email} • Currency EUR • Timezone default Europe/Rome
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-zinc-300 px-3 py-2 hover:bg-zinc-100 disabled:opacity-60"
          disabled={workingAction === "signout"}
        >
          {workingAction === "signout" ? "Signing out..." : "Sign out"}
        </button>
      </header>

      {notice ? (
        <p className="rounded-md border border-emerald-400 bg-emerald-100 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium">Shops</h2>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
          <select
            className="rounded-md border border-zinc-300 px-3 py-2"
            value={activeShopId}
            onChange={(event) => setActiveShopId(event.target.value)}
          >
            <option value="">Select shop</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>

          <form className="flex flex-1 gap-2" onSubmit={handleCreateShop}>
            <input
              value={newShopName}
              onChange={(event) => setNewShopName(event.target.value)}
              placeholder="New shop name"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              required
            />
            <button
              type="submit"
              disabled={workingAction === "create-shop"}
              className="rounded-md bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-700 disabled:opacity-60"
            >
              {workingAction === "create-shop" ? "Creating..." : "Create shop"}
            </button>
          </form>
        </div>
      </section>

      {!activeShop ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 text-zinc-600 shadow-sm">
          Create your first shop to start tracking volunteer hours, cashflow, and bank movements.
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-md px-3 py-2 text-sm ${
                    activeTab === tab.key
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === "dashboard" ? (
            <section className="grid gap-4 md:grid-cols-4">
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm text-zinc-500">Today cash in</h3>
                <p className="mt-2 text-2xl font-semibold">{formatEur(todayCashIn)}</p>
              </article>
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm text-zinc-500">Today cash out</h3>
                <p className="mt-2 text-2xl font-semibold">{formatEur(todayCashOut)}</p>
              </article>
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm text-zinc-500">Today net cash</h3>
                <p className="mt-2 text-2xl font-semibold">{formatEur(todayCashNet)}</p>
              </article>
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm text-zinc-500">Bank running balance</h3>
                <p className="mt-2 text-2xl font-semibold">{formatEur(bankNetBalance)}</p>
              </article>
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:col-span-4">
                <h3 className="text-sm text-zinc-500">Cash session status</h3>
                {openSession ? (
                  <p className="mt-2 text-zinc-800">
                    Open session: <strong>{openSession.session_date}</strong>, opening cash{" "}
                    <strong>{formatEur(openSession.opening_cash)}</strong>
                  </p>
                ) : (
                  <p className="mt-2 text-zinc-600">No open cash session.</p>
                )}
                {shopDataLoading ? (
                  <p className="mt-3 text-sm text-zinc-500">Refreshing data...</p>
                ) : null}
              </article>
            </section>
          ) : null}

          {activeTab === "volunteers" ? (
            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-lg font-medium">Add volunteer hours</h3>
                <form className="mt-3 flex flex-col gap-2" onSubmit={handleAddVolunteerHour}>
                  <input
                    value={volunteerName}
                    onChange={(event) => setVolunteerName(event.target.value)}
                    placeholder="Volunteer name"
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <input
                    type="date"
                    value={volunteerDate}
                    onChange={(event) => setVolunteerDate(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={volunteerStartTime}
                      onChange={(event) => setVolunteerStartTime(event.target.value)}
                      className="rounded-md border border-zinc-300 px-3 py-2"
                      required
                    />
                    <input
                      type="time"
                      value={volunteerEndTime}
                      onChange={(event) => setVolunteerEndTime(event.target.value)}
                      className="rounded-md border border-zinc-300 px-3 py-2"
                      required
                    />
                  </div>
                  <textarea
                    value={volunteerNotes}
                    onChange={(event) => setVolunteerNotes(event.target.value)}
                    placeholder="Notes (optional)"
                    className="min-h-24 rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={workingAction === "add-volunteer-hour"}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-700 disabled:opacity-60"
                  >
                    {workingAction === "add-volunteer-hour" ? "Saving..." : "Save hours"}
                  </button>
                </form>
              </article>

              <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm lg:col-span-2">
                <div className="border-b border-zinc-200 p-4">
                  <h3 className="text-lg font-medium">Recent volunteer hours</h3>
                </div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Volunteer</th>
                        <th className="px-3 py-2 text-left">Start</th>
                        <th className="px-3 py-2 text-left">End</th>
                        <th className="px-3 py-2 text-right">Hours</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {volunteerHours.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2">{entry.work_date}</td>
                          <td className="px-3 py-2">{entry.volunteer_name}</td>
                          <td className="px-3 py-2">{entry.start_time}</td>
                          <td className="px-3 py-2">{entry.end_time}</td>
                          <td className="px-3 py-2 text-right">{entry.hours.toFixed(2)}</td>
                          <td className="px-3 py-2">{entry.notes ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {volunteerHours.length === 0 ? (
                    <p className="p-4 text-zinc-600">No volunteer hours yet.</p>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "cash" ? (
            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-lg font-medium">Open cash session</h3>
                <form className="mt-3 flex flex-col gap-2" onSubmit={handleOpenCashSession}>
                  <input
                    type="date"
                    value={cashSessionDate}
                    onChange={(event) => setCashSessionDate(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <input
                    type="number"
                    value={cashSessionOpening}
                    onChange={(event) => setCashSessionOpening(event.target.value)}
                    placeholder="Opening cash"
                    step="0.01"
                    min="0"
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <textarea
                    value={cashSessionNotes}
                    onChange={(event) => setCashSessionNotes(event.target.value)}
                    placeholder="Notes (optional)"
                    className="min-h-24 rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={workingAction === "open-cash-session"}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-700 disabled:opacity-60"
                  >
                    {workingAction === "open-cash-session" ? "Saving..." : "Open session"}
                  </button>
                </form>

                <h3 className="mt-6 text-lg font-medium">Add cash entry</h3>
                <form className="mt-3 flex flex-col gap-2" onSubmit={handleAddCashEntry}>
                  <select
                    value={cashEntrySessionId}
                    onChange={(event) => setCashEntrySessionId(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  >
                    <option value="">Select cash session</option>
                    {cashSessions.map((sessionRow) => (
                      <option key={sessionRow.id} value={sessionRow.id}>
                        {sessionRow.session_date}
                        {sessionRow.closed_at ? " (closed)" : " (open)"}
                      </option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    value={cashEntryDateTime}
                    onChange={(event) => setCashEntryDateTime(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={cashEntryType}
                      onChange={(event) => setCashEntryType(event.target.value as CashEntryType)}
                      className="rounded-md border border-zinc-300 px-3 py-2"
                    >
                      {cashEntryTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <select
                      value={cashEntryDirection}
                      onChange={(event) => setCashEntryDirection(event.target.value as Direction)}
                      className="rounded-md border border-zinc-300 px-3 py-2"
                    >
                      <option value="in">in</option>
                      <option value="out">out</option>
                    </select>
                  </div>
                  <input
                    value={cashEntryCategory}
                    onChange={(event) => setCashEntryCategory(event.target.value)}
                    placeholder="Category (optional)"
                    className="rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <input
                    type="number"
                    value={cashEntryAmount}
                    onChange={(event) => setCashEntryAmount(event.target.value)}
                    placeholder="Amount"
                    step="0.01"
                    min="0.01"
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <textarea
                    value={cashEntryDescription}
                    onChange={(event) => setCashEntryDescription(event.target.value)}
                    placeholder="Description (optional)"
                    className="min-h-24 rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={workingAction === "add-cash-entry"}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-700 disabled:opacity-60"
                  >
                    {workingAction === "add-cash-entry" ? "Saving..." : "Add cash entry"}
                  </button>
                </form>
              </article>

              <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm lg:col-span-2">
                <div className="border-b border-zinc-200 p-4">
                  <h3 className="text-lg font-medium">Cash sessions</h3>
                </div>
                <div className="max-h-60 overflow-auto border-b border-zinc-200">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-right">Opening</th>
                        <th className="px-3 py-2 text-right">Closing</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {cashSessions.map((sessionRow) => (
                        <tr key={sessionRow.id}>
                          <td className="px-3 py-2">{sessionRow.session_date}</td>
                          <td className="px-3 py-2 text-right">
                            {formatEur(sessionRow.opening_cash)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {sessionRow.closing_cash_counted === null
                              ? "-"
                              : formatEur(sessionRow.closing_cash_counted)}
                          </td>
                          <td className="px-3 py-2">
                            {sessionRow.closed_at ? "Closed" : "Open"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!sessionRow.closed_at ? (
                              <button
                                type="button"
                                className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100"
                                onClick={() => void handleCloseCashSession(sessionRow)}
                              >
                                Close
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {cashSessions.length === 0 ? (
                    <p className="p-4 text-zinc-600">No cash sessions yet.</p>
                  ) : null}
                </div>

                <div className="p-4">
                  <h3 className="text-lg font-medium">Recent cash entries</h3>
                  <div className="mt-3 max-h-[320px] overflow-auto">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className="bg-zinc-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">Dir</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-left">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {cashEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-3 py-2">{formatDateTime(entry.entry_date)}</td>
                            <td className="px-3 py-2">{entry.type}</td>
                            <td className="px-3 py-2">{entry.direction}</td>
                            <td className="px-3 py-2">{entry.category ?? ""}</td>
                            <td className="px-3 py-2 text-right">{formatEur(entry.amount)}</td>
                            <td className="px-3 py-2">{entry.description ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {cashEntries.length === 0 ? (
                      <p className="p-4 text-zinc-600">No cash entries yet.</p>
                    ) : null}
                  </div>
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "bank" ? (
            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-lg font-medium">Add bank ledger entry</h3>
                <form className="mt-3 flex flex-col gap-2" onSubmit={handleAddBankEntry}>
                  <input
                    type="datetime-local"
                    value={bankEntryDateTime}
                    onChange={(event) => setBankEntryDateTime(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={bankEntryType}
                      onChange={(event) => setBankEntryType(event.target.value as BankEntryType)}
                      className="rounded-md border border-zinc-300 px-3 py-2"
                    >
                      {bankEntryTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <select
                      value={bankEntryDirection}
                      onChange={(event) => setBankEntryDirection(event.target.value as Direction)}
                      className="rounded-md border border-zinc-300 px-3 py-2"
                    >
                      <option value="in">in</option>
                      <option value="out">out</option>
                    </select>
                  </div>
                  <input
                    type="number"
                    value={bankEntryAmount}
                    onChange={(event) => setBankEntryAmount(event.target.value)}
                    placeholder="Amount"
                    step="0.01"
                    min="0.01"
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <input
                    value={bankEntryReference}
                    onChange={(event) => setBankEntryReference(event.target.value)}
                    placeholder="Reference (optional)"
                    className="rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <textarea
                    value={bankEntryDescription}
                    onChange={(event) => setBankEntryDescription(event.target.value)}
                    placeholder="Description (optional)"
                    className="min-h-24 rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={workingAction === "add-bank-entry"}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-700 disabled:opacity-60"
                  >
                    {workingAction === "add-bank-entry" ? "Saving..." : "Add bank entry"}
                  </button>
                </form>
              </article>

              <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm lg:col-span-2">
                <div className="border-b border-zinc-200 p-4">
                  <h3 className="text-lg font-medium">Recent bank ledger entries</h3>
                </div>
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Dir</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Reference</th>
                        <th className="px-3 py-2 text-left">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {bankEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2">{formatDateTime(entry.entry_date)}</td>
                          <td className="px-3 py-2">{entry.type}</td>
                          <td className="px-3 py-2">{entry.direction}</td>
                          <td className="px-3 py-2 text-right">{formatEur(entry.amount)}</td>
                          <td className="px-3 py-2">{entry.reference ?? ""}</td>
                          <td className="px-3 py-2">{entry.description ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bankEntries.length === 0 ? (
                    <p className="p-4 text-zinc-600">No bank ledger entries yet.</p>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "receipts" ? (
            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-lg font-medium">Upload receipt</h3>
                <form className="mt-3 flex flex-col gap-2" onSubmit={handleUploadReceipt}>
                  <select
                    value={receiptEntityType}
                    onChange={(event) =>
                      setReceiptEntityType(event.target.value as "cash_entry" | "bank_entry")
                    }
                    className="rounded-md border border-zinc-300 px-3 py-2"
                  >
                    <option value="cash_entry">cash_entry</option>
                    <option value="bank_entry">bank_entry</option>
                  </select>
                  <select
                    value={receiptEntityId}
                    onChange={(event) => setReceiptEntityId(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  >
                    <option value="">Select record</option>
                    {(receiptEntityType === "cash_entry" ? cashEntries : bankEntries).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {receiptEntityType === "cash_entry"
                          ? `${formatDateTime((entry as CashEntry).entry_date)} - ${(entry as CashEntry).type} - ${formatEur((entry as CashEntry).amount)}`
                          : `${formatDateTime((entry as BankLedgerEntry).entry_date)} - ${(entry as BankLedgerEntry).type} - ${formatEur((entry as BankLedgerEntry).amount)}`}
                      </option>
                    ))}
                  </select>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <button
                    type="submit"
                    disabled={workingAction === "upload-receipt"}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-700 disabled:opacity-60"
                  >
                    {workingAction === "upload-receipt" ? "Uploading..." : "Upload receipt"}
                  </button>
                </form>
              </article>

              <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm lg:col-span-2">
                <div className="border-b border-zinc-200 p-4">
                  <h3 className="text-lg font-medium">Uploaded receipts</h3>
                </div>
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Created</th>
                        <th className="px-3 py-2 text-left">Entity type</th>
                        <th className="px-3 py-2 text-left">Entity id</th>
                        <th className="px-3 py-2 text-left">Preview</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {receipts.map((receipt) => (
                        <tr key={receipt.id}>
                          <td className="px-3 py-2">{formatDateTime(receipt.created_at)}</td>
                          <td className="px-3 py-2">{receipt.entity_type}</td>
                          <td className="px-3 py-2 font-mono text-xs">{receipt.entity_id}</td>
                          <td className="px-3 py-2">
                            {receiptSignedUrls[receipt.id] ? (
                              <a
                                href={receiptSignedUrls[receipt.id]}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-700 underline"
                              >
                                Open
                              </a>
                            ) : (
                              <span className="text-zinc-500">Not available</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {receipts.length === 0 ? (
                    <p className="p-4 text-zinc-600">No receipts uploaded yet.</p>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "reports" ? (
            <section className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-lg font-medium">CSV exports</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  Download data for accounting or backup.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={exportVolunteerCsv}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-left hover:bg-zinc-100"
                  >
                    Export volunteer hours CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportCashCsv}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-left hover:bg-zinc-100"
                  >
                    Export cash entries CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportBankCsv}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-left hover:bg-zinc-100"
                  >
                    Export bank ledger CSV
                  </button>
                </div>
              </article>

              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-lg font-medium">Quick totals</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt>Total volunteer records</dt>
                    <dd>{volunteerHours.length}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Total cash entries</dt>
                    <dd>{cashEntries.length}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Total bank entries</dt>
                    <dd>{bankEntries.length}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Total receipts</dt>
                    <dd>{receipts.length}</dd>
                  </div>
                </dl>
              </article>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
