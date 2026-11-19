export const bookmarkFilterFields = ["owner", "employee", "department", "state"] as const;
export type BookmarkFilterField = typeof bookmarkFilterFields[number];
export type BookmarkFilters = Record<BookmarkFilterField, readonly (string | null)[] | null>;

export function parseBookmarkFilters(value: string): BookmarkFilters | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const filters = {} as BookmarkFilters;
    for (const field of bookmarkFilterFields) {
        const selected = (parsed as Record<string, unknown>)[field];
        if (selected !== null && (!Array.isArray(selected) || selected.some(value => typeof value !== "string" && value !== null))) return null;
        filters[field] = selected as readonly (string | null)[] | null;
    }
    return filters;
}

export function serializeBookmarkFilters(filters: BookmarkFilters) {
    return JSON.stringify(filters);
}
