import { read } from "../lib/api";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { Project, Role } from "../types";
export function useProject(id: string) {
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: ({ signal }) => read(signal).one<Project>("projects", id),
    enabled: !!id,
  });
  const role = useQuery({
    queryKey: ["project-role", id],
    queryFn: ({ signal }) =>
      read(signal).rpc<Role>("project_role", { pid: id }),
    enabled: !!project.data,
  });
  return { ...project, role: role.data };
}
export function useRealtime(id: string) {
  const client = useQueryClient(),
    { session, profile } = useAuth(),
    [online, setOnline] = useState<{ id: string; name: string }[]>([]),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!id || !session) return;
    const channel = db().channel(`changes:${id}`);
    const tables = [
      "projects",
      "project_members",
      "experiments",
      "experiment_parameters",
      "experiment_rows",
      "experiment_cells",
      "tasks",
      "task_comments",
      "project_files",
      "project_folders",
      "activity_log",
    ];
    for (const table of tables)
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${table === "projects" ? "id" : "project_id"}=eq.${id}`,
        },
        () => {
          void client.invalidateQueries({
            predicate: (q) => q.queryKey.some((k) => k === id),
          });
        },
      );
    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    const presence = db().channel(`project:${id}`, {
      config: { private: true, presence: { key: session.user.id } },
    });
    presence
      .on("broadcast", { event: "deleted" }, () => {
        void client.invalidateQueries({
          predicate: (q) => q.queryKey.some((k) => k === id),
        });
      })
      .on("presence", { event: "sync" }, () => {
        const entries = Object.values(
          presence.presenceState<{ id: string; name: string }>(),
        ).flat();
        setOnline([
          ...new Map(
            entries.map((e) => [e.id, { id: e.id, name: e.name }]),
          ).values(),
        ]);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED")
          await presence.track({
            id: session.user.id,
            name: profile?.display_name || "Исследователь",
          });
      });
    return () => {
      void db().removeChannel(channel);
      void db().removeChannel(presence);
    };
  }, [id, session, profile?.display_name, client]);
  return { online, connected };
}
