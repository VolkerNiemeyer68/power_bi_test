import { describe, expect, it } from "vitest";
import { openRequests } from "./open-requests";

describe("Servicedesk-Abfrage", () => {
    it("filtert aktive Anfragen anhand der Modellidentität, mit eng begrenzter Ausnahme", () => {
        const { connection, query, columnMetadata } = openRequests();
        expect(connection).toBe("servicedesk-dashboard");
        expect(query).toContain("LOWER(TRIM(USERPRINCIPALNAME()))");
        expect(query).toContain('_CurrentUser = "bg-pp@brand-group.com"');
        expect(query).toMatch(/'Incident'\[Status\] = "Aktiv"\s*&&/);
        expect(query).toMatch(/_ShowAll\s*\|\|\s*\(\s*_CurrentUser <> ""\s*&& LOWER\(TRIM\(RELATED\('Contact'\[emailaddress1\]\)\)\) = _CurrentUser/);
        expect(query).not.toContain("TOPN");
        expect(columnMetadata["Incident[Link]"].name).toBe("link");
        expect(Object.keys(columnMetadata)).toEqual([
            "Incident[Anfragenummer]", "Incident[Anfragetitel]", "Incident[Statusgrund]",
            "Incident[prioritycode_display]", "Incident[Erstellt am]", "Incident[Link]",
        ]);
    });
});
