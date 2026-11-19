import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ensureAuthenticated } from "@microsoft/rayfin-cli/auth";

const workspaceId = "08775ebe-0b0d-4aa5-982e-6da664c5cae0";
const sourceId = "814786ce-8101-4599-b92a-53993c5acab7";
const displayName = "Servicedesk Anfragenprioliste App";
const baseUrl = "https://api.fabric.microsoft.com/v1";
const folder = resolve("semantic-models", "servicedesk-anfragenprioliste-app");
const auth = await ensureAuthenticated(undefined, { silent: true });

async function request(path, method = "GET", body) {
    const response = await fetch(`${baseUrl}/${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${auth.token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
        throw new Error(`Fabric ${method} ${path}: ${response.status} ${await response.text()}`);
    }
    return response;
}

async function complete(response) {
    if (response.status !== 202) return response.json();
    const operationId = response.headers.get("x-ms-operation-id");
    if (!operationId || !/^[a-f0-9-]{36}$/i.test(operationId)) {
        throw new Error("Fabric returned no valid operation ID.");
    }
    for (let attempt = 0; attempt < 30; attempt++) {
        const delay = Math.max(1, Number(response.headers.get("retry-after") ?? 5));
        if (!Number.isFinite(delay) || delay > 120) throw new Error("Invalid Retry-After header.");
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delay * 1000));
        response = await request(`operations/${operationId}`);
        const operation = await response.json();
        console.log(`Fabric operation ${operationId}: ${operation.status}`);
        if (operation.status === "Succeeded") {
            return (await request(`operations/${operationId}/result`)).json();
        }
        if (operation.status === "Failed" || operation.status === "Cancelled") {
            throw new Error(JSON.stringify(operation));
        }
    }
    throw new Error(`Operation ${operationId} has not completed; check it before retrying.`);
}

let page = `workspaces/${workspaceId}/items?type=SemanticModel`;
while (page) {
    const listing = await (await request(page)).json();
    const existing = listing.value.find((item) => item.displayName === displayName);
    if (existing) throw new Error(`Model already exists (${existing.id}); it was not overwritten.`);
    page = listing.continuationToken
        ? `workspaces/${workspaceId}/items?type=SemanticModel&continuationToken=${encodeURIComponent(listing.continuationToken)}`
        : null;
}

const sourceInfo = await (await request(`workspaces/${workspaceId}/semanticModels/${sourceId}`)).json();
if (sourceInfo.sensitivityLabel) throw new Error("Source sensitivity label requires explicit preservation.");
const sourceDefinition = await complete(await request(
    `workspaces/${workspaceId}/semanticModels/${sourceId}/getDefinition?format=TMSL`,
    "POST",
));
const sourcePart = sourceDefinition.definition.parts.find((part) => part.path === "model.bim");
const settings = sourceDefinition.definition.parts.find((part) => part.path === "definition.pbism");
if (!sourcePart || !settings) throw new Error("The source definition is incomplete.");
const source = JSON.parse(Buffer.from(sourcePart.payload, "base64").toString("utf8"));
if (source.model.roles?.length) throw new Error("Source RLS roles require an explicit migration.");

const requiredColumns = {
    contact: ["contactid", "department"],
    incident: [
        "incidentid", "ticketnumber", "title", "ownerid", "owneridname", "owninguser",
        "customerid", "customeridname", "statecode", "statecodename", "statuscodename",
        "prioritycodename", "createdon", "new_bg_reminder_on", "new_fertigstellungsgradinfo",
        "casetypecodename",
    ],
    systemuser: ["systemuserid", "domainname", "internalemailaddress", "fullname"],
};
const tables = Object.entries(requiredColumns).map(([name, sources]) => {
    const original = source.model.tables.find((table) => table.name === name);
    if (!original || original.partitions.length !== 1) {
        throw new Error(`Expected one source partition for ${name}.`);
    }
    const columns = sources.map((sourceColumn) => {
        const column = original.columns.find((candidate) => candidate.sourceColumn === sourceColumn);
        if (!column || column.type === "calculated") {
            throw new Error(`Missing physical column ${name}.${sourceColumn}.`);
        }
        return {
            name: column.name,
            dataType: column.dataType,
            sourceColumn,
            summarizeBy: "none",
            ...(column.formatString ? { formatString: column.formatString } : {}),
        };
    });
    const partition = original.partitions[0];
    if (partition.source.type !== "m") throw new Error(`Unsupported partition source for ${name}.`);
    const expression = partition.source.expression;
    const originalQuery = Array.isArray(expression) ? expression.join("\n") : expression;
    if (typeof originalQuery !== "string") throw new Error(`Missing source query for ${name}.`);
    const measures = name === "incident"
        ? ["Link", "Sortierung"].map((measureName) => {
            const measure = original.measures.find((candidate) => candidate.name === measureName);
            if (!measure) throw new Error(`Missing source measure ${measureName}.`);
            return { name: measure.name, expression: measure.expression };
        })
        : [];
    return {
        name,
        columns,
        ...(measures.length ? { measures } : {}),
        partitions: [{
            name,
            mode: "import",
            source: {
                type: "m",
                expression: [
                    "let",
                    `    SourceTable = (${originalQuery}),`,
                    `    SelectedColumns = Table.SelectColumns(SourceTable, {${sources.map((column) => JSON.stringify(column)).join(", ")}})`,
                    "in",
                    "    SelectedColumns",
                ],
            },
        }],
    };
});
const hasColumn = (tableName, columnName) => tables.some(
    (table) => table.name === tableName && table.columns.some((column) => column.name === columnName),
);
const model = {
    compatibilityLevel: source.compatibilityLevel,
    model: {
        culture: source.model.culture,
        sourceQueryCulture: source.model.sourceQueryCulture,
        defaultPowerBIDataSourceVersion: source.model.defaultPowerBIDataSourceVersion,
        annotations: [{ name: "__PBI_TimeIntelligenceEnabled", value: "0" }],
        tables,
        relationships: source.model.relationships
            .filter((relationship) => hasColumn(relationship.fromTable, relationship.fromColumn)
                && hasColumn(relationship.toTable, relationship.toColumn))
            .map(({ annotations: _annotations, ...relationship }) => relationship),
    },
};
const modelText = `${JSON.stringify(model, null, 2)}\n`;
await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, "model.bim"), modelText, "utf8");
await writeFile(resolve(folder, "definition.pbism"), Buffer.from(settings.payload, "base64"));
console.log(`Prepared ${tables.length} import tables with ${tables.reduce((sum, table) => sum + table.columns.length, 0)} columns.`);
const created = await complete(await request(`workspaces/${workspaceId}/semanticModels`, "POST", {
    displayName,
    description: "Schlankes Servicedesk-Importmodell fuer die App. Dataverse-Quelle, alle Status, Aktualisierung alle 30 Minuten.",
    definition: {
        parts: [
            { path: "model.bim", payloadType: "InlineBase64", payload: Buffer.from(modelText).toString("base64") },
            settings,
        ],
    },
}));
if (!created.id) throw new Error(`Creation returned no model ID: ${JSON.stringify(created)}`);
const deployment = { workspaceId, sourceId, modelId: created.id, displayName };
await writeFile(resolve(folder, "deployment.json"), `${JSON.stringify(deployment, null, 2)}\n`, "utf8");
console.log(JSON.stringify(deployment));
