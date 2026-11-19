import { useMemo, useState } from "react";
import { Moon, Search, Sun, Users, UserRound, ChevronRight, Headset, LayoutDashboard } from "lucide-react";
import { Servicedesk } from "@/components/servicedesk";
import { Dashboard } from "@/components/dashboard";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { useThemeContext } from "@/hooks/theme.context";
import { employeeColumns, employees, groupColumn, memberships } from "@/queries/gruppen";

type Employee = { user: string; name: string };
type Table = { columns: readonly { name: string }[]; rows: readonly (readonly unknown[])[] };

function columnIndex(table: Table, name: string): number {
    const index = table.columns.findIndex((column) => column.name === name);
    if (index < 0 && table.rows.length > 0) {
        throw new Error(`Die erwartete Spalte ${name} fehlt im Abfrageergebnis.`);
    }
    return index;
}

function Groups({ employee }: { employee: Employee }) {
    const { data, isLoading, error, refetch } = useSemanticModelQuery(memberships(employee.user));
    const groups = useMemo(() => {
        if (data?.status !== "success") return [];
        const index = columnIndex(data.table, groupColumn);
        return data.table.rows.map((row) => row[index]).filter((value): value is string => typeof value === "string" && value.length > 0);
    }, [data]);

    return (
        <section aria-labelledby="groups-heading" className="min-w-0 rounded-2xl border bg-card p-6 shadow-container-4 sm:p-8">
            <div className="flex items-start gap-4 border-b pb-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-brand-foreground"><UserRound className="icon-size-400" aria-hidden="true" /></span>
                <div className="min-w-0">
                    <p className="text-200 font-semibold uppercase tracking-wider text-muted-foreground">Ausgewählter Mitarbeiter</p>
                    <h2 id="groups-heading" className="mt-1 break-words text-500 font-semibold">{employee.name}</h2>
                    <p className="break-all text-300 text-muted-foreground">{employee.user}</p>
                </div>
            </div>
            <div className="mt-6 flex items-baseline justify-between gap-4">
                <h3 className="text-400 font-semibold">Gruppen</h3>
                {!isLoading && !error && data?.status === "success" && <span className="text-200 text-muted-foreground">{groups.length} insgesamt</span>}
            </div>
            {error ? <div role="alert" className="mt-6 text-300 text-destructive">Gruppen konnten nicht geladen werden: {error.message} <button type="button" className="underline" onClick={() => void refetch()}>Erneut versuchen</button></div>
                : isLoading || !data ? <p role="status" className="mt-6 text-300 text-muted-foreground">Gruppen werden geladen …</p>
                : groups.length === 0 ? <p className="mt-6 text-300 text-muted-foreground">Keine Gruppen für diesen Mitarbeiter gefunden.</p>
                : <ul className="mt-4 divide-y divide-border">{groups.map((group) => <li key={group} className="flex items-center gap-3 py-3 text-300"><Users className="icon-size-200 shrink-0 text-brand-foreground" aria-hidden="true" /><span className="break-all">{group}</span></li>)}</ul>}
        </section>
    );
}

