"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  const configured = isSupabaseConfigured();
  const supabase = useMemo(
    () => (configured ? getSupabaseBrowserClient() : null),
    [configured],
  );

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setError("Supabase is not configured.");
      return;
    }

    const code = new URLSearchParams(window.location.search).get("code");

    async function run() {
      if (!client) {
        return;
      }

      if (!code) {
        router.replace("/");
        return;
      }

      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setError(exchangeError.message);
        return;
      }

      router.replace("/");
    }

    void run();
  }, [router, supabase]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4">
      {error ? (
        <p className="rounded-md border border-red-400 bg-red-100 px-4 py-3 text-red-900">
          Authentication error: {error}
        </p>
      ) : (
        <p>Completing sign-in...</p>
      )}
    </main>
  );
}
