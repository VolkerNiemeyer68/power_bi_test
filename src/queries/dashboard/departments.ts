import type { QueryTable } from "@microsoft/rayfin-connector-fabric-semanticmodel";
import type { DataTable } from "@microsoft/fabric-visuals-core";
import { toDataTable, type ColumnMetadataMap } from "@/lib/to-data-table";
import query from "./departments.dax?raw";
import vegaLiteSpec from "./departments.json";

const columnMetadata = {
    "DepartmentSnapshot[Department]": { name: "department", displayName: "Abteilung" },
    "DepartmentSnapshot[ActiveRequests]": { name: "active", displayName: "Aktive Anfragen", format: "#,0" },
} satisfies ColumnMetadataMap;

export function departments() {
    return { connection: "servicedesk-kennzahlen", query, columnMetadata, vegaLiteSpec };
}

export function readDepartments(table: QueryTable):
    | { status: "success"; table: DataTable }
    | { status: "empty" }
    | { status: "error"; message: string } {
    if (table.rows.length === 0) return { status: "empty" };
    const departmentIndex = table.columns.findIndex(column => column.name === "DepartmentSnapshot[Department]");
    const activeIndex = table.columns.findIndex(column => column.name === "DepartmentSnapshot[ActiveRequests]");
    const seen = new Set<string>();
    for (const row of table.rows) {
        const department = row[departmentIndex];
        const active = row[activeIndex];
        if (typeof department !== "string" || department.trim() === "" || seen.has(department)
            || typeof active !== "number" || !Number.isSafeInteger(active) || active <= 0) {
            return { status: "error", message: "Die Abteilungsverteilung enthält fehlende Spalten, doppelte Abteilungen oder ungültige Anzahlen." };
        }
        seen.add(department);
    }
    return {
        status: "success",
        table: toDataTable({
            columns: [table.columns[departmentIndex], table.columns[activeIndex]],
            rows: table.rows.map(row => [row[departmentIndex], row[activeIndex]])
                .sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0]), "de")),
        }, columnMetadata),
    };
}
