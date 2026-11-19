import query from "./open-requests.dax?raw";
import type { ColumnMetadataMap } from "@/lib/to-data-table";

export function openRequests() {
    return {
        connection: "servicedesk-dashboard",
        query,
        columnMetadata: {
            "Incident[Anfragenummer]": { name: "number", displayName: "Anfrage" },
            "Incident[Anfragetitel]": { name: "title", displayName: "Titel" },
            "Incident[Statusgrund]": { name: "status", displayName: "Status" },
            "Incident[prioritycode_display]": { name: "priority", displayName: "Priorität" },
            "Incident[Erstellt am]": { name: "created", displayName: "Erstellt am", format: "dd.MM.yyyy HH:mm" },
            "Incident[Link]": { name: "link", displayName: "Servicedesk-Link" },
        } satisfies ColumnMetadataMap,
    };
}