function GroupsPage() {
    const { data, isLoading, error, refetch } = useSemanticModelQuery(employees);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Employee | null>(null);

    const matchingEmployees = useMemo(() => {
        if (data?.status !== "success" || !search.trim()) return [];
        const userIndex = columnIndex(data.table, employeeColumns.user);
        const nameIndex = columnIndex(data.table, employeeColumns.name);
        const term = search.trim().toLocaleLowerCase("de");
        return data.table.rows.flatMap((row) => {
            const user = row[userIndex];
            const name = row[nameIndex];
            if (typeof user !== "string" || !user) return [];
            const employee = { user, name: typeof name === "string" && name ? name : user };
            return `${employee.name} ${employee.user}`.toLocaleLowerCase("de").includes(term) ? [employee] : [];
        });
    }, [data, search]);

    return (
            <main className="px-2 py-10 sm:px-4 sm:py-14">
                <p className="text-200 font-semibold uppercase tracking-wider text-brand-foreground">Verzeichnis / Gruppen</p>
                <h1 className="mt-3 font-page-title text-page-title text-emphasis-foreground">Gruppen nach Mitarbeiter</h1>
                <p className="mt-2 font-page-subtitle text-page-subtitle text-muted-foreground">Suchen Sie nach einem Mitarbeiter, um seine Gruppenzugehörigkeiten anzuzeigen.</p>
                <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
                    <section aria-labelledby="search-heading" className="rounded-2xl border bg-card p-6 shadow-container-4 sm:p-8">
                        <h2 id="search-heading" className="text-400 font-semibold">Mitarbeiter suchen</h2>
                        <p className="mt-1 text-300 text-muted-foreground">Name oder Benutzerkennung eingeben</p>
                        <div className="relative mt-5">
                            <Search className="pointer-events-none absolute left-3 top-3 icon-size-300 text-muted-foreground" aria-hidden="true" />
                            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Mitarbeiter suchen" placeholder="Name oder Benutzerkennung" className="h-11 w-full rounded-lg border bg-background pl-10 pr-3 text-300 focus-visible:outline-2 focus-visible:outline-ring" />
                        </div>
                        {error ? <div role="alert" className="mt-5 text-300 text-destructive">Mitarbeiter konnten nicht geladen werden: {error.message} <button type="button" className="underline" onClick={() => void refetch()}>Erneut versuchen</button></div>
                            : isLoading || !data ? <p role="status" className="mt-5 text-300 text-muted-foreground">Mitarbeiter werden geladen …</p>
                            : !search.trim() ? <p className="mt-5 text-300 text-muted-foreground">Geben Sie einen Suchbegriff ein.</p>
                            : matchingEmployees.length === 0 ? <p className="mt-5 text-300 text-muted-foreground">Keine Mitarbeiter gefunden.</p>
                            : <ul className="mt-5 max-h-96 overflow-y-auto divide-y divide-border" aria-label="Suchergebnisse">{matchingEmployees.map((employee) => <li key={JSON.stringify([employee.user, employee.name])}><button type="button" onClick={() => setSelected(employee)} aria-pressed={selected?.user === employee.user} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0 flex-1"><span className="block break-words text-300 font-semibold">{employee.name}</span><span className="block break-all text-200 text-muted-foreground">{employee.user}</span></span><ChevronRight className="icon-size-200 shrink-0 text-muted-foreground" aria-hidden="true" /></button></li>)}</ul>}
                    </section>
                    {selected ? <Groups key={selected.user} employee={selected} /> : <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-8 text-center"><Users className="icon-size-700 text-brand-foreground" aria-hidden="true" /><h2 className="mt-4 text-400 font-semibold">Gruppen anzeigen</h2><p className="mt-2 text-300 text-muted-foreground">Wählen Sie einen Mitarbeiter aus den Suchergebnissen aus.</p></section>}
                </div>
            </main>
    );
}

function App() {
    const { isDark, toggleTheme } = useThemeContext();
    const [area, setArea] = useState<"groups" | "servicedesk" | "dashboard">("groups");

    return (
        <div className="min-h-full bg-background font-base text-foreground">
            <header className="border-b bg-card">
                <div className="flex items-center justify-between gap-4 px-2 py-4 sm:px-4">
                    <nav aria-label="Bereiche" className="flex flex-wrap gap-2">
                        <button type="button" aria-current={area === "groups" ? "page" : undefined} onClick={() => setArea("groups")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-300 font-semibold focus-visible:outline-2 focus-visible:outline-ring ${area === "groups" ? "bg-brand text-on-brand" : "hover:bg-muted"}`}><Users className="icon-size-300" aria-hidden="true" />Gruppenübersicht</button>
                        <button type="button" aria-current={area === "servicedesk" ? "page" : undefined} onClick={() => setArea("servicedesk")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-300 font-semibold focus-visible:outline-2 focus-visible:outline-ring ${area === "servicedesk" ? "bg-brand text-on-brand" : "hover:bg-muted"}`}><Headset className="icon-size-300" aria-hidden="true" />Servicedesk</button>
                        <button type="button" aria-current={area === "dashboard" ? "page" : undefined} onClick={() => setArea("dashboard")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-300 font-semibold focus-visible:outline-2 focus-visible:outline-ring ${area === "dashboard" ? "bg-brand text-on-brand" : "hover:bg-muted"}`}><LayoutDashboard className="icon-size-300" aria-hidden="true" />Dashboard</button>
                    </nav>
                    <button type="button" onClick={toggleTheme} aria-label={isDark ? "Helles Design aktivieren" : "Dunkles Design aktivieren"} className="rounded-lg border p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{isDark ? <Sun className="icon-size-300" /> : <Moon className="icon-size-300" />}</button>
                </div>
            </header>
            {area === "groups" ? <GroupsPage /> : area === "servicedesk" ? <Servicedesk /> : <Dashboard />}
        </div>
    );
}

export default App;
