import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DataGrid, type GridColumnDef } from "@microsoft/fabric-datagrid";
import { DropdownSlicer } from "@microsoft/fabric-slicers";
import type { DataTable, SemanticSelection } from "@microsoft/fabric-visuals-core";
import { InteractionManager, type ManagedInteractionSource } from "@microsoft/fabric-interaction-manager";
import { InteractionManagerProvider, useManagedInteractionSource } from "@microsoft/fabric-interaction-manager/react";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { useQueryFactoryTarget } from "@/hooks/use-query-factory-target";
import { useThemeContext } from "@/hooks/theme.context";
import { toDataTable } from "@/lib/to-data-table";
import { getRayfinClient } from "@/lib/rayfin-client";
import { searchDataTable } from "@/lib/search-data-table";
import { formatLocaleDateTime } from "@/lib/format-locale-date-time";
import { cn } from "@/lib/utils";
import { bookmarkFilterFields, parseBookmarkFilters, serializeBookmarkFilters, type BookmarkFilters } from "@/lib/servicedesk-bookmarks";
import { defaults, filterOptions, liveRequests, readDefaults, requests } from "@/queries/servicedesk";

const defaultsQuery = defaults();
const optionsQuery = filterOptions();
const liveRequestsEnabled = import.meta.env.VITE_SERVICEDESK_LIVE_STATUS !== "disabled";
const refreshInterval = 30 * 60 * 1000;
const refreshTimeFormat = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin",
});
const columnWeights = {
    number: 1,
    title: 3,
    owner: 1,
    employee: 1,
    department: 1,
    state: 0.5,
    reason: 1,
    priority: 0.5,
    created: 1,
} as const;
const columns: GridColumnDef[] = [
    ...["number", "title"].map((id) => ({
        id,
        header: id === "number" ? "Anfrage" : "Titel",
        cellRenderer: (value, row) => {
            const href = row.link;
            if (typeof href !== "string" || !href.startsWith("https://brandgroup-service.crm4.dynamics.com/")) {
                return <span>{value} (Servicedesk-Link fehlt oder ist ungültig)</span>;
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" title={`${value} im Servicedesk öffnen (neuer Tab)`} className="text-brand-foreground underline focus-visible:outline-2 focus-visible:outline-ring">{value}</a>;
        },
    } satisfies GridColumnDef)),
    { id: "owner", header: "Bearbeiter" },
    { id: "employee", header: "Mitarbeiter" },
    { id: "department", header: "Abteilung" },
    { id: "state", header: "Status" },
    { id: "reason", header: "Statusgrund" },
    { id: "priority", header: "Priorität" },
    { id: "created", header: "Erstellt am" },
];

export function Servicedesk() {
    const { data, isLoading, error, refetch } = useSemanticModelQuery(defaultsQuery);
    const settings = data?.status === "success" ? readDefaults(data.table) : undefined;

    return (
        <main className="px-2 py-10 sm:px-4 sm:py-14">
            <p className="text-200 font-semibold uppercase tracking-wider text-brand-foreground">Service / Servicedesk</p>
            <h1 className="mt-3 font-page-title text-page-title text-emphasis-foreground">Servicedesk-Anfragen</h1>
            <NextScheduledRefresh />
            <p className="mt-2 font-page-subtitle text-page-subtitle text-muted-foreground">Standardmäßig aktive Anfragen mit Ihnen als Bearbeiter. Für bg-pp@brand-group.com bleibt der Bearbeiterfilter leer. Alle Filter sind anpassbar.</p>
            <p className="mt-2 text-300 text-muted-foreground">Ein Klick auf Anfragenummer oder Titel öffnet die Anfrage im Servicedesk in einem neuen Tab.</p>
            <div className="mt-10">
                {error ? <LoadError message={error.message} retry={() => void refetch()} />
                    : isLoading || !data ? <Loading />
                    : data.status !== "success" ? <LoadError message={data.error.message} retry={() => void refetch()} />
                    : settings?.status === "error" ? <LoadError message={settings.message} retry={() => void refetch()} />
                    : settings?.status === "success" ? <FilterOptions owner={settings.owner} /> : null}
            </div>
        </main>
    );
}

function NextScheduledRefresh() {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const update = () => {
            clearTimeout(timer);
            const current = Date.now();
            setNow(current);
            timer = setTimeout(update, refreshInterval - current % refreshInterval);
        };
        update();
        document.addEventListener("visibilitychange", update);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", update);
        };
    }, []);

    const next = new Date((Math.floor(now / refreshInterval) + 1) * refreshInterval);
    return <p className="mt-2 text-300 text-muted-foreground">
        Nächstes geplantes Datenupdate: <time dateTime={next.toISOString()}>{refreshTimeFormat.format(next)}</time> Uhr (Berlin).
        Der tatsächliche Import kann sich verzögern.
    </p>;
}

