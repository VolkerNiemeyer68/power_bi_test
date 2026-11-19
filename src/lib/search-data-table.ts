import type { DataTable } from "@microsoft/fabric-visuals-core";

function normalize(value: unknown) {
    return value == null
        ? ""
        : String(value).normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

export function searchDataTable(data: DataTable, query: string, columnNames: readonly string[]): DataTable {
    const search = normalize(query).trim();
    if (!search) return data;
    const indices = columnNames
        .map(name => data.columns.findIndex(column => column.name === name))
        .filter(index => index >= 0);
    return {
        columns: data.columns,
        rows: data.rows.filter(row => indices.some(index => normalize(row[index]).includes(search))),
    };
}
