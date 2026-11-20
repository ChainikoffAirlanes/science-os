import { createClient } from "@supabase/supabase-js";
export const emailDeliveryEnabled =
  import.meta.env.VITE_EMAIL_DELIVERY_ENABLED === "true";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured =
  !!url && !!key && !url.includes("YOUR_PROJECT") && !key.includes("YOUR_");
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
export function db() {
  if (!supabase) throw new Error("Supabase ещё не подключён");
  return supabase;
}
export function appUrl(path = "") {
  return `${location.origin}${import.meta.env.BASE_URL}${path ? `#${path}` : ""}`;
}
export async function authCallback() {
  if (!supabase) return;
  const url = new URL(location.href),
    code = url.searchParams.get("code"),
    recovery = url.searchParams.get("recovery") === "1";
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    url.searchParams.delete("code");
    url.searchParams.delete("recovery");
    url.hash = recovery ? "#/reset-password" : "#/dashboard";
    history.replaceState({}, "", url);
    if (error)
      return "Ссылка недействительна или открыта в другом браузере. Запросите новую ссылку.";
  }
  // Accept legacy implicit email redirects before HashRouter mounts.
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has("access_token")) {
    const { error } = await supabase.auth.setSession({
      access_token: hash.get("access_token")!,
      refresh_token: hash.get("refresh_token")!,
    });
    history.replaceState(
      {},
      "",
      `${location.pathname}#/${hash.get("type") === "recovery" ? "reset-password" : "dashboard"}`,
    );
    if (error) return "Не удалось обработать ссылку входа";
  }
  if (
    hash.has("error_description") ||
    url.searchParams.has("error_description")
  ) {
    history.replaceState({}, "", `${location.pathname}#/login`);
    return "Ссылка истекла или недействительна. Запросите новую ссылку.";
  }
}