function Loading() {
    return <div role="status" className="rounded-xl border bg-card p-6"><p className="text-300 text-muted-foreground">Anfragen werden geladen …</p><div aria-hidden="true" className="mt-4 h-64 animate-pulse rounded-lg bg-muted" /></div>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
    return <div role="alert" className="rounded-xl border bg-card p-6 text-300 text-destructive">Anfragen konnten nicht geladen werden: {message} <button type="button" className="underline focus-visible:outline-2 focus-visible:outline-ring" onClick={retry}>Erneut versuchen</button></div>;
}

function FilterOptions({ owner }: { owner: string | null }) {
    const { data, isLoading, error, refetch } = useSemanticModelQuery(optionsQuery);
    if (error) return <LoadError message={error.message} retry={() => void refetch()} />;
    if (isLoading || !data) return <Loading />;
    if (data.status !== "success") return <LoadError message={data.error.message} retry={() => void refetch()} />;
    return <ManagedRequests owner={owner} options={toDataTable(data.table, optionsQuery.columnMetadata)} />;
}

function ManagedRequests({ owner, options }: { owner: string | null; options: DataTable }) {
    const [manager] = useState(() => new InteractionManager({
        semanticModelId: "ee45cbbe-21c8-4cef-a183-b79d0d71e946",
        fields: {
            id: { table: "incident", column: "Anfrage", dataType: "string" },
            owner: { table: "incident", column: "Bearbeiter", dataType: "string" },
            employee: { table: "incident", column: "Mitarbeiter", dataType: "string" },
            department: { table: "contact", column: "Abteilung", dataType: "string" },
            state: { table: "incident", column: "statecodename", dataType: "string" },
        },
        components: {
            owner: { kind: "slicer", selectableFields: ["owner"] },
            employee: { kind: "slicer", selectableFields: ["employee"] },
            department: { kind: "slicer", selectableFields: ["department"] },
            state: { kind: "slicer", selectableFields: ["state"] },
            requests: { kind: "grid", selectableFields: ["id"] },
        },
    }));
    return <InteractionManagerProvider manager={manager}><RequestFilters owner={owner} options={options} /></InteractionManagerProvider>;
}

function slicerSelection(selections: readonly SemanticSelection[]): (string | null)[] | null {
    if (selections.length === 0) return null;
    return selections.flatMap(selection => selection.predicates.flatMap(predicate =>
        predicate.type === "set" ? predicate.values.map(value => value.kind === "blank" ? null : String(value.value)) : [],
    ));
}

