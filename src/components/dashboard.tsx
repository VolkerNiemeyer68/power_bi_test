import { useCallback, useEffect, useState } from "react";
import { KpiCard, VegaVisual, type CardRenderer } from "@microsoft/fabric-visuals";
import { formatValue, isDataTable, type DataTable } from "@microsoft/fabric-visuals-core";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { useThemeContext } from "@/hooks/theme.context";
import { snapshot, readSnapshot, departments, readDepartments, dailyRequests, readDailyRequests, type Snapshot } from "@/queries/dashboard";

const query = snapshot();
const departmentsQuery = departments();
const dailyQuery = dailyRequests();
const pollInterval = 5 * 60 * 1000;
const staleAfter = 90 * 60 * 1000;
const countFormat = query.columnMetadata["Snapshot[ActiveRequests]"].format;
const averageFormat = query.columnMetadata["Snapshot[AverageActiveDays]"].format;
const numberText = (value: number | null, format: string) => value === null ? "—" : String(formatValue(value, format, { locale: "de" }));
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const dayFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeZone: "UTC" });

function referenceTable(data: Snapshot): DataTable {
    return {
        columns: [
            { name: "label" }, { name: "value", format: averageFormat },
            { name: "unit" }, { name: "basis" },
        ],
        rows: [
            ["Durchschnittlich aktiv", data.activeDays, "Kalendertage",
                `${numberText(data.activeWithCreated, countFormat)} von ${numberText(data.active, countFormat)} aktiven Anfragen mit Erstellungsdatum`],
            ["Ø Abschlussaufwand", data.resolutionHours, "Stunden",
                `${numberText(data.resolvedWithEffort, countFormat)} von ${numberText(data.resolved, countFormat)} behobenen Anfragen mit Abschlussaufwand`],
            ["Ø Projektaufwand", data.projectDays, "Manntage (MTG)",
                `${numberText(data.projectsWithEffort, countFormat)} von ${numberText(data.total, countFormat)} Anfragen mit Projektaufwand · alle Status`],
        ],
    };
}

const renderReferences: CardRenderer = (data) => {
    if (!isDataTable(data)) throw new Error("Die Kennzahlen benötigen eine einzelne Referenztabelle.");
    return <dl className="grid gap-6 border-t pt-6 sm:grid-cols-3">
        {data.rows.map(([label, value, unit, basis]) => <div key={String(label)} className="min-w-0">
            <dt className="text-300 font-semibold">{String(label)}</dt>
            <dd className="mt-3 font-numeric text-600 font-bold text-emphasis-foreground">{value === null ? "—" : String(formatValue(value, data.columns[1].format, { locale: "de" }))}</dd>
            <dd className="text-300 text-muted-foreground">{String(unit)}</dd>
            <dd className="mt-3 text-200 text-muted-foreground">{String(basis)}</dd>
        </div>)}
    </dl>;
};

const renderDepartments: CardRenderer = (data, theme) => {
    if (!isDataTable(data)) throw new Error("Die Kuchengrafik benötigt eine einzelne Abteilungstabelle.");
    return <section aria-labelledby="departments-heading">
        <h2 id="departments-heading" className="text-400 font-semibold">Top 10 Abteilungen und Rest nach aktiven Anfragen</h2>
        <p className="mt-1 text-200 text-muted-foreground">Die Grafik zeigt die zehn größten Abteilungen und fasst alle übrigen als „Rest“ zusammen. Prozentanteile beziehen sich auf alle aktiven Anfragen. Die Tabelle enthält alle Abteilungen nach Anzahl absteigend. Fehlende Zuordnungen erscheinen als „Ohne Abteilung“.</p>
        <VegaVisual data={data} spec={JSON.stringify(departmentsQuery.vegaLiteSpec)} theme={theme} chromeless style={{ height: "calc(var(--spacing) * 128)" }} />
        <details className="mt-4 text-300">
            <summary className="cursor-pointer rounded-lg py-2 font-semibold focus-visible:outline-2 focus-visible:outline-ring">Alle {data.rows.length} Abteilungen als Tabelle anzeigen</summary>
            <div className="mt-2 max-h-80 overflow-auto">
                <table className="w-full text-left">
                    <caption className="sr-only">Aktive Anfragen nach Abteilung aus dem gespeicherten Snapshot</caption>
                    <thead><tr className="border-b"><th scope="col" className="py-2">Abteilung</th><th scope="col" className="py-2 text-right">Aktive Anfragen</th></tr></thead>
                    <tbody>{data.rows.map(([department, active]) => <tr key={String(department)} className="border-b">
                        <th scope="row" className="py-2 font-normal">{String(department)}</th>
                        <td className="py-2 text-right font-numeric">{String(formatValue(active, data.columns[1].format, { locale: "de" }))}</td>
                    </tr>)}</tbody>
                </table>
            </div>
        </details>
    </section>;
};

