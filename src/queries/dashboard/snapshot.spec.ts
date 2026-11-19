import { describe, expect, it } from "vitest";
import { readSnapshot } from "./snapshot";
import type { QueryTable } from "@microsoft/rayfin-connector-fabric-semanticmodel";

const table: QueryTable = {
    columns: [
        "ActiveRequests", "ActiveWithCreated", "ResolvedRequests", "ResolvedWithEffort",
        "ProjectsWithEffort", "TotalRequests", "AverageActiveDays", "AverageResolutionHours",
        "AverageProjectDays", "SnapshotUtc",
    ].map(name => ({ name: `Snapshot[${name}]`, dataType: "unknown" })),
    rows: [[257, 257, 26658, 26658, 558, 27580, 202.06842891531988, 2.818478505514292, 2.6847132616487457, "2026-11-17T12:15:07.963"]],
};

describe("Kennzahlen-Snapshot", () => {
    it("liest die geprüfte Live-Ausgabe unabhängig von der Spaltenreihenfolge und interpretiert den Datenstand als UTC", () => {
        const result = readSnapshot({
            columns: [...table.columns].reverse(),
            rows: [[...table.rows[0]].reverse()],
        });
        expect(result).toEqual({ status: "success", snapshot: {
            active: 257, activeWithCreated: 257, resolved: 26658, resolvedWithEffort: 26658,
            projectsWithEffort: 558, total: 27580, activeDays: 202.06842891531988,
            resolutionHours: 2.818478505514292, projectDays: 2.6847132616487457,
            timestamp: Date.parse("2026-11-17T12:15:07.963Z"),
        } });
    });

    it("unterscheidet fehlende Durchschnitte von echten Nullwerten", () => {
        const result = readSnapshot({ ...table, rows: [[0, 0, 0, 0, 0, 0, null, 0, null, "2026-11-17T12:15:07.963Z"]] });
        expect(result.status).toBe("success");
        if (result.status !== "success") throw new Error("Snapshot wurde abgelehnt");
        expect(result.snapshot).toMatchObject({ active: 0, activeDays: null, resolutionHours: 0, projectDays: null });
    });

    it("meldet einen fehlenden Erstimport und lehnt mehrere Snapshots ab", () => {
        expect(readSnapshot({ columns: [], rows: [] })).toEqual({ status: "empty" });
        expect(readSnapshot({ ...table, rows: [...table.rows, ...table.rows] }).status).toBe("error");
    });

    it.each([
        [0, null], [0, -1], [0, 1.5], [6, "202"], [7, Infinity], [8, undefined],
        [9, "kein Datum"], [9, "2026-13-17T12:15:07"], [9, null],
    ])("meldet ungültige Werte in Spalte %s ausdrücklich", (index, value) => {
        const row = [...table.rows[0]];
        row[index] = value;
        expect(readSnapshot({ ...table, rows: [row] }).status).toBe("error");
    });

    it("behandelt eine fehlende Spalte nicht als Null", () => {
        expect(readSnapshot({ columns: table.columns.slice(1), rows: [table.rows[0].slice(1)] }).status).toBe("error");
    });
});
