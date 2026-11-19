import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Servicedesk } from "./servicedesk";
import { querySemanticModel, useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import type { QueryFactoryTargetState } from "@/hooks/use-query-factory-target";
import type { DataTable } from "@microsoft/fabric-visuals-core";
import { toDataTable } from "@/lib/to-data-table";
import { requests } from "@/queries/servicedesk";

vi.mock("@/hooks/theme.context", () => ({
    useThemeContext: () => ({ theme: undefined }),
}));
vi.mock("@/hooks/use-semantic-model-query", () => ({
    useSemanticModelQuery: vi.fn(),
    querySemanticModel: vi.fn(),
}));
const { mockRequestTarget } = vi.hoisted(() => ({
    mockRequestTarget: vi.fn<(targetId: string, factory: typeof requests, params: object, highlight: undefined, refreshVersion: number) => QueryFactoryTargetState<DataTable>>(),
}));
vi.mock("@/hooks/use-query-factory-target", () => ({
    useQueryFactoryTarget: mockRequestTarget,
}));
const { bookmarkItems, bookmarkQuery, bookmarkApi, mockGetRayfinClient } = vi.hoisted(() => {
    const bookmarkItems: Array<{ id: string; name: string; filters: string; user_id: string }> = [];
    const bookmarkQuery = {
        after: vi.fn(),
        executePaginated: vi.fn(),
        first: vi.fn(),
        orderBy: vi.fn(),
    };
    bookmarkQuery.after.mockReturnValue(bookmarkQuery);
    bookmarkQuery.first.mockReturnValue(bookmarkQuery);
    bookmarkQuery.orderBy.mockReturnValue(bookmarkQuery);
    bookmarkQuery.executePaginated.mockImplementation(async () => ({ items: bookmarkItems, endCursor: undefined, hasNextPage: false }));
    const bookmarkApi = {
        select: vi.fn(() => bookmarkQuery),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    };
    const client = {
        auth: { getSession: vi.fn(() => ({ isAuthenticated: true, user: { id: "user-123" } })) },
        data: { ServicedeskBookmark: bookmarkApi },
    };
    return { bookmarkItems, bookmarkQuery, bookmarkApi, mockGetRayfinClient: vi.fn(() => client) };
});
vi.mock("@/lib/rayfin-client", () => ({
    getRayfinClient: mockGetRayfinClient,
}));

const link = "https://brandgroup-service.crm4.dynamics.com/main.aspx?appid=8e97e941-f16d-ea11-a811-000d3a2c338a&pagetype=entityrecord&etn=incident&id=00006502-0c18-ef11-9f89-6045bda06fb3";
const table = {
    columns: [
        "incident[Anfrage]", "incident[Anfragenummer]", "incident[Anfragetitel]",
        "incident[Bearbeiter]", "incident[Mitarbeiter]", "contact[Abteilung]",
        "incident[statecodename]", "incident[statuscodename]", "incident[Priorität]",
        "incident[Erstellt am]", "[Link]", "[Sortierung]",
    ].map((name) => ({ name, dataType: "string" })),
    rows: [["00006502-0c18-ef11-9f89-6045bda06fb3", "CAS-25705-V5Z7Y6", "Starter: Infofeld bzgl. ausgewählter Datenbankserver", "Bearbeiter A", "Mitarbeiter A", "IT", "Aktiv", "In Bearbeitung", "Normal", "2025-12-03T11:51:37.000", link, "199012025123"]],
};
const defaultColumns = ["[ShowAll]", "[Owner]", "[Matches]"].map(name => ({ name, dataType: "unknown" }));
const optionsTable = {
    columns: ["incident[Bearbeiter]", "incident[Mitarbeiter]", "contact[Abteilung]", "incident[statecodename]"].map(name => ({ name, dataType: "string" })),
    rows: [["Bearbeiter A", "Mitarbeiter A", "IT", "Aktiv"], ["Bearbeiter B", "Mitarbeiter B", "Personal", "Behoben"]],
};

describe("Servicedesk", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        bookmarkItems.splice(0);
        bookmarkQuery.executePaginated.mockImplementation(async () => ({ items: bookmarkItems, endCursor: undefined, hasNextPage: false }));
        bookmarkApi.create.mockResolvedValue({ id: "bookmark-new", name: "", filters: "", user_id: "user-123" });
        bookmarkApi.update.mockResolvedValue(undefined);
        bookmarkApi.delete.mockResolvedValue(undefined);
        vi.stubGlobal("ResizeObserver", class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        });
        vi.mocked(useSemanticModelQuery).mockImplementation(options => ({
            data: { status: "success", table: options.query.includes('"ShowAll"') ? { columns: defaultColumns, rows: [[true, null, 1]] } : optionsTable, requestId: "", fromCache: false },
            isLoading: false, error: undefined, refetch: vi.fn(),
        }));
        mockRequestTarget.mockReturnValue({
            status: "ready", data: toDataTable(table, requests().columnMetadata), isCrossHighlightActive: false,
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        delete document.documentElement.dataset.formatLocale;
    });

    it("verlinkt Nummer und Titel mit dem Modell-Link in einem neuen Tab", () => {
        document.documentElement.lang = "de-DE";
        render(<Servicedesk />);
        for (const name of [table.rows[0][1], table.rows[0][2]]) {
            const anchor = screen.getByRole("link", { name });
            expect(anchor).toHaveAttribute("href", link);
            expect(anchor).toHaveAttribute("target", "_blank");
            expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
        }
        expect(screen.getByText("In Bearbeitung")).toBeInTheDocument();
        expect(screen.getByText("03.12.25, 11:51")).toBeInTheDocument();
    });

    it("aktualisiert das Datum, wenn Fabric die Sprache nach dem ersten Render meldet", async () => {
        document.documentElement.lang = "en-US";
        document.documentElement.dataset.formatLocale = "en-US";
        render(<Servicedesk />);
        expect(screen.getByText("12/3/25, 11:51 AM")).toBeInTheDocument();

        document.documentElement.lang = "de-DE";
        document.documentElement.dataset.formatLocale = "de-DE";
        await waitFor(() => expect(screen.getByText("03.12.25, 11:51")).toBeInTheDocument());
    });

    it("meldet fehlende oder unsichere Links, ohne sie anklickbar zu machen", () => {
        mockRequestTarget.mockReturnValue({
            status: "ready", data: toDataTable({ ...table, rows: [table.rows[0].map((value, index) => index === 10 ? "javascript:alert(1)" : value)] }, requests().columnMetadata), isCrossHighlightActive: false,
        });
        render(<Servicedesk />);
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.getAllByText(/Servicedesk-Link fehlt oder ist ungültig/)).toHaveLength(2);
    });

    it("zeigt den Ladezustand und einen leeren Bestand", () => {
        mockRequestTarget.mockReturnValue({ status: "loading" });
        const { rerender } = render(<Servicedesk />);
        expect(screen.getAllByRole("status").some(status => status.textContent?.includes("Anfragen werden geladen"))).toBe(true);
        mockRequestTarget.mockReturnValue({ status: "ready", data: { columns: [], rows: [] }, isCrossHighlightActive: false });
        rerender(<Servicedesk />);
        expect(screen.getByText("Keine Anfragen für die gewählten Filter vorhanden.")).toBeInTheDocument();
    });

    it("zeigt Abfragefehler und ermöglicht einen erneuten Versuch", () => {
        const refetch = vi.fn();
        vi.mocked(useSemanticModelQuery).mockReturnValue({
            data: undefined, isLoading: false, error: new Error("Zugriff verweigert"), refetch,
        });
        render(<Servicedesk />);
        expect(screen.getByRole("alert")).toHaveTextContent("Zugriff verweigert");
        fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
        expect(refetch).toHaveBeenCalledOnce();
    });

    it("setzt für normale Benutzer ihren Bearbeiter und Aktiv voraus", () => {
        vi.mocked(useSemanticModelQuery).mockImplementation(options => ({
            data: { status: "success", table: options.query.includes('"ShowAll"') ? { columns: defaultColumns, rows: [[false, "Bearbeiter A", 1]] } : optionsTable, requestId: "", fromCache: false },
            isLoading: false, error: undefined, refetch: vi.fn(),
        }));
        render(<Servicedesk />);
        expect(screen.getByRole("button", { name: /Bearbeiter.*Bearbeiter A/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Status.*Aktiv/ })).toBeInTheDocument();
    });

    it("lässt für bg-pp den Bearbeiterfilter leer und sortiert nach Sortierung statt Erstelldatum", () => {
        const second = [...table.rows[0]];
        second[0] = "request-2";
        second[1] = "CAS-2";
        second[9] = "2026-01-01T10:00:00.000";
        second[11] = "099";
        mockRequestTarget.mockReturnValue({
            status: "ready", data: toDataTable({ ...table, rows: [table.rows[0], second] }, requests().columnMetadata), isCrossHighlightActive: false,
        });
        render(<Servicedesk />);
        expect(screen.getByRole("button", { name: /Bearbeiter.*All/ })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /^CAS-/ }).map(anchor => anchor.textContent)).toEqual(["CAS-2", table.rows[0][1]]);
    });

    it("lässt den Statusfilter leeren, ohne beim nächsten Render Aktiv erneut zu erzwingen", () => {
        const { rerender } = render(<Servicedesk />);
        fireEvent.click(screen.getByRole("button", { name: /Status.*Aktiv/ }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Behoben" }));
        expect(screen.getByRole("button", { name: /Status.*All/ })).toBeInTheDocument();
        rerender(<Servicedesk />);
        expect(screen.getByRole("button", { name: /Status.*All/ })).toBeInTheDocument();
    });

    it("durchsucht die sichtbaren Spalten und meldet leere Suchtreffer", async () => {
        render(<Servicedesk />);
        const search = screen.getByRole("searchbox", { name: "Servicedesk-Anfragen durchsuchen" });
        fireEvent.change(search, { target: { value: "Starter: Infofeld" } });
        expect(screen.getByRole("link", { name: table.rows[0][2] })).toBeInTheDocument();

        fireEvent.change(search, { target: { value: "nicht vorhanden" } });
        expect(screen.getByText(/Keine Anfragen entsprechen der Suche/)).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: table.rows[0][2] })).not.toBeInTheDocument();
    });

    it("sperrt bei fehlender Benutzerzuordnung die Anfragenabfrage", () => {
        vi.mocked(useSemanticModelQuery).mockReturnValue({
            data: { status: "success", table: { columns: defaultColumns, rows: [[false, null, 0]] }, requestId: "", fromCache: false },
            isLoading: false, error: undefined, refetch: vi.fn(),
        });
        render(<Servicedesk />);
        expect(screen.getByRole("alert")).toHaveTextContent("keinem eindeutigen");
        expect(mockRequestTarget).not.toHaveBeenCalled();
    });

    it("behält vorhandene Anfragen bei einem fehlgeschlagenen Filterwechsel sichtbar", () => {
        mockRequestTarget.mockReturnValue({
            status: "refresh-error", data: toDataTable(table, requests().columnMetadata),
            isCrossHighlightActive: false, error: new Error("Netzwerkfehler"),
        });
        render(<Servicedesk />);
        expect(screen.getByRole("alert")).toHaveTextContent("Netzwerkfehler");
        expect(screen.getByRole("link", { name: table.rows[0][1] })).toBeInTheDocument();
    });

    it("fragt erst bei Klick den Live-Status ab und behält den Statusfilter und die Suche bei", async () => {
        const statusColumns = [table.columns[0], table.columns[6], table.columns[7]];
        const other = table.rows[0].map((value, i) => i === 0 ? "00006503-0c18-ef11-9f89-6045bda06fb3" : i === 1 ? "CAS-2" : i === 2 ? "Drucker" : value);
        mockRequestTarget.mockReturnValue({
            status: "ready", data: toDataTable({ ...table, rows: [table.rows[0], other] }, requests().columnMetadata), isCrossHighlightActive: false,
        });
        vi.mocked(querySemanticModel).mockResolvedValueOnce({
            status: "success", table: { columns: statusColumns, rows: [[table.rows[0][0], "Behoben", "Problem behoben"]] }, requestId: "", fromCache: false,
        });
        render(<Servicedesk />);
        expect(querySemanticModel).not.toHaveBeenCalled();
        const search = screen.getByRole("searchbox", { name: "Servicedesk-Anfragen durchsuchen" });
        const refresh = screen.getByRole("button", { name: "Anfragen aktualisieren" });
        fireEvent.change(search, { target: { value: "Starter" } });
        fireEvent.click(refresh);
        expect(screen.getByRole("button", { name: /Status.*Aktiv/ })).toBeInTheDocument();
        expect(refresh).toBeDisabled();
        expect(screen.getByRole("link", { name: table.rows[0][1] })).toBeInTheDocument();
        await screen.findByText("Keine Anfragen entsprechen der Suche „Starter“.");
        expect(querySemanticModel).toHaveBeenCalledExactlyOnceWith("servicedesk-status-live", expect.stringContaining(table.rows[0][0]), true);
        expect(vi.mocked(querySemanticModel).mock.calls[0][1]).not.toContain(other[0]);
        expect(refresh).toBeEnabled();
        expect(search).toHaveValue("Starter");
        expect(screen.queryByRole("link", { name: table.rows[0][1] })).not.toBeInTheDocument();
        fireEvent.change(search, { target: { value: "" } });
        expect(screen.getByRole("link", { name: "CAS-2" })).toBeInTheDocument();
    });

    it("aktualisiert mehr als 1.000 gefilterte Anfragen in aufeinanderfolgenden Blöcken", async () => {
        const rows = Array.from({ length: 1001 }, (_, index) => {
            const id = `${index.toString(16).padStart(8, "0")}-0c18-ef11-9f89-6045bda06fb3`;
            return table.rows[0].map((value, i) => i === 0 ? id : i === 1 ? `CAS-${index}` : value);
        });
        mockRequestTarget.mockReturnValue({
            status: "ready", data: toDataTable({ ...table, rows }, requests().columnMetadata), isCrossHighlightActive: false,
        });
        const statusColumns = [table.columns[0], table.columns[6], table.columns[7]];
        const response = (batch: typeof rows) => ({
            status: "success" as const, table: { columns: statusColumns, rows: batch.map(row => [row[0], "Behoben", "Problem behoben"]) },
            requestId: "", fromCache: false,
        });
        vi.mocked(querySemanticModel).mockResolvedValueOnce(response(rows.slice(0, 1000))).mockResolvedValueOnce(response(rows.slice(1000)));
        render(<Servicedesk />);
        fireEvent.click(screen.getByRole("button", { name: "Anfragen aktualisieren" }));
        await screen.findByText("Keine Anfragen für die gewählten Filter vorhanden.");
        const calls = vi.mocked(querySemanticModel).mock.calls;
        expect(calls.map(([connection, query]) => [connection, query.match(/"[0-9a-f-]{36}"/g)?.length])).toEqual([
            ["servicedesk-status-live", 1000], ["servicedesk-status-live", 1],
        ]);
        expect(calls[0][1]).not.toContain(rows[1000][0]);
        expect(calls[1][1]).toContain(rows[1000][0]);
    });

    it("speichert, wendet an, ändert und löscht ein benutzerbezogenes Lesezeichen", async () => {
        bookmarkItems.push({
            id: "bookmark-1",
            name: "Aktive IT-Anfragen",
            filters: JSON.stringify({ owner: null, employee: null, department: ["IT"], state: ["Aktiv"] }),
            user_id: "user-123",
        });
        render(<Servicedesk />);
        const bookmarkSelect = await screen.findByRole("combobox", { name: "Gespeichertes Lesezeichen" });
        await waitFor(() => expect(screen.getByRole("option", { name: "Aktive IT-Anfragen" })).toBeInTheDocument());

        fireEvent.change(bookmarkSelect, { target: { value: "bookmark-1" } });
        expect(screen.getByRole("textbox", { name: "Bezeichnung" })).toHaveValue("Aktive IT-Anfragen");
        expect(screen.getByRole("button", { name: /Abteilung.*IT/ })).toBeInTheDocument();

        fireEvent.change(screen.getByRole("textbox", { name: "Bezeichnung" }), { target: { value: "Wichtig" } });
        fireEvent.click(screen.getByRole("button", { name: "Neu speichern" }));
        await waitFor(() => expect(bookmarkApi.create).toHaveBeenCalledWith(expect.objectContaining({
            name: "Wichtig",
            user_id: "user-123",
        })));

        fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
        await waitFor(() => expect(bookmarkApi.update).toHaveBeenCalled());
        fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
        await waitFor(() => expect(bookmarkApi.delete).toHaveBeenCalled());
    });
});
