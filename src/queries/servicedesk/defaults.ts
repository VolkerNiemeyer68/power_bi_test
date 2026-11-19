import type { QueryTable } from "@microsoft/rayfin-connector-fabric-semanticmodel";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import query from "./defaults.dax?raw";

export function defaults() {
    return {
        connection: "servicedesk-app",
        query,
        columnMetadata: {
            "[ShowAll]": { name: "showAll", displayName: "Alle Bearbeiter" },
            "[Owner]": { name: "owner", displayName: "Bearbeiter" },
            "[Matches]": { name: "matches", displayName: "Benutzerzuordnungen" },
        } satisfies ColumnMetadataMap,
    };
}

export function readDefaults(table: QueryTable):
    | { status: "success"; owner: string | null }
    | { status: "error"; message: string } {
    const showAllIndex = table.columns.findIndex(({ name }) => name === "[ShowAll]");
    const ownerIndex = table.columns.findIndex(({ name }) => name === "[Owner]");
    const matchesIndex = table.columns.findIndex(({ name }) => name === "[Matches]");
    const row = table.rows[0];
    if (table.rows.length !== 1 || !row || [showAllIndex, ownerIndex, matchesIndex].some(index => index < 0)) {
        return { status: "error", message: "Die Abfrage der Benutzereinstellungen hat ein unerwartetes Ergebnis geliefert." };
    }
    const showAll = row[showAllIndex];
    const owner = row[ownerIndex];
    if (showAll === true) return { status: "success", owner: null };
    if (showAll !== false || row[matchesIndex] !== 1 || typeof owner !== "string" || owner.trim() === "") {
        return { status: "error", message: "Der angemeldete Benutzer konnte keinem eindeutigen Servicedesk-Bearbeiter zugeordnet werden." };
    }
    return { status: "success", owner };
}
