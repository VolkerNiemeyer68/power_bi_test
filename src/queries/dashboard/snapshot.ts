import type { QueryTable } from "@microsoft/rayfin-connector-fabric-semanticmodel";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import query from "./snapshot.dax?raw";

export function snapshot() {
    return {
        connection: "servicedesk-kennzahlen",
        query,
        columnMetadata: {
            "Snapshot[ActiveRequests]": { name: "active", displayName: "Aktive Anfragen", format: "#,0" },
            "Snapshot[AverageActiveDays]": { name: "activeDays", displayName: "Durchschnittlich aktiv", format: "#,0.0" },
            "Snapshot[AverageResolutionHours]": { name: "resolutionHours", displayName: "Durchschnittlicher Abschlussaufwand", format: "#,0.0" },
            "Snapshot[AverageProjectDays]": { name: "projectDays", displayName: "Durchschnittlicher Projektaufwand", format: "#,0.0" },
            "Snapshot[ActiveWithCreated]": { name: "activeWithCreated", displayName: "Aktive Anfragen mit Erstellungsdatum", format: "#,0" },
            "Snapshot[ResolvedRequests]": { name: "resolved", displayName: "Behobene Anfragen", format: "#,0" },
            "Snapshot[ResolvedWithEffort]": { name: "resolvedWithEffort", displayName: "Behobene Anfragen mit Abschlussaufwand", format: "#,0" },
            "Snapshot[ProjectsWithEffort]": { name: "projectsWithEffort", displayName: "Anfragen mit Projektaufwand", format: "#,0" },
            "Snapshot[TotalRequests]": { name: "total", displayName: "Alle Anfragen", format: "#,0" },
            "Snapshot[SnapshotUtc]": { name: "snapshotUtc", displayName: "Datenstand (UTC)" },
        } satisfies ColumnMetadataMap,
    };
}

export interface Snapshot {
    active: number;
    activeDays: number | null;
    resolutionHours: number | null;
    projectDays: number | null;
    activeWithCreated: number;
    resolved: number;
    resolvedWithEffort: number;
    projectsWithEffort: number;
    total: number;
    timestamp: number;
}

export function readSnapshot(table: QueryTable):
    | { status: "success"; snapshot: Snapshot }
    | { status: "empty" }
    | { status: "error"; message: string } {
    if (table.rows.length === 0) return { status: "empty" };
    if (table.rows.length !== 1) return { status: "error", message: "Das Kennzahlenmodell muss genau einen Snapshot liefern." };
    const row = table.rows[0];
    const cell = (name: string) => row[table.columns.findIndex(column => column.name === `Snapshot[${name}]`)];
    const active = cell("ActiveRequests");
    const activeDays = cell("AverageActiveDays");
    const resolutionHours = cell("AverageResolutionHours");
    const projectDays = cell("AverageProjectDays");
    const activeWithCreated = cell("ActiveWithCreated");
    const resolved = cell("ResolvedRequests");
    const resolvedWithEffort = cell("ResolvedWithEffort");
    const projectsWithEffort = cell("ProjectsWithEffort");
    const total = cell("TotalRequests");
    const utc = cell("SnapshotUtc");
    const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const isAverage = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value));
    if (!isCount(active) || !isCount(activeWithCreated) || !isCount(resolved) || !isCount(resolvedWithEffort)
        || !isCount(projectsWithEffort) || !isCount(total) || !isAverage(activeDays)
        || !isAverage(resolutionHours) || !isAverage(projectDays)
        || typeof utc !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(utc)) {
        return { status: "error", message: "Der Kennzahlen-Snapshot enthält fehlende Spalten oder ungültige Werte." };
    }
    // Power BI returns UTC datetimes without a timezone suffix.
    const timestamp = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(utc) ? utc : `${utc}Z`);
    if (!Number.isFinite(timestamp)) return { status: "error", message: "Der Datenstand des Kennzahlen-Snapshots ist ungültig." };
    return { status: "success", snapshot: { active, activeDays, resolutionHours, projectDays, activeWithCreated, resolved, resolvedWithEffort, projectsWithEffort, total, timestamp } };
}
