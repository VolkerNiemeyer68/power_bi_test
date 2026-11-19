import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Dashboard } from "./dashboard";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";

vi.mock("@/hooks/theme.context", async () => {
    const { lightThemeColors } = await import("@microsoft/fabric-visuals-core");
    return { useThemeContext: () => ({ theme: lightThemeColors }) };
});
vi.mock("@/hooks/use-semantic-model-query", () => ({
    useSemanticModelQuery: vi.fn(),
}));
vi.mock("@microsoft/fabric-visuals", async importOriginal => {
    const actual = await importOriginal<typeof import("@microsoft/fabric-visuals")>();
    return { ...actual, VegaVisual: ({ spec }: { spec: string }) => <div role="img" aria-label={spec.includes("Verhältnis") ? "Tagesdiagramm Neu und Beendet" : "Kuchengrafik der aktiven Anfragen nach Abteilung"} /> };
});

const table = {
    columns: [
        "ActiveRequests", "ActiveWithCreated", "ResolvedRequests", "ResolvedWithEffort",
        "ProjectsWithEffort", "TotalRequests", "AverageActiveDays", "AverageResolutionHours",
        "AverageProjectDays", "SnapshotUtc",
    ].map(name => ({ name: `Snapshot[${name}]`, dataType: "unknown" })),
    rows: [[257, 257, 26658, 26658, 558, 27580, 202.06842891531988, 2.818478505514292, 2.6847132616487457, "2026-11-17T12:15:07.963"]],
};
const refetch = vi.fn<() => Promise<void>>();
const refetchDepartments = vi.fn<() => Promise<void>>();
const refetchDaily = vi.fn<() => Promise<void>>();
const result = () => ({
    data: { status: "success" as const, table, requestId: "", fromCache: false },
    isLoading: false, error: undefined, refetch,
});
const departmentResult = () => ({
    ...result(),
    data: { ...result().data, table: {
        columns: ["DepartmentSnapshot[Department]", "DepartmentSnapshot[ActiveRequests]"].map(name => ({ name, dataType: "unknown" })),
        rows: [["IT & Digitalisierung", 25], ["Ohne Abteilung", 53], ["Vertrieb", 18]],
    } },
    refetch: refetchDepartments,
});
const dailyResult = () => ({
    ...result(),
    data: { ...result().data, table: {
        columns: ["Day", "NewRequests", "EndedRequests"].map(name => ({ name: `DailyRequestSnapshot[${name}]`, dataType: "unknown" })),
        rows: Array.from({ length: 60 }, (_, index) => [
            new Date(Date.UTC(2026, 8, 18 + index)).toISOString(), index === 0 ? 7 : 0, index === 0 ? 10 : 0,
        ]),
    } },
    refetch: refetchDaily,
});
function mockResults(main: ReturnType<typeof useSemanticModelQuery> = result(), distribution: ReturnType<typeof useSemanticModelQuery> = departmentResult(), daily: ReturnType<typeof useSemanticModelQuery> = dailyResult()) {
    vi.mocked(useSemanticModelQuery).mockImplementation(options => options.query.includes("'DepartmentSnapshot'")
        ? distribution : options.query.includes("'DailyRequestSnapshot'") ? daily : main);
}

