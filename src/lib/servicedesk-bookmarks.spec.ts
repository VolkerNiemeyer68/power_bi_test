import { describe, expect, it } from "vitest";
import { parseBookmarkFilters, serializeBookmarkFilters } from "./servicedesk-bookmarks";

describe("Servicedesk-Lesezeichen", () => {
    it("serialisiert und validiert alle Filter einschließlich leerer Werte", () => {
        const filters = {
            owner: ["Bearbeiter A"],
            employee: ["Mitarbeiter A"],
            department: null,
            state: [null, "Aktiv"],
        };

        expect(parseBookmarkFilters(serializeBookmarkFilters(filters))).toEqual(filters);
    });

    it("verwirft beschädigte oder unvollständige Filterdaten", () => {
        expect(parseBookmarkFilters("{")).toBeNull();
        expect(parseBookmarkFilters(JSON.stringify({ owner: [], employee: [], department: null }))).toBeNull();
        expect(parseBookmarkFilters(JSON.stringify({ owner: [42], employee: [], department: null, state: [] }))).toBeNull();
    });
});
