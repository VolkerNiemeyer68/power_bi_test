import { describe, expect, it } from "vitest";
import { formatLocaleDateTime } from "./format-locale-date-time";

describe("formatLocaleDateTime", () => {
    it("verwendet die jeweilige Länderreihenfolge", () => {
        const value = "2025-12-03T11:51:37.000";
        const german = formatLocaleDateTime(value, "de-DE");
        const american = formatLocaleDateTime(value, "en-US");

        expect(german).toMatch(/^03\.12\.25, 11:51$/);
        expect(american).toMatch(/^12\/3\/25, 11:51 AM$/);
    });

    it("behält ungültige oder leere Werte lesbar", () => {
        expect(formatLocaleDateTime("unbekannt", "de-DE")).toBe("unbekannt");
        expect(formatLocaleDateTime(null, "de-DE")).toBe("");
    });
});
