import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ensureAuthenticated } from "@microsoft/rayfin-cli/auth";

const workspaceId = "08775ebe-0b0d-4aa5-982e-6da664c5cae0";
const sourceIds = ["0f591231-10a7-43b9-862a-8f4c543ad566", "479aaefe-8ea0-4569-95ed-30556c56f42b"];
const displayName = "Servicedesk Kennzahlen App";
const folder = resolve("semantic-models", "servicedesk-kennzahlen-app");
const auth = await ensureAuthenticated(undefined, { silent: true });
const update = process.argv.includes("--update");
let existingId;

async function request(path, method = "GET", body) {
    const response = await fetch(`https://api.fabric.microsoft.com/v1/${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${auth.token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Fabric ${method} ${path}: ${response.status} ${await response.text()}`);
    return response;
}

async function complete(response, expectResult = true) {
    if (response.status !== 202) {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }
    const operationId = response.headers.get("x-ms-operation-id");
    if (!operationId || !/^[a-f0-9-]{36}$/i.test(operationId)) throw new Error("Missing valid Fabric operation ID.");
    for (let attempt = 0; attempt < 30; attempt++) {
        const delay = Number(response.headers.get("retry-after") ?? 5);
        if (!Number.isFinite(delay) || delay < 0 || delay > 120) throw new Error("Invalid Retry-After header.");
        await new Promise((done) => setTimeout(done, Math.max(1, delay) * 1000));
        response = await request(`operations/${operationId}`);
        const operation = await response.json();
        console.log(`Fabric operation ${operationId}: ${operation.status}`);
        if (operation.status === "Succeeded") {
            return expectResult ? complete(await request(`operations/${operationId}/result`)) : null;
        }
        if (operation.status === "Failed" || operation.status === "Cancelled") throw new Error(JSON.stringify(operation));
    }
    throw new Error(`Operation ${operationId} has not completed; inspect it before retrying.`);
}

let page = `workspaces/${workspaceId}/items?type=SemanticModel`;
while (page) {
    const listing = await (await request(page)).json();
    const existing = listing.value.find((item) => item.displayName === displayName);
    if (existing) {
        if (!update) throw new Error(`Model already exists (${existing.id}); use --update to update its definition.`);
        const saved = JSON.parse(await readFile(resolve(folder, "deployment.json"), "utf8"));
        if (saved.modelId !== existing.id || saved.workspaceId !== workspaceId) throw new Error("Deployment identity mismatch.");
        existingId = existing.id;
    }
    page = listing.continuationToken
        ? `workspaces/${workspaceId}/items?type=SemanticModel&continuationToken=${encodeURIComponent(listing.continuationToken)}`
        : null;
}
if (update && !existingId) throw new Error("No existing dashboard model to update.");

let settings;
for (const sourceId of sourceIds) {
    const info = await (await request(`workspaces/${workspaceId}/semanticModels/${sourceId}`)).json();
    if (info.sensitivityLabel) throw new Error("Source sensitivity label requires explicit preservation.");
    const definition = await complete(await request(
        `workspaces/${workspaceId}/semanticModels/${sourceId}/getDefinition?format=TMSL`, "POST",
    ));
    const modelPart = definition.definition.parts.find((part) => part.path === "model.bim");
    if (!modelPart) throw new Error(`Missing source model ${sourceId}.`);
    const source = JSON.parse(Buffer.from(modelPart.payload, "base64").toString("utf8"));
    if (source.model.roles?.length) throw new Error("Source RLS requires an explicit migration.");
    const incident = source.model.tables.find((table) => table.name === "Incident");
    const resolution = source.model.tables.find((table) => table.name === "IncidentResolution");
    const incidentQuery = JSON.stringify(incident?.partitions);
    const resolutionQuery = JSON.stringify(resolution?.partitions);
    if (!incidentQuery?.includes("new_time_estimated") || !resolutionQuery?.includes("timespent")) {
        throw new Error(`Source effort mapping changed in ${sourceId}.`);
    }
    settings ??= definition.definition.parts.find((part) => part.path === "definition.pbism");
}
if (!settings) throw new Error("Missing semantic model settings.");

