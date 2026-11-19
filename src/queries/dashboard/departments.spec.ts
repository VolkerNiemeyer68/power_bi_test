import { describe, expect, it } from "vitest";
import { departments, readDepartments } from "./departments";
import type { QueryTable } from "@microsoft/rayfin-connector-fabric-semanticmodel";
import { renderVisualToSvg } from "@microsoft/fabric-visuals/headless";
import type { VisualizationSpec } from "@microsoft/fabric-visuals";

const table: QueryTable = {
    columns: [
        { name: "DepartmentSnapshot[Department]", dataType: "string" },
        { name: "DepartmentSnapshot[ActiveRequests]", dataType: "int64" },
    ],
    rows: [["IT & Digitalisierung", 25], ["Ohne Abteilung", 53], ["Vertrieb", 18]],
};

describe("Abteilungsverteilung", () => {
    it("bindet die geprüften Importspalten mit ihren Formaten an die Kuchengrafik", () => {
        const result = readDepartments({
            columns: [...table.columns].reverse(),
            rows: table.rows.map(row => [...row].reverse()),
        });
        expect(result.status).toBe("success");
        if (result.status !== "success") throw new Error("Abteilungen wurden abgelehnt");
        expect(result.table.rows).toEqual([["Ohne Abteilung", 53], ["IT & Digitalisierung", 25], ["Vertrieb", 18]]);
        const spec = departments().vegaLiteSpec;
        expect(result.table.columns).toEqual([
            { name: spec.encoding.color.field, displayName: "Abteilung" },
            { name: spec.encoding.theta.field, displayName: "Aktive Anfragen", format: "#,0" },
        ]);
        expect(departments().query).toContain("'DepartmentSnapshot'");
        expect(departments().connection).toBe("servicedesk-kennzahlen");
    });

    it("behält alle Abteilungen und sortiert nach Anzahl absteigend, bei Gleichstand nach Namen", () => {
        const rows = [...table.rows, ["GF", 8], ["Arbeitsvorbereitung", 8]];
        const result = readDepartments({ ...table, rows });
        expect(result.status).toBe("success");
        if (result.status !== "success") throw new Error("Abteilungen wurden abgelehnt");
        expect(result.table.rows).toEqual([
            ["Ohne Abteilung", 53], ["IT & Digitalisierung", 25], ["Vertrieb", 18],
            ["Arbeitsvorbereitung", 8], ["GF", 8],
        ]);
        expect(rows[0]).toEqual(["IT & Digitalisierung", 25]);
    });

    it.each([3, 10, 11, 12])("rendert bei %s Abteilungen die Top 10 und fasst übrige Anfragen als Rest zusammen", async count => {
        const result = readDepartments({ ...table, rows: [
            ...table.rows, ["Industrial Engineering", 17], ["Qualitätsmanagement", 14],
            ["Finanzbuchhaltung", 13], ["Controlling", 12], ["Einkauf", 11],
            ["Logistics", 10], ["GF", 8], ["Arbeitsvorbereitung", 8], ["Logistik", 7],
        ].slice(0, count) });
        if (result.status !== "success") throw new Error("Abteilungen wurden abgelehnt");
        const rendered = await renderVisualToSvg({
            ...departments().vegaLiteSpec, width: 1200, height: 512,
        } as VisualizationSpec, { data: result.table });
        expect(rendered.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
        expect(rendered.renderedMarkCountsByType.arc).toBe(Math.min(count, 11));
        expect(result.table.rows).toHaveLength(count);
        if (count > 10) {
            expect(rendered.svg).toContain("Arbeitsvorbereitung");
            expect(rendered.svg).not.toContain("GF");
            expect(rendered.svg).toContain(`Rest ${count === 11 ? 8 : 15} (`);
        } else {
            expect(rendered.svg).not.toContain("Rest");
        }
        if (count === 12) expect(rendered.svg).toContain("Ohne Abteilung 53 (27.04%)");
    });

    it("akzeptiert einen vollständig leeren aktiven Bestand", () => {
        expect(readDepartments({ columns: [], rows: [] })).toEqual({ status: "empty" });
    });

    it.each([
        [null, 1], ["", 1], ["  ", 1], ["IT", 0], ["IT", -1],
        ["IT", 0.5], ["IT", "25"], ["IT", Infinity], ["IT", null],
    ])("lehnt ungültige Gruppen ab: %s, %s", (department, active) => {
        expect(readDepartments({ ...table, rows: [[department, active]] }).status).toBe("error");
    });

    it("meldet fehlende Spalten und doppelte Abteilungen statt falscher Segmente", () => {
        expect(readDepartments({ columns: [table.columns[0]], rows: [["IT"]] }).status).toBe("error");
        expect(readDepartments({ ...table, rows: [["IT", 4], ["IT", 4]] }).status).toBe("error");
    });
});
