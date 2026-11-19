import { describe, expect, it } from "vitest";
import { searchDataTable } from "./search-data-table";

const table = {
    columns: [{ name: "title" }, { name: "owner" }, { name: "link" }],
    rows: [
        ["Prüfung Server", "Bearbeiter A", "https://hidden.example/server"],
        ["Netzwerk prüfen", "Bearbeiter B", "https://hidden.example/network"],
    ],
};

describe("searchDataTable", () => {
    it("sucht unabhängig von Groß-/Kleinschreibung und Akzenten in gewählten Spalten", () => {
        expect(searchDataTable(table, "PRUFUNG", ["title"]).rows).toHaveLength(1);
        expect(searchDataTable(table, "bearbeiter b", ["owner"]).rows[0]).toBe(table.rows[1]);
    });

    it("ignoriert leere Suchtexte und nicht sichtbare Spalten", () => {
        expect(searchDataTable(table, " ", ["title"])).toBe(table);
        expect(searchDataTable(table, "hidden.example", ["title", "owner"]).rows).toHaveLength(0);
    });
});
