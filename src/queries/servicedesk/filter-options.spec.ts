import { expect, it } from "vitest";
import { filterOptions } from "./filter-options";

it("liefert Filterwerte für alle Status aus demselben Importmodell", () => {
    const result = filterOptions();
    expect(result.connection).toBe("servicedesk-app");
    expect(Object.keys(result.columnMetadata)).toEqual([
        "incident[Bearbeiter]", "incident[Mitarbeiter]", "contact[Abteilung]", "incident[statecodename]",
    ]);
    expect(result.query).toContain("SUMMARIZE(");
    expect(result.query).not.toContain('"Aktiv"');
});
