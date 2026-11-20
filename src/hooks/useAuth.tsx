import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { one, list } from "../lib/api";
import type { Profile } from "../types";
interface AuthState {
  session: Session | null;
  loading: boolean;
  profile: Profile | undefined;
  role: string;
  refresh: () => void;
}
const Context = createContext<AuthState>({
  session: null,
  loading: true,
  profile: undefined,
  role: "student",
  refresh: () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    client = useQueryClient();
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    let previous: string | undefined;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        previous = data.session?.user.id;
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (previous !== s?.user.id) {
        client.clear();
        previous = s?.user.id;
      }
      setSession(s);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  const profile = useQuery({
    queryKey: ["profile", session?.user.id],
    queryFn: () => one<Profile>("profiles", session!.user.id),
    enabled: !!session,
  });
  const roles = useQuery({
    queryKey: ["role", session?.user.id],
    queryFn: () =>
      list<{ role: string }>("user_roles", { user_id: session!.user.id }),
    enabled: !!session,
  });
  return (
    <Context.Provider
      value={{
        session,
        loading,
        profile: profile.data,
        role: roles.data?.[0]?.role ?? "student",
        refresh: () => {
          void profile.refetch();
          void roles.refetch();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  return useContext(Context);
}