const renderCharts: CardRenderer = (data, theme) => {
    if (isDataTable(data)) throw new Error("Die Dashboard-Grafiken benötigen benannte Snapshot-Tabellen.");
    const daily = data.daily;
    return <div className="space-y-8">
        {data.departments && renderDepartments(data.departments, theme)}
        {daily && <section aria-labelledby="daily-heading">
            <h2 id="daily-heading" className="text-400 font-semibold">Verhältnis der neuen und beendeten Anfragen je Tag der letzten 60 Tage</h2>
            <p className="mt-1 text-200 text-muted-foreground">60 abgeschlossene Kalendertage in Berliner Zeit. Neu = an diesem Tag erstellt; Beendet = behoben oder storniert nach gespeichertem Beendigungsdatum. Je Tag entspricht Neu + Beendet 100 %. Tage ohne Ereignisse bleiben leer. Gesamter Servicedesk, unabhängig von der Abteilungsverteilung.</p>
            {daily.rows.some(([, created, ended]) => Number(created) + Number(ended) > 0)
                ? <VegaVisual data={daily} spec={JSON.stringify(dailyQuery.vegaLiteSpec)} theme={theme} chromeless
                    style={{ height: "calc(var(--spacing) * 96)" }} />
                : <p className="py-6 text-300 text-muted-foreground">Keine neuen oder beendeten Anfragen im Zeitraum.</p>}
            <details className="mt-4 text-300">
                <summary className="cursor-pointer rounded-lg py-2 font-semibold focus-visible:outline-2 focus-visible:outline-ring">Alle 60 Tage als Tabelle anzeigen</summary>
                <div className="mt-2 max-h-80 overflow-auto">
                    <table className="w-full text-left">
                        <caption className="sr-only">Neue und beendete Anfragen je Tag aus dem gespeicherten Snapshot</caption>
                        <thead><tr className="border-b"><th scope="col" className="py-2">Tag</th><th scope="col" className="py-2 text-right">Neu</th><th scope="col" className="py-2 text-right">Beendet</th></tr></thead>
                        <tbody>{daily.rows.map(([day, created, ended]) => <tr key={String(day)} className="border-b">
                            <th scope="row" className="py-2 font-normal">{dayFormat.format(new Date(`${day}T00:00:00Z`))}</th>
                            <td className="py-2 text-right font-numeric">{numberText(Number(created), countFormat)}</td>
                            <td className="py-2 text-right font-numeric">{numberText(Number(ended), countFormat)}</td>
                        </tr>)}</tbody>
                    </table>
                </div>
            </details>
        </section>}
    </div>;
};