describe("Dashboard", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-17T13:00:00Z"));
        refetch.mockReset().mockResolvedValue(undefined);
        refetchDepartments.mockReset().mockResolvedValue(undefined);
        refetchDaily.mockReset().mockResolvedValue(undefined);
        mockResults();
        vi.stubGlobal("ResizeObserver", class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("rendert alle geprüften Kennzahlen mit Einheiten, Berechnungsbasis und Berliner Datenstand", () => {
        render(<Dashboard />);
        expect(screen.getByText("257")).toBeInTheDocument();
        expect(screen.getByText("202,1")).toBeInTheDocument();
        expect(screen.getByText("2,8")).toBeInTheDocument();
        expect(screen.getByText("2,7")).toBeInTheDocument();
        for (const text of ["Kalendertage", "Stunden", "Manntage (MTG)"]) expect(screen.getByText(text)).toBeInTheDocument();
        expect(screen.getByText(/257 von 257 aktiven/)).toBeInTheDocument();
        expect(screen.getByText(/558 von 27.580 Anfragen/)).toBeInTheDocument();
        expect(document.querySelector("time")).toHaveAttribute("dateTime", "2026-11-17T12:15:07.963Z");
        expect(document.querySelector("time")).toHaveTextContent("13:15");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("zeigt echte Nullwerte und fehlende Durchschnitte unterschiedlich", () => {
        mockResults({
            ...result(), data: { ...result().data, table: { ...table, rows: [[0, 0, 0, 0, 0, 0, null, 0, null, "2026-11-17T12:15:07.963"]] } },
        });
        render(<Dashboard />);
        expect(screen.getByText("0", { selector: '[data-card-part="metric"]' })).toBeInTheDocument();
        expect(screen.getByText("0,0")).toBeInTheDocument();
        expect(screen.getAllByText("—")).toHaveLength(2);
    });

    it("liest nur den gespeicherten Snapshot regelmäßig ohne Sitzungscache und räumt Timer auf", () => {
        const { unmount } = render(<Dashboard />);
        expect(useSemanticModelQuery).toHaveBeenCalledWith(expect.objectContaining({
            connection: "servicedesk-kennzahlen", query: expect.stringContaining("'Snapshot'"), bypassCache: true,
        }));
        act(() => vi.advanceTimersByTime(60 * 60 * 1000));
        expect(refetch).toHaveBeenCalledTimes(12);
        expect(refetchDepartments).toHaveBeenCalledTimes(12);
        expect(refetchDaily).toHaveBeenCalledTimes(12);
        unmount();
        act(() => vi.advanceTimersByTime(60 * 60 * 1000));
        expect(refetch).toHaveBeenCalledTimes(12);
        expect(refetchDepartments).toHaveBeenCalledTimes(12);
        expect(refetchDaily).toHaveBeenCalledTimes(12);
    });

    it("warnt bei überaltertem Datenstand auch ohne Navigation", () => {
        render(<Dashboard />);
        act(() => vi.advanceTimersByTime(50 * 60 * 1000));
        expect(screen.getByRole("alert")).toHaveTextContent("älter als 90 Minuten");
        expect(screen.getByText("257")).toBeInTheDocument();
    });

    it("lädt bei Rückkehr zum Tab sowie auf Knopfdruck, aber nicht mehr nach dem Verlassen", () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        const { unmount } = render(<Dashboard />);
        fireEvent(document, new Event("visibilitychange"));
        fireEvent.click(screen.getByRole("button", { name: "Datenstand laden" }));
        expect(refetch).toHaveBeenCalledTimes(2);
        expect(refetchDepartments).toHaveBeenCalledTimes(2);
        expect(refetchDaily).toHaveBeenCalledTimes(2);
        unmount();
        fireEvent(document, new Event("visibilitychange"));
        expect(refetch).toHaveBeenCalledTimes(2);
        expect(refetchDepartments).toHaveBeenCalledTimes(2);
        expect(refetchDaily).toHaveBeenCalledTimes(2);
    });

    it("zeigt Lade-, Leer-, Fehler- und ungültige Datenzustände ausdrücklich", () => {
        mockResults({ ...result(), data: undefined, isLoading: true });
        const { rerender } = render(<Dashboard />);
        expect(screen.getByRole("status")).toHaveTextContent("Kennzahlen werden geladen");
        mockResults({ ...result(), data: { ...result().data, table: { columns: [], rows: [] } } });
        rerender(<Dashboard />);
        expect(screen.getByText(/Noch kein Kennzahlen-Snapshot/)).toBeInTheDocument();
        mockResults({ ...result(), error: new Error("Zugriff verweigert") });
        rerender(<Dashboard />);
        expect(screen.getByRole("alert")).toHaveTextContent("Zugriff verweigert");
        expect(screen.queryByText("257")).not.toBeInTheDocument();
        mockResults({ ...result(), data: { ...result().data, table: { columns: [], rows: [[1]] } } });
        rerender(<Dashboard />);
        expect(screen.getByRole("alert")).toHaveTextContent("ungültige Werte");
    });

    it("ergänzt die Kuchengrafik und eine lesbare Tabelle einschließlich fehlender Abteilungen", () => {
        render(<Dashboard />);
        expect(screen.getByRole("heading", { name: "Top 10 Abteilungen und Rest nach aktiven Anfragen" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Kuchengrafik/ })).toBeInTheDocument();
        fireEvent.click(screen.getByText("Alle 3 Abteilungen als Tabelle anzeigen"));
        expect(screen.getByRole("rowheader", { name: "Ohne Abteilung" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "53" })).toBeInTheDocument();
        expect(within(screen.getByRole("table", { name: /Aktive Anfragen nach Abteilung aus/ })).getAllByRole("rowheader").map(header => header.textContent)).toEqual([
            "Ohne Abteilung", "IT & Digitalisierung", "Vertrieb",
        ]);
        expect(useSemanticModelQuery).toHaveBeenCalledWith(expect.objectContaining({
            connection: "servicedesk-kennzahlen", query: expect.stringContaining("'DepartmentSnapshot'"), bypassCache: true,
        }));
    });

    it("ergänzt das tägliche Verhältnis samt vollständiger Tabelle ohne Abteilungsfilter", () => {
        render(<Dashboard />);
        expect(screen.getByRole("heading", { name: /Verhältnis der neuen und beendeten/ })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Tagesdiagramm/ })).toBeInTheDocument();
        fireEvent.click(screen.getByText("Alle 60 Tage als Tabelle anzeigen"));
        const dailyTable = within(screen.getByRole("table", { name: /Neue und beendete Anfragen je Tag/ }));
        expect(dailyTable.getAllByRole("row")).toHaveLength(61);
        expect(dailyTable.getByRole("rowheader", { name: "18.09.26" })).toBeInTheDocument();
        expect(dailyTable.getByRole("cell", { name: "7" })).toBeInTheDocument();
        expect(useSemanticModelQuery).toHaveBeenCalledWith(expect.objectContaining({
            connection: "servicedesk-kennzahlen", query: expect.stringContaining("'DailyRequestSnapshot'"), bypassCache: true,
        }));
    });

    it("isoliert Fehler und Ladezustand der Tageszahlen und zeigt einen leeren Zeitraum ausdrücklich", () => {
        mockResults(result(), departmentResult(), { ...dailyResult(), data: undefined, isLoading: true });
        const { rerender } = render(<Dashboard />);
        expect(screen.getByRole("status")).toHaveTextContent("Tagesauswertung wird geladen");
        expect(screen.getByRole("button", { name: "Datenstand laden" })).toBeDisabled();
        mockResults(result(), departmentResult(), { ...dailyResult(), error: new Error("Tagesimport fehlt") });
        rerender(<Dashboard />);
        expect(screen.getByRole("alert")).toHaveTextContent("Tagesimport fehlt");
        expect(screen.getByText("257")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Kuchengrafik/ })).toBeInTheDocument();
        expect(screen.queryByRole("img", { name: /Tagesdiagramm/ })).not.toBeInTheDocument();
        mockResults(result(), departmentResult(), { ...dailyResult(), data: {
            ...dailyResult().data, table: { columns: [], rows: [] },
        } });
        rerender(<Dashboard />);
        expect(screen.getByText(/Noch kein Tages-Snapshot/)).toBeInTheDocument();
        const empty = dailyResult();
        mockResults(result(), departmentResult(), { ...empty, data: { ...empty.data, table: {
            ...empty.data.table, rows: empty.data.table.rows.map(([day]) => [day, 0, 0]),
        } } });
        rerender(<Dashboard />);
        expect(screen.getByText("Keine neuen oder beendeten Anfragen im Zeitraum.")).toBeInTheDocument();
    });

    it("zeigt Fehler, Ladezustand und leere Verteilung an, ohne bestehende Kennzahlen zu verlieren", () => {
        mockResults(result(), { ...departmentResult(), data: undefined, isLoading: true });
        const { rerender } = render(<Dashboard />);
        expect(screen.getByRole("status")).toHaveTextContent("Abteilungsverteilung wird geladen");
        expect(screen.getByText("257")).toBeInTheDocument();
        mockResults(result(), { ...departmentResult(), error: new Error("Abteilungsabfrage fehlgeschlagen") });
        rerender(<Dashboard />);
        expect(screen.getByRole("alert")).toHaveTextContent("Abteilungsabfrage fehlgeschlagen");
        expect(screen.getByText("257")).toBeInTheDocument();
        expect(screen.queryByRole("img", { name: /Kuchengrafik/ })).not.toBeInTheDocument();
        mockResults(result(), { ...departmentResult(), data: { ...departmentResult().data, table: { columns: [], rows: [] } } });
        rerender(<Dashboard />);
        expect(screen.getByText(/Keine aktiven Anfragen für die Abteilungsverteilung/)).toBeInTheDocument();
    });
});
