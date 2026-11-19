import { describe, expect, it } from "vitest";
import type { QueryTable } from "@microsoft/rayfin-connector-fabric-semanticmodel";
import { renderVisualToSvg } from "@microsoft/fabric-visuals/headless";
import type { VisualizationSpec } from "@microsoft/fabric-visuals";
import { dailyRequests, readDailyRequests } from "./daily-requests";

const table: QueryTable = {
    columns: ["Day", "NewRequests", "EndedRequests"].map(name => ({ name: `DailyRequestSnapshot[${name}]`, dataType: "unknown" })),
    rows: Array.from({ length: 60 }, (_, index) => [
        new Date(Date.UTC(2026, 8, 18 + index)).toISOString(),
        index === 0 ? 7 : index === 3 ? 8 : 0,
        index === 0 ? 10 : index === 3 ? 14 : 0,
    ]),
};

describe("Tägliche Servicedesk-Ereignisse", () => {
    it("bindet die geprüften Importspalten und erhält leere Kalendertage in chronologischer Reihenfolge", () => {
        const result = readDailyRequests({
            columns: [...table.columns].reverse(),
            rows: [...table.rows].reverse().map(row => [...row].reverse()),
        });
        if (result.status !== "success") throw new Error("Tageszahlen wurden abgelehnt");
        expect(result.table.columns.map(column => column.name)).toEqual(["day", "newRequests", "endedRequests"]);
        expect(result.table.rows).toHaveLength(60);
        expect(result.table.rows[0]).toEqual(["2026-09-18", 7, 10]);
        expect(result.table.rows[1]).toEqual(["2026-09-19", 0, 0]);
        expect(result.table.rows[59][0]).toBe("2026-11-16");
        expect(dailyRequests().query).toContain("'DailyRequestSnapshot'");
    });

    it("unterscheidet einen fehlenden Import von unvollständigen oder ungültigen Tageszahlen", () => {
        expect(readDailyRequests({ columns: [], rows: [] }).status).toBe("empty");
        expect(readDailyRequests({ ...table, rows: table.rows.slice(1) }).status).toBe("error");
        expect(readDailyRequests({ ...table, columns: table.columns.slice(1) }).status).toBe("error");
        for (const row of [
            ["2026-02-30", 7, 10], ["2026-09-19", 7, 10], ["2026-09-17", 7, 10],
            ["2026-09-18", -1, 10], ["2026-09-18", 7, null], ["2026-09-18", "7", 10],
            ["2026-09-18", 7, 0.5], ["2026-09-18", Number.MAX_SAFE_INTEGER, 1],
        ]) {
            expect(readDailyRequests({ ...table, rows: [row, ...table.rows.slice(1)] }).status).toBe("error");
        }
    });

    it("normalisiert gemischte und einseitige Ereignistage, ohne erfundene Säulen für Nulltage", async () => {
        const result = readDailyRequests(table);
        if (result.status !== "success") throw new Error("Tageszahlen wurden abgelehnt");
        const rendered = await renderVisualToSvg({
            ...dailyRequests().vegaLiteSpec, width: 1200, height: 384,
        } as VisualizationSpec, { data: {
            ...result.table,
            rows: result.table.rows.map((row, index) => index === 58 ? [row[0], 3, 0] : index === 59 ? [row[0], 0, 3] : row),
        } });
        expect(rendered.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
        expect(rendered.renderedMarkCountsByType.rect).toBe(6);
        for (const percentage of ["41%", "59%", "36%", "64%", "100%"]) expect(rendered.svg).toContain(percentage);
        expect(rendered.svg).toContain("09.2026");
    });
});
