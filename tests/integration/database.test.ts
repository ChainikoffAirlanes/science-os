import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const owner = "00000000-0000-4000-8000-000000000001",
  editor = "00000000-0000-4000-8000-000000000002",
  viewer = "00000000-0000-4000-8000-000000000003",
  stranger = "00000000-0000-4000-8000-000000000004";
let pg: PGlite, pid: string, eid: string, paramid: string, rid: string;
async function asUser(id: string) {
  await pg.exec(
    `reset role; set request.jwt.claim.sub='${id}';set role authenticated;`,
  );
}
async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await pg.query<{ v: T }>(sql, params)).rows[0].v;
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create schema storage;create schema realtime;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create table realtime.messages(id uuid,extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('realtime.topic',true)$$;create publication supabase_realtime;grant usage on schema storage,realtime to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  await pg.exec(
    `alter table realtime.messages add column payload jsonb; alter table realtime.messages add column topic text; create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language plpgsql as $$begin insert into realtime.messages(extension,payload,topic) values('broadcast',payload,topic);end$$;`,
  );
  await pg.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611200001_science_os.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611200002_hardening_and_copy.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611200003_avatars.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611200004_activity_and_membership.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611200005_private_delete_events.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611200006_admin_roles.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const id of [owner, editor, viewer, stranger])
    await pg.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [id, { first_name: "Тест", last_name: id.slice(-1) }],
    );
  await asUser(owner);
  pid = await scalar<string>(
    `insert into public.projects(title,hypothesis) values('Тестовое исследование','Не изменена') returning id as v`,
  );
  eid = await scalar<string>(
    `insert into public.experiments(project_id,title) values($1,'Первый опыт') returning id as v`,
    [pid],
  );
  paramid = await scalar<string>(
    `insert into public.experiment_parameters(project_id,experiment_id,name,value_type,required) values($1,$2,'Температура','number',true) returning id as v`,
    [pid, eid],
  );
  rid = await scalar<string>(
    `insert into public.experiment_rows(project_id,experiment_id) values($1,$2) returning id as v`,
    [pid, eid],
  );
}, 60000);
afterAll(async () => {
  await pg?.close();
});
describe("Real PostgreSQL migration and authorization (local PGlite)", () => {
  it("requires explicit versions, handles optional SQL nulls and versions parameter changes", async () => {
    await asUser(owner);
    await expect(
      pg.query("select public.save_cell($1,$2,'10'::jsonb,null)", [
        rid,
        paramid,
      ]),
    ).rejects.toThrow("Expected version required");
    const optional = await scalar<string>(
      `insert into public.experiment_parameters(project_id,experiment_id,name,value_type) values($1,$2,'Optional','text') returning id as v`,
      [pid, eid],
    );
    expect(
      await scalar<{ conflict: boolean; current: { value: null } }>(
        "select public.save_cell($1,$2,null,0) as v",
        [rid, optional],
      ),
    ).toMatchObject({ conflict: false, current: { value: null } });
    expect(
      await scalar<{ conflict: boolean }>(
        `select public.update_record('experiment_parameters',$1,'{"name":"Updated optional"}',1) as v`,
        [optional],
      ),
    ).toMatchObject({ conflict: false });
    expect(
      await scalar<{ conflict: boolean }>(
        `select public.update_record('experiment_parameters',$1,'{"unit":"stale"}',1) as v`,
        [optional],
      ),
    ).toMatchObject({ conflict: true });
    await pg.query("delete from public.experiment_parameters where id=$1", [
      optional,
    ]);
  });

  it("restricts role search and grants, and preserves the last administrator", async () => {
    await asUser(stranger);
    await expect(
      pg.query("select * from public.admin_search_users('Тест')"),
    ).rejects.toThrow(/Access denied/);
    await expect(
      pg.query("select public.grant_user_role($1,'teacher')", [stranger]),
    ).rejects.toThrow(/Access denied/);
    await pg.exec("reset role");
    await pg.query(
      "update public.user_roles set role='administrator' where user_id=$1",
      [owner],
    );
    await asUser(owner);
    expect(
      (await pg.query("select * from public.admin_search_users('Тест')")).rows
        .length,
    ).toBe(4);
    await expect(
      pg.query("select public.grant_user_role($1,'student')", [owner]),
    ).rejects.toThrow(/last administrator/);
    await pg.query("select public.grant_user_role($1,'teacher')", [stranger]);
    expect(
      await scalar<string>(
        "select role as v from public.user_roles where user_id=$1",
        [stranger],
      ),
    ).toBe("teacher");
    await pg.query("select public.grant_user_role($1,'student')", [stranger]);
    await pg.exec("reset role");
    await pg.query(
      "update public.user_roles set role='student' where user_id=$1",
      [owner],
    );
  });
  it("creates a student profile and isolates the private project", async () => {
    await asUser(stranger);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.projects",
      ),
    ).toBe(0);
    expect(
      await scalar<string>(
        `select role as v from public.user_roles where user_id=auth.uid()`,
      ),
    ).toBe("student");
    await expect(
      pg.query(
        `update public.user_roles set role='administrator' where user_id=auth.uid() returning *`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      pg.query(`select public.create_invite($1,'editor',1)`, [pid]),
    ).rejects.toThrow();
  });
  it("only the owner creates hashed, atomic limited-use invitations", async () => {
    await asUser(owner);
    const inv = await scalar<{ token: string }>(
      `select public.create_invite($1,'editor',1) as v`,
      [pid],
    );
    const hash = await scalar<string>(
      `select token_hash as v from public.project_invites limit 1`,
    );
    expect(hash).not.toBe(inv.token);
    expect(hash).toHaveLength(64);
    await asUser(editor);
    expect(
      await scalar<string>("select public.accept_invite($1) as v", [inv.token]),
    ).toBe(pid);
    await asUser(stranger);
    await expect(
      pg.query("select public.accept_invite($1)", [inv.token]),
    ).rejects.toThrow();
  });
  it("editors save typed cells, stale writes and empty-cell races conflict", async () => {
    await asUser(editor);
    const first = await scalar<{
      conflict: boolean;
      current: { version: number };
    }>("select public.save_cell($1,$2,$3,0) as v", [
      rid,
      paramid,
      JSON.stringify(20),
    ]);
    expect(first.conflict).toBe(false);
    expect(first.current.version).toBe(1);
    const stale = await scalar<{
      conflict: boolean;
      current: { value: number };
    }>("select public.save_cell($1,$2,$3,0) as v", [
      rid,
      paramid,
      JSON.stringify(99),
    ]);
    expect(stale.conflict).toBe(true);
    expect(stale.current.value).toBe(20);
    await expect(
      pg.query("select public.save_cell($1,$2,$3,1)", [
        rid,
        paramid,
        JSON.stringify("invalid"),
      ]),
    ).rejects.toThrow("Invalid value type");
    expect(
      await scalar<{ conflict: boolean }>(
        "select public.save_cell($1,$2,$3,1) as v",
        [rid, paramid, JSON.stringify(21)],
      ),
    ).toMatchObject({ conflict: false });
  });
  it("viewers can read but cannot write directly or call mutating RPCs", async () => {
    await asUser(owner);
    const inv = await scalar<{ token: string }>(
      `select public.create_invite($1,'viewer',1) as v`,
      [pid],
    );
    await asUser(viewer);
    await pg.query("select public.accept_invite($1)", [inv.token]);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.experiment_cells",
      ),
    ).toBe(1);
    await expect(
      pg.query(
        `insert into public.experiment_rows(project_id,experiment_id) values($1,$2)`,
        [pid, eid],
      ),
    ).rejects.toThrow();
    await expect(
      pg.query("select public.save_cell($1,$2,$3,2)", [rid, paramid, "22"]),
    ).rejects.toThrow("Access denied");
    await expect(
      pg.query(
        `select public.update_record('projects',$1,'{"title":"Hacked"}',1)`,
        [pid],
      ),
    ).rejects.toThrow("Access denied");
    await expect(
      pg.query(
        `insert into public.publications(project_id,title,visibility,public_content) values($1,'Leak','public','{}')`,
        [pid],
      ),
    ).rejects.toThrow();
  });
  it("rejects cross-experiment cells and immutable owner updates", async () => {
    await asUser(owner);
    const other = await scalar<string>(
      `insert into public.experiments(project_id,title) values($1,'Другой опыт') returning id as v`,
      [pid],
    );
    const row = await scalar<string>(
      `insert into public.experiment_rows(project_id,experiment_id) values($1,$2) returning id as v`,
      [pid, other],
    );
    await expect(
      pg.query("select public.save_cell($1,$2,$3,0)", [row, paramid, "1"]),
    ).rejects.toThrow();
    await expect(
      pg.query(`select public.update_record('projects',$1,$2,1)`, [
        pid,
        JSON.stringify({ owner_id: stranger }),
      ]),
    ).rejects.toThrow("Field not editable");
  });
  it("project narrative uses version checks without losing a concurrent change", async () => {
    await asUser(owner);
    expect(
      await scalar<{ conflict: boolean }>(
        `select public.update_record('projects',$1,'{"hypothesis":"Новая гипотеза"}',1) as v`,
        [pid],
      ),
    ).toMatchObject({ conflict: false });
    await asUser(editor);
    const r = await scalar<{
      conflict: boolean;
      current: { hypothesis: string };
    }>(
      `select public.update_record('projects',$1,'{"hypothesis":"Старая гипотеза"}',1) as v`,
      [pid],
    );
    expect(r.conflict).toBe(true);
    expect(r.current.hypothesis).toBe("Новая гипотеза");
  });
  it("invalid import rolls back all observations; valid import appends atomically", async () => {
    await asUser(editor);
    const before = await scalar<number>(
      "select count(*)::integer as v from public.experiment_rows",
    );
    await expect(
      pg.query("select public.import_observations($1,$2,$3)", [
        eid,
        [paramid],
        JSON.stringify([[1], ["bad"]]),
      ]),
    ).rejects.toThrow();
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.experiment_rows",
      ),
    ).toBe(before);
    expect(
      await scalar<number>("select public.import_observations($1,$2,$3) as v", [
        eid,
        [paramid],
        JSON.stringify([[2], [3]]),
      ]),
    ).toBe(2);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.experiment_rows",
      ),
    ).toBe(before + 2);
  });
  it("private storage requires membership and editor role", async () => {
    await asUser(editor);
    await pg.query(
      `insert into storage.objects(bucket_id,name) values('science-project-files',$1)`,
      [pid + "/root/test"],
    );
    await asUser(stranger);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from storage.objects",
      ),
    ).toBe(0);
    await expect(
      pg.query(
        `insert into storage.objects(bucket_id,name) values('science-project-files',$1)`,
        [pid + "/root/hack"],
      ),
    ).rejects.toThrow();
    await asUser(viewer);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from storage.objects",
      ),
    ).toBe(1);
    expect(
      (
        await pg.query(
          `delete from storage.objects where name=$1 returning *`,
          [pid + "/root/test"],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("public snapshots do not expose the private source project", async () => {
    await asUser(owner);
    await pg.query(
      `insert into public.publications(project_id,title,visibility,public_content) values($1,'Публичная работа','public',$2)`,
      [
        pid,
        JSON.stringify({
          category: "Физика",
          authors: [],
          sections: { description: "Проверенный снимок" },
        }),
      ],
    );
    await pg.exec(`reset role;set request.jwt.claim.sub='';set role anon`);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.publications",
      ),
    ).toBe(1);
    await expect(pg.query("select * from public.projects")).rejects.toThrow();
  });
  it("students cannot create opportunities; teacher decisions enforce capacity", async () => {
    await asUser(stranger);
    await expect(
      pg.query(
        `insert into public.opportunities(title,description,subject,deadline) values('Тема','Описание','Физика','2099-01-01')`,
      ),
    ).rejects.toThrow();
    await pg.exec("reset role");
    await pg.query(
      `update public.user_roles set role='teacher' where user_id=$1`,
      [owner],
    );
    await asUser(owner);
    const oid = await scalar<string>(
      `insert into public.opportunities(title,description,subject,deadline,capacity) values('Тема','Описание','Физика','2099-01-01',1) returning id as v`,
    );
    await asUser(editor);
    const a = await scalar<string>(
      `insert into public.opportunity_applications(opportunity_id,message) values($1,'Хочу участвовать') returning id as v`,
      [oid],
    );
    await asUser(viewer);
    const b = await scalar<string>(
      `insert into public.opportunity_applications(opportunity_id,message) values($1,'Тоже хочу') returning id as v`,
      [oid],
    );
    await asUser(owner);
    await pg.query(`select public.review_application($1,'accepted')`, [a]);
    await expect(
      pg.query(`select public.review_application($1,'accepted')`, [b]),
    ).rejects.toThrow("No places available");
    await asUser(stranger);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.notifications",
      ),
    ).toBe(0);
  });
  it("copies only readable scientific data into a new independently owned project", async () => {
    await asUser(stranger);
    await expect(
      pg.query("select public.duplicate_project($1)", [pid]),
    ).rejects.toThrow("Access denied");
    await asUser(viewer);
    const copy = await scalar<string>(
      "select public.duplicate_project($1) as v",
      [pid],
    );
    expect(
      await scalar<string>(
        "select owner_id::text as v from public.projects where id=$1",
        [copy],
      ),
    ).toBe(viewer);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.project_members where project_id=$1",
        [copy],
      ),
    ).toBe(0);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.experiment_cells where project_id=$1",
        [copy],
      ),
    ).toBe(3);
    await pg.query("delete from public.projects where id=$1", [copy]);
  });
  it("removing a member clears assignments without leaving an uneditable task", async () => {
    await asUser(owner);
    const task = await scalar<string>(
      `insert into public.tasks(project_id,title,assigned_to) values($1,'Assignment cleanup',$2) returning id as v`,
      [pid, editor],
    );
    const mid = await scalar<string>(
      "select id as v from public.project_members where project_id=$1 and user_id=$2",
      [pid, editor],
    );
    await pg.query("select public.change_member($1,null)", [mid]);
    expect(
      await scalar<string | null>(
        "select assigned_to::text as v from public.tasks where id=$1",
        [task],
      ),
    ).toBeNull();
    await asUser(editor);
    expect(
      await scalar<number>(
        "select count(*)::integer as v from public.projects where id=$1",
        [pid],
      ),
    ).toBe(0);
  });
});