function RequestFilters({ owner, options }: { owner: string | null; options: DataTable }) {
    const ownerSource = useManagedInteractionSource("owner");
    const employeeSource = useManagedInteractionSource("employee");
    const departmentSource = useManagedInteractionSource("department");
    const stateSource = useManagedInteractionSource("state");
    const [initialized, setInitialized] = useState(false);
    const { onInteraction: setOwner } = ownerSource;
    const { onInteraction: setStatus } = stateSource;
    useEffect(() => {
        if (owner !== null) setOwner([{ action: "select", selections: [{ predicates: [{ type: "set", fieldId: "owner", values: [{ kind: "value", value: owner }] }] }] }]);
        setStatus([{ action: "select", selections: [{ predicates: [{ type: "set", fieldId: "state", values: [{ kind: "value", value: "Aktiv" }] }] }] }]);
    }, [owner, setOwner, setStatus]);
    // Do not mount the query target before the manager has accepted both defaults.
    if (!initialized && stateSource.selections.length > 0 && (owner === null || ownerSource.selections.length > 0)) {
        setInitialized(true);
    }

    const filters = [
        { field: "owner", title: "Bearbeiter", source: ownerSource },
        { field: "employee", title: "Mitarbeiter", source: employeeSource },
        { field: "department", title: "Abteilung", source: departmentSource },
        { field: "state", title: "Status", source: stateSource },
    ];
    const errors = filters.flatMap(filter => filter.source.error ? [filter.source.error.message] : []);
    return <>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filters.map(({ field, title, source }) => <RequestSlicer key={field} field={field} title={title} source={source} options={options} />)}
        </div>
        {errors.map((message, index) => <p role="alert" key={index} className="mb-4 text-300 text-destructive">{message}</p>)}
        <BookmarkManager sources={{
            owner: ownerSource,
            employee: employeeSource,
            department: departmentSource,
            state: stateSource,
        }} />
        {initialized && errors.length === 0 && <RequestGrid />}
    </>;
}

type Bookmark = {
    id: string;
    name: string;
    filters: string;
    user_id: string;
};

