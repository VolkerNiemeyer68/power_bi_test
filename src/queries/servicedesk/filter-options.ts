import type { ColumnMetadataMap } from "@/lib/to-data-table";
import query from "./filter-options.dax?raw";

export function filterOptions() {
    return {
        connection: "servicedesk-app",
        query,
        columnMetadata: {
            "incident[Bearbeiter]": { name: "owner", displayName: "Bearbeiter" },
            "incident[Mitarbeiter]": { name: "employee", displayName: "Mitarbeiter" },
            "contact[Abteilung]": { name: "department", displayName: "Abteilung" },
            "incident[statecodename]": { name: "state", displayName: "Status" },
        } satisfies ColumnMetadataMap,
    };
}
