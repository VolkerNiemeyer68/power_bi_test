import { describe, expect, it } from "vitest";
import { employees, memberships } from "./index";

describe("Gruppenabfragen", () => {
    it("verwendet das konfigurierte Modell und maskiert Benutzerkennungen in DAX", () => {
        expect(employees.connection).toBe("mitarbeiter");
        const result = memberships('name" OR "x"="x');
        expect(result.connection).toBe("mitarbeiter");
        expect(result.query).toContain('"name"" OR ""x""=""x"');
        expect(result.query).not.toContain("MINX(");
    });
});
