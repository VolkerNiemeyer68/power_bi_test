import type { ManagedQueryFactoryParams } from "@microsoft/fabric-interaction-manager";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import { insertInteractionFilters } from "@/lib/query-factory";
import query from "./requests.dax?raw";

export function requests({ interactionFilters = [] }: ManagedQueryFactoryParams = {}) {
    return {
        connection: "servicedesk-app",
        query: insertInteractionFilters(query, interactionFilters, "/*__FILTER_ARGUMENTS__*/", "beforeMeasures"),
        columnMetadata: {
            "incident[Anfrage]": { name: "id", displayName: "Anfrage-ID" },
            "incident[Anfragenummer]": { name: "number", displayName: "Anfrage" },
            "incident[Anfragetitel]": { name: "title", displayName: "Titel" },
            "incident[Bearbeiter]": { name: "owner", displayName: "Bearbeiter" },
            "incident[Mitarbeiter]": { name: "employee", displayName: "Mitarbeiter" },
            "contact[Abteilung]": { name: "department", displayName: "Abteilung" },
            "incident[statecodename]": { name: "state", displayName: "Status" },
            "incident[statuscodename]": { name: "reason", displayName: "Statusgrund" },
            "incident[Priorität]": { name: "priority", displayName: "Priorität" },
            "incident[Erstellt am]": { name: "created", displayName: "Erstellt am", format: "dd.MM.yyyy HH:mm" },
            "[Link]": { name: "link", displayName: "Servicedesk-Link" },
            "[Sortierung]": { name: "sort", displayName: "Sortierung" },
        } satisfies ColumnMetadataMap,
    };
}
