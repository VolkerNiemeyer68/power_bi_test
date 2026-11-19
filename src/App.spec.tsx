import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "@/App";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";

vi.mock("@/hooks/theme.context", () => ({
    useThemeContext: () => ({ isDark: false, toggleTheme: vi.fn() }),
}));
vi.mock("@/hooks/use-semantic-model-query", () => ({
    useSemanticModelQuery: vi.fn(),
}));

const employeeTable = {
    columns: [{ name: "verwaltung azure_gruppen_user[Benutzer]", dataType: "string" }, { name: "verwaltung azure_gruppen_user[Name]", dataType: "string" }],
    rows: [["anna", "Anna Beispiel"], ["bert", "Bert Beispiel"]],
};
const groupTable = {
    columns: [{ name: "verwaltung azure_gruppen_user[Gruppe]", dataType: "string" }],
    rows: [["Team A"], ["Team B"]],
};

describe("Gruppenübersicht", () => {
    beforeEach(() => {
        vi.mocked(useSemanticModelQuery).mockImplementation((options) => ({
            data: { status: "success", table: options.query.includes("VAR _Benutzer") ? groupTable : employeeTable, requestId: "", fromCache: false },
            isLoading: false, error: undefined, refetch: vi.fn(),
        }));
    });

    it("findet Mitarbeiter und zeigt ihre Gruppen nach Auswahl", () => {
        render(<App />);
        fireEvent.change(screen.getByRole("searchbox", { name: "Mitarbeiter suchen" }), { target: { value: "ANNA" } });
        expect(screen.queryByText("Bert Beispiel")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Anna Beispiel/ }));
        expect(screen.getByText("Team A")).toBeInTheDocument();
        expect(screen.getByText("Team B")).toBeInTheDocument();
    });

    it("meldet fehlende Suchergebnisse und Abfragefehler", () => {
        const { unmount } = render(<App />);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "unbekannt" } });
        expect(screen.getByText("Keine Mitarbeiter gefunden.")).toBeInTheDocument();
        unmount();
        vi.mocked(useSemanticModelQuery).mockReturnValue({ data: undefined, isLoading: false, error: new Error("Zugriff verweigert"), refetch: vi.fn() });
        render(<App />);
        expect(screen.getByRole("alert")).toHaveTextContent("Zugriff verweigert");
    });

    it("zeigt einen leeren Gruppenbestand und fragt die ausgewählte Kennung ab", () => {
        vi.mocked(useSemanticModelQuery).mockImplementation((options) => ({
            data: {
                status: "success",
                table: options.query.includes("VAR _Benutzer") ? { ...groupTable, rows: [] } : employeeTable,
                requestId: "",
                fromCache: false,
            },
            isLoading: false, error: undefined, refetch: vi.fn(),
        }));
        render(<App />);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bert" } });
        fireEvent.click(screen.getByRole("button", { name: /Bert Beispiel/ }));
        expect(screen.getByText("Keine Gruppen für diesen Mitarbeiter gefunden.")).toBeInTheDocument();
        expect(vi.mocked(useSemanticModelQuery).mock.calls.some(([options]) => options.query.includes('VAR _Benutzer =\n        "bert"'))).toBe(true);
    });

    it("wechselt zum Servicedesk und zurück zur Gruppenübersicht", () => {
        vi.mocked(useSemanticModelQuery).mockImplementation((options) => ({
            data: { status: "success", table: options.connection === "servicedesk-app" ? { columns: [], rows: [] } : employeeTable, requestId: "", fromCache: false },
            isLoading: false, error: undefined, refetch: vi.fn(),
        }));
        render(<App />);
        fireEvent.click(screen.getByRole("button", { name: "Servicedesk" }));
        expect(screen.getByRole("heading", { name: "Servicedesk-Anfragen" })).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("Benutzereinstellungen");
        expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Gruppenübersicht" }));
        expect(screen.getByRole("searchbox", { name: "Mitarbeiter suchen" })).toBeInTheDocument();
    });

    it("öffnet das Dashboard als eigenen Bereich und behält die Gruppenübersicht als Einstieg", () => {
        render(<App />);
        expect(screen.getByRole("button", { name: "Gruppenübersicht" })).toHaveAttribute("aria-current", "page");
        fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
        expect(screen.getByRole("heading", { name: "Servicedesk-Dashboard" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("alert")).toHaveTextContent("Kennzahlen");
        fireEvent.click(screen.getByRole("button", { name: "Gruppenübersicht" }));
        expect(screen.getByRole("searchbox", { name: "Mitarbeiter suchen" })).toBeInTheDocument();
    });

});
