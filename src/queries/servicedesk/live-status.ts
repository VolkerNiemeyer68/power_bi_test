import type { DataTable } from "@microsoft/fabric-visuals-core";
import { executeQueryFactory } from "@/lib/query-factory";
import query from "./live-status.dax?raw";

const liveBatchSize = 1000;

function requestId(value: unknown): string {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
        throw new Error("Die Ansicht enthält eine ungültige Anfrage-ID.");
    }
    return value.toLowerCase();
}

export function liveStatus(ids: readonly string[]) {
    if (!ids.length || ids.length > liveBatchSize) throw new Error("Ungültige Größe der Live-Statusabfrage.");
    return {
        connection: "servicedesk-status-live",
        query: query.replace("/*__REQUEST_IDS__*/BLANK()", ids.map(id => `"${requestId(id)}"`).join(", ")),
        columnMetadata: {
            "incident[Anfrage]": { name: "id", displayName: "Anfrage-ID" },
            "incident[statecodename]": { name: "state", displayName: "Status" },
            "incident[statuscodename]": { name: "reason", displayName: "Statusgrund" },
        },
    };
}

function position(table: DataTable, name: string) {
    const index = table.columns.findIndex(column => column.name === name);
    if (index < 0) throw new Error("Die Statusabfrage hat ein unerwartetes Datenformat geliefert.");
    return index;
}

export async function overlayLiveStatus(imported: DataTable, visibleRows: DataTable["rows"], selectedStates: readonly (string | null)[], isCurrent: () => boolean) {
    if (!visibleRows.length) return { data: imported, live: 0, missing: 0 };
    const id = position(imported, "id");
    const state = position(imported, "state");
    const reason = position(imported, "reason");
    const matchesState = (value: unknown) =>
        !selectedStates.length || selectedStates.some(selected => selected?.toLowerCase() === (value == null ? undefined : String(value).toLowerCase()));
    const ids = [...new Set(visibleRows.map(row => requestId(row[id])))];
    const statusById = new Map<string, { state: string; reason: string | null }>();
    for (let offset = 0; offset < ids.length; offset += liveBatchSize) {
        if (!isCurrent()) return undefined;
        const batch = ids.slice(offset, offset + liveBatchSize);
        const result = await executeQueryFactory(liveStatus(batch), true);
        if (!isCurrent()) return undefined;
        if (!result.rows.length) continue;
        const requestedIds = new Set(batch);
        const liveId = position(result, "id");
        const liveState = position(result, "state");
        const liveReason = position(result, "reason");
        for (const row of result.rows) {
            const key = requestId(row[liveId]);
            const state = row[liveState];
            const reason = row[liveReason];
            if (!requestedIds.has(key) || statusById.has(key) || typeof state !== "string" || (reason != null && typeof reason !== "string")) {
                throw new Error("Die Statusabfrage hat widersprüchliche Daten geliefert.");
            }
            statusById.set(key, { state, reason: reason ?? null });
        }
    }
    const rows = imported.rows.flatMap(row => {
        const current = statusById.get(requestId(row[id]));
        if (!current) return [row];
        if (!matchesState(current.state)) return [];
        const updated = [...row];
        updated[state] = current.state;
        updated[reason] = current.reason;
        return [updated];
    });
    return { data: { columns: imported.columns, rows }, live: statusById.size, missing: ids.length - statusById.size };
}
