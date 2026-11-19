import { describe, expect, it } from "vitest";
import { defaults, readDefaults } from "./defaults";

const columns = ["[ShowAll]", "[Owner]", "[Matches]"].map(name => ({ name, dataType: "unknown" }));

describe("Servicedesk-Benutzerstandard", () => {
    it("ermittelt den aktuellen Modellbenutzer und die bg-pp-Ausnahme", () => {
        expect(defaults().connection).toBe("servicedesk-app");
        expect(defaults().query).toContain("USERPRINCIPALNAME()");
        expect(defaults().query).toContain('_CurrentUser = "bg-pp@brand-group.com"');
        expect(defaults().query).toContain("'systemuser'[Benutzername]");
        expect(defaults().query).toContain("'systemuser'[Primäre E-Mail-Adresse]");
        expect(readDefaults({ columns, rows: [[true, null, 1]] })).toEqual({ status: "success", owner: null });
        expect(readDefaults({ columns, rows: [[false, "Bearbeiter A", 1]] })).toEqual({ status: "success", owner: "Bearbeiter A" });
    });

    it("öffnet bei fehlender oder mehrdeutiger Zuordnung nicht versehentlich alle Anfragen", () => {
        for (const row of [[false, null, 0], [false, "Bearbeiter A", 2], [false, "", 1], [null, null, 1]]) {
            expect(readDefaults({ columns, rows: [row] }).status).toBe("error");
        }
        expect(readDefaults({ columns: [], rows: [] }).status).toBe("error");
    });
});