function BookmarkManager({ sources }: { sources: Record<typeof bookmarkFilterFields[number], ManagedInteractionSource> }) {
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string>();
    const client = useMemo(() => getRayfinClient(), []);

    const loadBookmarks = useCallback(async () => {
        setIsLoading(true);
        try {
            const items: Bookmark[] = [];
            let cursor: string | undefined;
            let hasNextPage: boolean;
            do {
                let query = client.data.ServicedeskBookmark
                    .select(["id", "name", "filters", "user_id"])
                    .orderBy({ name: "asc" })
                    .first(100);
                if (cursor) query = query.after(cursor);
                const page = await query.executePaginated();
                items.push(...page.items);
                cursor = page.endCursor;
                hasNextPage = page.hasNextPage;
            } while (hasNextPage && cursor);
            setBookmarks(items);
            setError(undefined);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Lesezeichen konnten nicht geladen werden.");
        } finally {
            setIsLoading(false);
        }
    }, [client]);

    useEffect(() => {
        void loadBookmarks();
    }, [loadBookmarks]);

    const applyFilters = useCallback((filters: BookmarkFilters) => {
        for (const field of bookmarkFilterFields) {
            const values = filters[field];
            if (values === null) {
                sources[field].onInteraction([{ action: "clear" }]);
            } else {
                sources[field].onInteraction([{
                    action: "select",
                    selections: [{
                        predicates: [{
                            type: "set",
                            fieldId: field,
                            values: values.map(value => value === null ? { kind: "blank" } : { kind: "value", value }),
                        }],
                    }],
                }]);
            }
        }
    }, [sources]);

    const currentFilters = useCallback(() => ({
        owner: slicerSelection(sources.owner.selections),
        employee: slicerSelection(sources.employee.selections),
        department: slicerSelection(sources.department.selections),
        state: slicerSelection(sources.state.selections),
    }), [sources]);

    const chooseBookmark = (id: string) => {
        setSelectedId(id);
        const bookmark = bookmarks.find(item => item.id === id);
        setName(bookmark?.name ?? "");
        if (!bookmark) return;
        const filters = parseBookmarkFilters(bookmark.filters);
        if (!filters) {
            setError("Dieses Lesezeichen enthält ungültige Filtereinstellungen.");
            return;
        }
        setError(undefined);
        applyFilters(filters);
    };

    const save = async (update: boolean) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError("Bitte eine Bezeichnung für das Lesezeichen eingeben.");
            return;
        }
        const session = client.auth.getSession();
        if (!session.isAuthenticated || !session.user) {
            setError("Für Lesezeichen ist eine Anmeldung erforderlich.");
            return;
        }
        if (update && !selectedId) {
            setError("Bitte zuerst ein Lesezeichen auswählen.");
            return;
        }
        setIsBusy(true);
        try {
            const filters = serializeBookmarkFilters(currentFilters());
            if (update) {
                await client.data.ServicedeskBookmark.update({ id: selectedId }, { name: trimmedName, filters });
            } else {
                const created = await client.data.ServicedeskBookmark.create({
                    name: trimmedName,
                    filters,
                    user_id: session.user.id,
                });
                setSelectedId(created.id);
            }
            await loadBookmarks();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Lesezeichen konnte nicht gespeichert werden.");
        } finally {
            setIsBusy(false);
        }
    };

    const remove = async () => {
        if (!selectedId) return;
        setIsBusy(true);
        try {
            await client.data.ServicedeskBookmark.delete({ id: selectedId });
            setSelectedId("");
            setName("");
            await loadBookmarks();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Lesezeichen konnte nicht gelöscht werden.");
        } finally {
            setIsBusy(false);
        }
    };

    const actionClass = "rounded-lg border bg-card px-3 py-2 font-semibold hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring";
    return <section className="mb-6 rounded-xl border bg-card p-4" aria-labelledby="bookmark-heading">
        <h2 id="bookmark-heading" className="text-300 font-semibold">Lesezeichen</h2>
        <p className="mt-1 text-200 text-muted-foreground">Speichert Bearbeiter, Mitarbeiter, Abteilung und Status der aktuellen Ansicht für Ihr Benutzerkonto.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] lg:items-end">
            <label className="text-200">
                <span className="mb-1 block font-medium">Gespeichertes Lesezeichen</span>
                <select value={selectedId} onChange={event => chooseBookmark(event.target.value)} disabled={isLoading || isBusy} className="w-full rounded-lg border bg-background px-3 py-2">
                    <option value="">Auswählen …</option>
                    {bookmarks.map(bookmark => <option key={bookmark.id} value={bookmark.id}>{bookmark.name}</option>)}
                </select>
            </label>
            <label className="text-200">
                <span className="mb-1 block font-medium">Bezeichnung</span>
                <input value={name} onChange={event => setName(event.target.value)} maxLength={100} placeholder="Zum Beispiel: Meine aktiven IT-Anfragen" className="w-full rounded-lg border bg-background px-3 py-2" />
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={actionClass} disabled={isBusy} onClick={() => void save(false)}>Neu speichern</button>
                <button type="button" className={actionClass} disabled={isBusy || !selectedId} onClick={() => void save(true)}>Ändern</button>
                <button type="button" className={actionClass + " text-destructive"} disabled={isBusy || !selectedId} onClick={() => void remove()}>Löschen</button>
            </div>
        </div>
        {isLoading && <p role="status" className="mt-3 text-200 text-muted-foreground">Lesezeichen werden geladen …</p>}
        {error && <p role="alert" className="mt-3 text-200 text-destructive">{error}</p>}
    </section>;
}

function RequestSlicer({ field, title, source, options }: { field: string; title: string; source: ManagedInteractionSource; options: DataTable }) {
    const { theme } = useThemeContext();
    const selection = useMemo(() => slicerSelection(source.selections), [source.selections]);
    return <DropdownSlicer data={options} column={field} title={title} theme={theme} selection={selection} onInteraction={source.onInteraction} />;
}