export function Dashboard() {
    const { theme } = useThemeContext();
    const { data, isLoading, error, refetch } = useSemanticModelQuery({ ...query, bypassCache: true });
    const departmentResult = useSemanticModelQuery({ ...departmentsQuery, bypassCache: true });
    const dailyResult = useSemanticModelQuery({ ...dailyQuery, bypassCache: true });
    const refetchDepartments = departmentResult.refetch;
    const refetchDaily = dailyResult.refetch;
    const refresh = useCallback(async () => {
        await Promise.all([refetch(), refetchDepartments(), refetchDaily()]);
    }, [refetch, refetchDepartments, refetchDaily]);
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(Date.now());
            void refresh();
        }, pollInterval);
        const onVisible = () => {
            if (document.visibilityState === "visible") {
                setNow(Date.now());
                void refresh();
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refresh]);
    const result = data?.status === "success" ? readSnapshot(data.table) : undefined;
    const message = error?.message ?? (data?.status === "error" ? data.error.message : result?.status === "error" ? result.message : undefined);
    const current = result?.status === "success" ? result.snapshot : undefined;
    const distribution = departmentResult.data?.status === "success" ? readDepartments(departmentResult.data.table) : undefined;
    const distributionError = departmentResult.error?.message
        ?? (departmentResult.data?.status === "error" ? departmentResult.data.error.message : distribution?.status === "error" ? distribution.message : undefined);
    const daily = dailyResult.data?.status === "success" ? readDailyRequests(dailyResult.data.table) : undefined;
    const dailyError = dailyResult.error?.message
        ?? (dailyResult.data?.status === "error" ? dailyResult.data.error.message : daily?.status === "error" ? daily.message : undefined);
    const chartTables: Record<string, DataTable> = {};
    if (!distributionError && distribution?.status === "success") chartTables.departments = distribution.table;
    if (!dailyError && daily?.status === "success") chartTables.daily = daily.table;

    return <main className="px-2 py-10 sm:px-4 sm:py-14">
        <p className="text-200 font-semibold uppercase tracking-wider text-brand-foreground">Service / Dashboard</p>
        <h1 className="mt-3 font-page-title text-page-title text-emphasis-foreground">Servicedesk-Dashboard</h1>
        <p className="mt-2 font-page-subtitle text-page-subtitle text-muted-foreground">Aktive Anfragen und durchschnittlicher Aufwand auf einen Blick.</p>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-300">
            <p className="text-muted-foreground">Serverseitig stündlich berechnet. Diese Ansicht liest nur den gespeicherten Snapshot.</p>
            <button type="button" disabled={isLoading || departmentResult.isLoading || dailyResult.isLoading} onClick={() => void refresh()} className="rounded-lg border bg-card px-4 py-2 font-semibold hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring">Datenstand laden</button>
        </div>
        <div className="mt-6">
            {message ? <p role="alert" className="rounded-xl border bg-card p-6 text-300 text-destructive">Kennzahlen konnten nicht geladen werden: {message}</p>
                : current ? <>
                    <p className="mb-4 text-300 text-muted-foreground">Datenstand: <time dateTime={new Date(current.timestamp).toISOString()}>{dateFormat.format(current.timestamp)} (Berlin)</time></p>
                    {now - current.timestamp >= staleAfter && <p role="alert" className="mb-4 rounded-lg border p-4 text-300 text-destructive">Der Datenstand ist älter als 90 Minuten. Die stündliche Modellaktualisierung ist möglicherweise verzögert oder fehlgeschlagen.</p>}
                    {isLoading && <p role="status" className="mb-4 text-300 text-muted-foreground">Gespeicherter Datenstand wird geladen …</p>}
                    {distributionError && <p role="alert" className="mb-4 rounded-lg border p-4 text-300 text-destructive">Die Abteilungsverteilung konnte nicht geladen werden: {distributionError}</p>}
                    {departmentResult.isLoading && <p role="status" className="mb-4 text-300 text-muted-foreground">Abteilungsverteilung wird geladen …</p>}
                    {!distributionError && distribution?.status === "empty" && <p className="mb-4 text-300 text-muted-foreground">Keine aktiven Anfragen für die Abteilungsverteilung vorhanden.</p>}
                    {dailyError && <p role="alert" className="mb-4 rounded-lg border p-4 text-300 text-destructive">Die Tagesauswertung konnte nicht geladen werden: {dailyError}</p>}
                    {dailyResult.isLoading && <p role="status" className="mb-4 text-300 text-muted-foreground">Tagesauswertung wird geladen …</p>}
                    {!dailyError && daily?.status === "empty" && <p className="mb-4 text-300 text-muted-foreground">Noch kein Tages-Snapshot vorhanden. Bitte die Modellaktualisierung abwarten.</p>}
                    <KpiCard theme={theme} header={{ title: "Aktive Anfragen", subtitle: "Status Aktiv · gesamter Servicedesk" }}
                        callout={{ metric: { value: current.active, format: countFormat }, metricSubtext: "Anfragen" }}
                        chart={Object.keys(chartTables).length > 0 ? { dataTable: chartTables, render: renderCharts } : undefined}
                        referenceMetrics={{ dataTable: referenceTable(current), render: renderReferences }} />
                    <div className="mt-6 space-y-2 text-200 text-muted-foreground">
                        <p>Aktivdauer: verstrichene Kalendertage seit Erstellung bis zum Datenstand, nur für aktive Anfragen.</p>
                        <p>Abschlussaufwand: je behobener Anfrage summierte Abschlussminuten, geteilt durch 60. Projektaufwand: erfasster Wert aus „Servicedesk Projekte“ / „Servicedesk Dashboard“ in Manntagen, über alle Status.</p>
                        <p>Durchschnitte berücksichtigen nur vorhandene Werte; echte Nullwerte zählen mit. Ohne Berechnungsbasis erscheint „—“. Der gespeicherte Snapshot wird hier alle fünf Minuten sowie bei Rückkehr zur Seite neu gelesen; es wird kein Servicedesk-Import ausgelöst.</p>
                    </div>
                </>
                    : result?.status === "empty" ? <p className="rounded-xl border bg-card p-6 text-300 text-muted-foreground">Noch kein Kennzahlen-Snapshot vorhanden. Bitte die erste Modellaktualisierung abwarten.</p>
                        : <div role="status" className="rounded-xl border bg-card p-6"><p className="text-300 text-muted-foreground">Kennzahlen werden geladen …</p><div aria-hidden="true" className="mt-4 h-48 animate-pulse rounded-lg bg-muted" /></div>}
        </div>
    </main>;
}