const expression = await readFile(resolve(folder, "snapshot.pq"), "utf8");
const departmentsExpression = await readFile(resolve(folder, "departments.pq"), "utf8");
const dailyExpression = await readFile(resolve(folder, "daily-requests.pq"), "utf8");
const counts = ["ActiveRequests", "ActiveWithCreated", "ResolvedRequests", "ResolvedWithEffort", "ProjectsWithEffort", "TotalRequests"];
const averages = ["AverageActiveDays", "AverageResolutionHours", "AverageProjectDays"];
const model = {
    compatibilityLevel: 1567,
    model: {
        culture: "de-DE",
        sourceQueryCulture: "de-DE",
        defaultPowerBIDataSourceVersion: "powerBI_V3",
        annotations: [{ name: "__PBI_TimeIntelligenceEnabled", value: "0" }],
        tables: [{
            name: "Snapshot",
            columns: [
                ...counts.map((name) => ({ name, sourceColumn: name, dataType: "int64", summarizeBy: "none", formatString: "#,0" })),
                ...averages.map((name) => ({ name, sourceColumn: name, dataType: "double", summarizeBy: "none", formatString: "#,0.0" })),
                { name: "SnapshotUtc", sourceColumn: "SnapshotUtc", dataType: "dateTime", summarizeBy: "none", formatString: "General Date" },
            ],
            partitions: [{ name: "Snapshot", mode: "import", source: { type: "m", expression: expression.split(/\r?\n/) } }],
        }, {
            name: "DepartmentSnapshot",
            columns: [
                { name: "Department", sourceColumn: "Department", dataType: "string", summarizeBy: "none" },
                { name: "ActiveRequests", sourceColumn: "ActiveRequests", dataType: "int64", summarizeBy: "sum", formatString: "#,0" },
            ],
            partitions: [{ name: "DepartmentSnapshot", mode: "import", source: { type: "m", expression: departmentsExpression.split(/\r?\n/) } }],
        }, {
            name: "DailyRequestSnapshot",
            columns: [
                { name: "Day", sourceColumn: "Day", dataType: "dateTime", summarizeBy: "none", formatString: "dd.MM.yyyy" },
                ...["NewRequests", "EndedRequests"].map((name) => ({
                    name, sourceColumn: name, dataType: "int64", summarizeBy: "sum", formatString: "#,0",
                })),
            ],
            partitions: [{ name: "DailyRequestSnapshot", mode: "import", source: { type: "m", expression: dailyExpression.split(/\r?\n/) } }],
        }],
    },
};
const text = `${JSON.stringify(model, null, 2)}\n`;
await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, "model.bim"), text, "utf8");
await writeFile(resolve(folder, "definition.pbism"), Buffer.from(settings.payload, "base64"));
const definition = {
        parts: [
            { path: "model.bim", payloadType: "InlineBase64", payload: Buffer.from(text).toString("base64") },
            settings,
        ],
};
if (update) {
    await complete(await request(`workspaces/${workspaceId}/semanticModels/${existingId}/updateDefinition`, "POST", { definition }), false);
    console.log(`Updated definition for ${existingId}; refresh it to publish a new snapshot.`);
    process.exit(0);
}
const created = await complete(await request(`workspaces/${workspaceId}/semanticModels`, "POST", {
    displayName,
    description: "Stuendlicher Servicedesk-Snapshot mit Kennzahlen, Abteilungsverteilung und Tagesereignissen, ohne Anfragedetails oder personenbezogene Daten.",
    definition,
}));
if (!created.id) throw new Error(`Creation returned no model ID: ${JSON.stringify(created)}`);
const deployment = { workspaceId, sourceIds, modelId: created.id, displayName };
await writeFile(resolve(folder, "deployment.json"), `${JSON.stringify(deployment, null, 2)}\n`, "utf8");
console.log(JSON.stringify(deployment));