function RequestGrid() {
    const { theme } = useThemeContext();
    const source = useManagedInteractionSource("requests");
    const [refreshVersion, setRefreshVersion] = useState(0);
    const result = useQueryFactoryTarget("requests", requests, {}, undefined, refreshVersion, liveRequestsEnabled ? liveRequests : undefined);
    const isRefreshing = result.status === "refreshing";
    const isBusy = result.status === "loading" || isRefreshing;
    const loadedData = result.status === "loading" || result.status === "error" ? undefined : result.data;
    const refreshRequests = () => {
        setRefreshVersion(value => value + 1);
    };
    const containerRef = useRef<HTMLDivElement>(null);
    const [availableWidth, setAvailableWidth] = useState<number>();
    const [search, setSearch] = useState("");
    const [locale, setLocale] = useState(() => document.documentElement.dataset.formatLocale || document.documentElement.lang || "en-US");
    useEffect(() => {
        const readLocale = () => setLocale(document.documentElement.dataset.formatLocale || document.documentElement.lang || "en-US");
        const observer = new MutationObserver(readLocale);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang", "data-format-locale"] });
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry?.contentRect.width) setAvailableWidth(entry.contentRect.width);
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [result.status, loadedData]);
    const responsiveColumns = useMemo(() => {
        const totalWeight = Object.values(columnWeights).reduce((total, weight) => total + weight, 0);
        return columns.map(column => ({
            ...column,
            width: availableWidth === undefined
                ? undefined
                : availableWidth * columnWeights[column.id as keyof typeof columnWeights] / totalWeight,
            cellRenderer: column.id === "created"
                ? (value: React.ReactNode) => formatLocaleDateTime(value, locale)
                : column.cellRenderer,
        }));
    }, [availableWidth, locale]);
    const searchableColumns = useMemo(() => columns.map(column => column.id), []);
    const searchedData = useMemo(
        () => loadedData ? searchDataTable(loadedData, search, searchableColumns) : undefined,
        [loadedData, search, searchableColumns],
    );
    return <>
        <div className="mb-4 flex flex-wrap items-end gap-3">
            {loadedData && (
                <label className="block w-full max-w-xl text-200 sm:w-auto sm:flex-1">
                    <span className="mb-1 block font-medium">Servicedesk-Anfragen durchsuchen</span>
                    <input
                        type="search"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Anfrage, Titel, Bearbeiter, Mitarbeiter, Status …"
                        className="w-full rounded-lg border bg-background px-3 py-2"
                    />
                </label>
            )}
            <button type="button" onClick={refreshRequests} disabled={isBusy} aria-describedby="requests-refresh-hint" className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-200 font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
                <RefreshCw aria-hidden="true" className={cn("icon-size-200", isRefreshing && "motion-safe:animate-spin")} />
                Anfragen aktualisieren
            </button>
        </div>
        <p id="requests-refresh-hint" className="mb-4 text-200 text-muted-foreground">{liveRequestsEnabled
            ? "Lädt alle Anfragen für die gewählten Filter live aus Dynamics, einschließlich neuer Anfragen. Bei einem Filterwechsel wird wieder der Importstand verwendet."
            : "Lädt die aktuelle Filteransicht aus Fabric. Statusänderungen erscheinen nach dem geplanten Datenimport (alle 30 Minuten)."}</p>
        {isRefreshing && <p role="status" className="mb-4 text-300 text-muted-foreground">Anfragen werden aktualisiert …</p>}
        {(result.status === "error" || result.status === "refresh-error") && <LoadError message={result.error.message} retry={refreshRequests} />}
        {source.error && <p role="alert" className="text-300 text-destructive">{source.error.message}</p>}
        {result.status === "loading" && <Loading />}
        {loadedData && searchedData && (
            <div ref={containerRef}>
                {loadedData.rows.length === 0
                    ? <p role="status" className="rounded-xl border bg-card p-6 text-300 text-muted-foreground">Keine Anfragen für die gewählten Filter vorhanden.</p>
                    : searchedData.rows.length === 0
                        ? <p role="status" className="rounded-xl border bg-card p-6 text-300 text-muted-foreground">Keine Anfragen entsprechen der Suche „{search}“.</p>
                        : <DataGrid data={searchedData} columns={responsiveColumns} theme={theme} pageSize={25} defaultSort={[{ columnId: "sort", direction: "asc" }, { columnId: "number", direction: "asc" }]} header={{ title: "Servicedesk-Anfragen", subtitle: `Nach Sortierung aufsteigend · ${searchedData.rows.length} von ${loadedData.rows.length} Anfragen` }} selections={source.selections} selectableFields={source.selectableFields} onInteraction={source.onInteraction} />}
            </div>
        )}
    </>;
}
