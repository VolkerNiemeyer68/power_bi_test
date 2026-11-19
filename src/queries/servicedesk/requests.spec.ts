import { describe, expect, it } from "vitest";
import { requests } from "./requests";

describe("requests", () => {
    it("wendet alle Managerfilter vor den Measures an und sortiert nach dem Modellmeasure", () => {
        const filters = [
            `TREATAS({"Aktiv"}, 'incident'[statecodename])`,
            `TREATAS({"Bearbeiter ""A"""}, 'incident'[Bearbeiter])`,
            `TREATAS({"IT"}, 'contact'[Abteilung])`,
        ];
        const result = requests({ interactionFilters: filters });
        expect(result.connection).toBe("servicedesk-app");
        for (const filter of filters) {
            expect(result.query).toContain(filter);
            expect(result.query.indexOf(filter)).toBeLessThan(result.query.indexOf('"Link"'));
        }
        expect(result.query).not.toContain("/*__FILTER_ARGUMENTS__*/");
        expect(result.query).toContain('IF(NOT ISEMPTY(\'incident\'), [Link])');
        expect(result.query).toContain('IGNORE([Sortierung])');
        expect(result.query).toContain("ORDER BY [Sortierung] ASC");
        expect(result.columnMetadata["[Sortierung]"].name).toBe("sort");
        expect(result.columnMetadata["[Link]"].name).toBe("link");
    });

    it("lässt nach dem Leeren aller Filter auch andere Status und Bearbeiter zu", () => {
        const { query } = requests();
        expect(query).not.toContain("TREATAS");
        expect(query).not.toContain("USERPRINCIPALNAME");
        expect(query).not.toContain("/*__FILTER_ARGUMENTS__*/");
        expect(query).not.toMatch(/,\s*,/);
    });
});
