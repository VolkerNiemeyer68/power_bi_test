export function formatLocaleDateTime(value: unknown, locale: string): string {
    if (typeof value !== "string" || !value.trim()) return value == null ? "" : String(value);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
    }).format(date);
}
