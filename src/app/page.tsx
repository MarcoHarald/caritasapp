"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";
import type {
  BankEntryType,
  BankLedgerEntry,
  CashEntry,
  CashEntryType,
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

type Tab = "dashboard" | "volunteers" | "cash" | "bank" | "reports";

const tabs: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "volunteers", label: "Volunteer Hours" },
  { key: "cash", label: "Cash Entries" },
  { key: "bank", label: "Bank Ledger" },
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isGoogleEnabled, setIsGoogleEnabled] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [workingAction, setWorkingAction] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState("");

  const [volunteerHours, setVolunteerHours] = useState<VolunteerHour[]>([]);
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
  const [volunteerNameFocused, setVolunteerNameFocused] = useState(false);
  const [volunteerNameHighlight, setVolunteerNameHighlight] = useState(-1);
  const volunteerNameRef = useRef<HTMLInputElement>(null);
  const volunteerSuggestionsRef = useRef<HTMLUListElement>(null);

  const [cashEntryDateTime, setCashEntryDateTime] = useState(localDateTimeDefault());
  const [cashEntryType, setCashEntryType] = useState<CashEntryType>("sale");
  const [cashEntryDirection, setCashEntryDirection] = useState<Direction>("in");
  const [cashEntryCategory, setCashEntryCategory] = useState("");
  const [cashEntrySubstore, setCashEntrySubstore] = useState("");
  const [cashEntryAmount, setCashEntryAmount] = useState("");
  const [cashEntryDescription, setCashEntryDescription] = useState("");
  const [cashEntryReceiptFile, setCashEntryReceiptFile] = useState<File | null>(null);

  const [bankEntryDateTime, setBankEntryDateTime] = useState(localDateTimeDefault());
  const [bankEntryType, setBankEntryType] = useState<BankEntryType>("cash_deposit");
  const [bankEntryDirection, setBankEntryDirection] = useState<Direction>("in");
  const [bankEntryAmount, setBankEntryAmount] = useState("");
  const [bankEntryReference, setBankEntryReference] = useState("");
  const [bankEntryDescription, setBankEntryDescription] = useState("");

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
      setCashEntries([]);
      setBankEntries([]);
      setReceipts([]);
      setReceiptSignedUrls({});
      return;
    }

    setShopDataLoading(true);

    const [volunteerResult, cashResult, bankResult, receiptResult] =
      await Promise.all([
        supabase
          .from("volunteer_hours")
          .select("*")
          .eq("shop_id", activeShopId)
          .order("work_date", { ascending: false }),
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
      cashResult.error ||
      bankResult.error ||
      receiptResult.error;

    if (firstError) {
      setFailure(`Failed to load data: ${firstError.message}`);
      setShopDataLoading(false);
      return;
    }

    const normalizedVolunteer = normalizeVolunteerHours(volunteerResult.data ?? []);
    const normalizedCashEntries = normalizeCashEntries(cashResult.data ?? []);
    const normalizedBankEntries = normalizeBankEntries(bankResult.data ?? []);

    setVolunteerHours(normalizedVolunteer);
    setCashEntries(normalizedCashEntries);
    setBankEntries(normalizedBankEntries);
    setReceipts((receiptResult.data ?? []) as Receipt[]);

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
    if (!configured || !supabaseUrl || !supabaseAnonKey) {
      setIsGoogleEnabled(null);
      return;
    }

    let cancelled = false;

    async function loadAuthSettings() {
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
          headers: {
            apikey: supabaseAnonKey,
          },
        });

        if (!response.ok) {
          if (!cancelled) {
            setIsGoogleEnabled(null);
          }
          return;
        }

        const payload = (await response.json()) as {
          external?: { google?: boolean };
        };

        if (!cancelled) {
          setIsGoogleEnabled(Boolean(payload.external?.google));
        }
      } catch {
        if (!cancelled) {
          setIsGoogleEnabled(null);
        }
      }
    }

    void loadAuthSettings();

    return () => {
      cancelled = true;
    };
  }, [configured, supabaseAnonKey, supabaseUrl]);

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

    if (isGoogleEnabled === false) {
      setFailure(
        "Google sign-in is not enabled in Supabase Auth. Use email/password login below, or enable Google in Supabase Auth Providers.",
      );
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

  const handleEmailPasswordSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    const email = loginEmail.trim();
    if (!email || !loginPassword) {
      setFailure("Enter both email and password.");
      return;
    }

    setWorkingAction("email-signin");
    setNotice("");
    setError("");

    const { error: passwordSignInError } = await supabase.auth.signInWithPassword({
      email,
      password: loginPassword,
    });

    if (passwordSignInError) {
      setFailure(`Email sign-in failed: ${passwordSignInError.message}`);
      setWorkingAction("");
      return;
    }

    setWorkingAction("");
    setFeedback("Signed in.");
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
    setFeedback("Volunteer hours added.");
    await loadShopData();
    setWorkingAction("");
    volunteerNameRef.current?.focus();
  };

  const handleAddCashEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !activeShopId || !user) {
      return;
    }

    const amount = toNumber(cashEntryAmount);
    if (amount <= 0) {
      setFailure("Amount must be greater than zero.");
      return;
    }

    if (cashEntryReceiptFile) {
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(cashEntryReceiptFile.type)) {
        setFailure("Only JPG, PNG, and WebP receipt files are allowed.");
        return;
      }
      if (cashEntryReceiptFile.size > 5 * 1024 * 1024) {
        setFailure("Max receipt size is 5 MB.");
        return;
      }
    }

    setWorkingAction("add-cash-entry");

    const { data: inserted, error: insertError } = await supabase
      .from("cash_entries")
      .insert({
        shop_id: activeShopId,
        entry_date: toIsoStringFromLocal(cashEntryDateTime),
        type: cashEntryType,
        direction: cashEntryDirection,
        category: cashEntryCategory.trim() || null,
        substore: cashEntrySubstore.trim() || null,
        amount,
        description: cashEntryDescription.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setFailure(`Failed to add cash entry: ${insertError?.message ?? "Unknown error"}`);
      setWorkingAction("");
      return;
    }

    if (cashEntryReceiptFile) {
      const filePath = `shop/${activeShopId}/cash_entry/${inserted.id}/${Date.now()}_${sanitizeFileName(cashEntryReceiptFile.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, cashEntryReceiptFile);

      if (uploadError) {
        setFailure(`Cash entry saved but receipt upload failed: ${uploadError.message}`);
        setWorkingAction("");
        await loadShopData();
        return;
      }

      const { error: receiptInsertError } = await supabase.from("receipts").insert({
        shop_id: activeShopId,
        entity_type: "cash_entry",
        entity_id: inserted.id,
        storage_path: filePath,
        uploaded_by: user.id,
      });

      if (receiptInsertError) {
        setFailure(`Cash entry saved but receipt metadata failed: ${receiptInsertError.message}`);
        setWorkingAction("");
        await loadShopData();
        return;
      }
    }

    setCashEntryAmount("");
    setCashEntryCategory("");
    setCashEntrySubstore("");
    setCashEntryDescription("");
    setCashEntryReceiptFile(null);
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
        substore: entry.substore ?? "",
        amount: entry.amount,
        signed_amount: entry.direction === "in" ? entry.amount : -entry.amount,
        description: entry.description ?? "",
      })),
      [
        "entry_date",
        "type",
        "direction",
        "category",
        "substore",
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

  const knownVolunteerNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const entry of volunteerHours) {
      const normalized = entry.volunteer_name.trim();
      const key = normalized.toLowerCase();
      if (normalized && !seen.has(key)) {
        seen.add(key);
        names.push(normalized);
      }
    }
    return names.sort((a, b) => a.localeCompare(b, "it"));
  }, [volunteerHours]);

  const volunteerNameSuggestions = useMemo(() => {
    const query = volunteerName.trim().toLowerCase();
    if (!query) return knownVolunteerNames;
    return knownVolunteerNames.filter((name) => name.toLowerCase().includes(query));
  }, [volunteerName, knownVolunteerNames]);

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

  const knownSubstores = useMemo(() => {
    const set = new Set<string>();
    for (const entry of cashEntries) {
      if (entry.substore) set.add(entry.substore);
    }
    return Array.from(set).sort();
  }, [cashEntries]);

  const cashEntryReceiptMap = useMemo(() => {
    const map: Record<string, Receipt[]> = {};
    for (const r of receipts) {
      if (r.entity_type === "cash_entry") {
        if (!map[r.entity_id]) map[r.entity_id] = [];
        map[r.entity_id].push(r);
      }
    }
    return map;
  }, [receipts]);

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
        {isGoogleEnabled === false ? (
          <p className="max-w-xl rounded-md border border-amber-400 bg-amber-100 px-4 py-3 text-center text-sm text-amber-900">
            Google Auth is currently disabled on this Supabase project.
          </p>
        ) : null}
        <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-zinc-700">Or sign in with email/password</p>
          <form className="flex flex-col gap-2" onSubmit={handleEmailPasswordSignIn}>
            <input
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="rounded-md border border-zinc-300 px-3 py-2"
              required
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="rounded-md border border-zinc-300 px-3 py-2"
              required
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 hover:bg-zinc-100 disabled:opacity-60"
              disabled={workingAction === "email-signin"}
            >
              {workingAction === "email-signin" ? "Signing in..." : "Sign in with email"}
            </button>
          </form>
        </div>
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
              {shopDataLoading ? (
                <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:col-span-4">
                  <p className="text-sm text-zinc-500">Refreshing data...</p>
                </article>
              ) : null}
            </section>
          ) : null}

          {activeTab === "volunteers" ? (
            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="text-lg font-medium">Add volunteer hours</h3>
                <form className="mt-3 flex flex-col gap-2" onSubmit={handleAddVolunteerHour}>
                  <div className="relative">
                    <input
                      ref={volunteerNameRef}
                      value={volunteerName}
                      onChange={(event) => {
                        setVolunteerName(event.target.value);
                        setVolunteerNameHighlight(-1);
                        if (!volunteerNameFocused) setVolunteerNameFocused(true);
                      }}
                      onFocus={() => {
                        setVolunteerNameFocused(true);
                        setVolunteerNameHighlight(-1);
                      }}
                      onBlur={(event) => {
                        if (
                          volunteerSuggestionsRef.current?.contains(
                            event.relatedTarget as Node,
                          )
                        ) {
                          return;
                        }
                        setVolunteerNameFocused(false);
                      }}
                      onKeyDown={(event) => {
                        if (!volunteerNameFocused || volunteerNameSuggestions.length === 0) return;
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setVolunteerNameHighlight((prev) =>
                            prev < volunteerNameSuggestions.length - 1 ? prev + 1 : 0,
                          );
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setVolunteerNameHighlight((prev) =>
                            prev > 0 ? prev - 1 : volunteerNameSuggestions.length - 1,
                          );
                        } else if (event.key === "Enter" && volunteerNameHighlight >= 0) {
                          event.preventDefault();
                          setVolunteerName(volunteerNameSuggestions[volunteerNameHighlight]);
                          setVolunteerNameFocused(false);
                          setVolunteerNameHighlight(-1);
                        } else if (event.key === "Escape") {
                          setVolunteerNameFocused(false);
                          setVolunteerNameHighlight(-1);
                        }
                      }}
                      placeholder="Volunteer name"
                      className="w-full rounded-md border border-zinc-300 px-3 py-2"
                      autoComplete="off"
                      required
                    />
                    {volunteerNameFocused && volunteerNameSuggestions.length > 0 ? (
                      <ul
                        ref={volunteerSuggestionsRef}
                        className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg"
                      >
                        {volunteerNameSuggestions.map((name, idx) => (
                          <li key={name}>
                            <button
                              type="button"
                              className={`w-full px-3 py-2 text-left text-sm ${
                                idx === volunteerNameHighlight
                                  ? "bg-zinc-100 text-zinc-900"
                                  : "text-zinc-700 hover:bg-zinc-50"
                              }`}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setVolunteerName(name);
                                setVolunteerNameFocused(false);
                                setVolunteerNameHighlight(-1);
                                volunteerNameRef.current?.focus();
                              }}
                            >
                              {name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
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
                <h3 className="text-lg font-medium">Add cash entry</h3>
                <form className="mt-3 flex flex-col gap-2" onSubmit={handleAddCashEntry}>
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
                    type="number"
                    value={cashEntryAmount}
                    onChange={(event) => setCashEntryAmount(event.target.value)}
                    placeholder="Amount"
                    step="0.01"
                    min="0.01"
                    className="rounded-md border border-zinc-300 px-3 py-2"
                    required
                  />
                  <input
                    value={cashEntryCategory}
                    onChange={(event) => setCashEntryCategory(event.target.value)}
                    placeholder="Category (optional)"
                    className="rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Substore (optional)
                    </label>
                    <input
                      list="substore-options"
                      value={cashEntrySubstore}
                      onChange={(event) => setCashEntrySubstore(event.target.value)}
                      placeholder="Type or select substore"
                      className="w-full rounded-md border border-zinc-300 px-3 py-2"
                    />
                    <datalist id="substore-options">
                      {knownSubstores.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                  <textarea
                    value={cashEntryDescription}
                    onChange={(event) => setCashEntryDescription(event.target.value)}
                    placeholder="Description (optional)"
                    className="min-h-20 rounded-md border border-zinc-300 px-3 py-2"
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Receipt image (optional)
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setCashEntryReceiptFile(event.target.files?.[0] ?? null)
                      }
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </div>
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
                  <h3 className="text-lg font-medium">Recent cash entries</h3>
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Dir</th>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-left">Substore</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-left">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {cashEntries.map((entry) => {
                        const entryReceipts = cashEntryReceiptMap[entry.id];
                        return (
                          <tr key={entry.id}>
                            <td className="px-3 py-2">{formatDateTime(entry.entry_date)}</td>
                            <td className="px-3 py-2">{entry.type}</td>
                            <td className="px-3 py-2">{entry.direction}</td>
                            <td className="px-3 py-2">{entry.category ?? ""}</td>
                            <td className="px-3 py-2">
                              {entry.substore ? (
                                <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                                  {entry.substore}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right">{formatEur(entry.amount)}</td>
                            <td className="px-3 py-2">{entry.description ?? ""}</td>
                            <td className="px-3 py-2">
                              {entryReceipts?.map((r) =>
                                receiptSignedUrls[r.id] ? (
                                  <a
                                    key={r.id}
                                    href={receiptSignedUrls[r.id]}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-700 underline"
                                  >
                                    View
                                  </a>
                                ) : null,
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {cashEntries.length === 0 ? (
                    <p className="p-4 text-zinc-600">No cash entries yet.</p>
                  ) : null}
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
