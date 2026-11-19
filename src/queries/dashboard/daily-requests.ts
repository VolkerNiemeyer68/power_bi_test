import type { QueryTable } from "@microsoft/rayfin-connector-fabric-semanticmodel";
import { parseIsoCalendarDate, type DataTable } from "@microsoft/fabric-visuals-core";
import { toDataTable, type ColumnMetadataMap } from "@/lib/to-data-table";
import query from "./daily-requests.dax?raw";
import vegaLiteSpec from "./daily-requests.json";

const columnMetadata = {
    "DailyRequestSnapshot[Day]": { name: "day", displayName: "Tag", format: "dd.MM.yyyy" },
    "DailyRequestSnapshot[NewRequests]": { name: "newRequests", displayName: "Neu", format: "#,0" },
    "DailyRequestSnapshot[EndedRequests]": { name: "endedRequests", displayName: "Beendet", format: "#,0" },
} satisfies ColumnMetadataMap;

export function dailyRequests() {
    return { connection: "servicedesk-kennzahlen", query, columnMetadata, vegaLiteSpec };
}

export function readDailyRequests(table: QueryTable):
    | { status: "success"; table: DataTable }
    | { status: "empty" }
    | { status: "error"; message: string } {
    if (table.rows.length === 0) return { status: "empty" };
    const names = Object.keys(columnMetadata);
    const indices = names.map(name => table.columns.findIndex(column => column.name === name));
    const invalid = { status: "error", message: "Die Tagesauswertung benötigt 60 aufeinanderfolgende Tage mit gültigen, nicht negativen Anzahlen." } as const;
    if (indices.some(index => index < 0) || table.rows.length !== 60) return invalid;
    const rows: [string, number, number][] = [];
    for (const row of table.rows) {
        const [rawDay, newRequests, endedRequests] = indices.map(index => row[index]);
        const day = typeof rawDay === "string" ? parseIsoCalendarDate(rawDay) : undefined;
        if (!day || typeof newRequests !== "number" || !Number.isSafeInteger(newRequests) || newRequests < 0
            || typeof endedRequests !== "number" || !Number.isSafeInteger(endedRequests) || endedRequests < 0
            || !Number.isSafeInteger(newRequests + endedRequests)) return invalid;
        rows.push([day, newRequests, endedRequests]);
    }
    rows.sort(([a], [b]) => a.localeCompare(b));
    for (let index = 1; index < rows.length; index++) {
        if (Date.parse(`${rows[index][0]}T00:00:00Z`) - Date.parse(`${rows[index - 1][0]}T00:00:00Z`) !== 86400000) return invalid;
    }
    return {
        status: "success",
        table: toDataTable({ columns: indices.map(index => table.columns[index]), rows }, columnMetadata),
    };
}
