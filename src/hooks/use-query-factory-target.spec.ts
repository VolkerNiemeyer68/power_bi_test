//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DataTable } from "@microsoft/fabric-visuals-core";
import type {
    CompiledDaxFilters,
    DaxFilterMode,
    InteractionTargetData,
    InteractionTargetLoadContext,
    InteractionTargetLoader,
    ManagedQueryFactoryParams,
    ManagedTargetLoadState,
} from "@microsoft/fabric-interaction-manager";
import { useQueryFactoryTarget } from "./use-query-factory-target";
import type { HighlightAlignment, HighlightData, QueryFactoryTargetState } from "./use-query-factory-target";
import type { DataQuery } from "@/lib/query-factory";

const { useManagedInteractionTarget, createHighlightData, executeQueryFactory } = vi.hoisted(() => ({
    useManagedInteractionTarget: vi.fn<typeof import("@microsoft/fabric-interaction-manager/react").useManagedInteractionTarget>(),
    createHighlightData: vi.fn(),
    executeQueryFactory: vi.fn<(factory: DataQuery, bypassCache?: boolean) => Promise<DataTable>>(),
}));
vi.mock("@microsoft/fabric-interaction-manager/react", () => ({ useManagedInteractionTarget }));
vi.mock("@microsoft/fabric-interaction-manager", () => ({ createHighlightData }));
vi.mock("@/lib/query-factory", () => ({ executeQueryFactory }));

interface SalesParams extends ManagedQueryFactoryParams {
    readonly region: string;
}

// The query text records the factory inputs so each test can see which filters reached the factory.
function salesByCategory({ region, interactionFilters = [] }: SalesParams): DataQuery {
    return { connection: "sales", query: JSON.stringify({ region, interactionFilters }), columnMetadata: {} };
}

function tableFor(factory: DataQuery): DataTable {
    return { columns: [{ name: "Query" }], rows: [[factory.query]] };
}

function contextFor(isCrossHighlightActive: boolean, filter = (mode: DaxFilterMode) => `${mode} filter`): InteractionTargetLoadContext {
    const compiledFilters: CompiledDaxFilters = {
        getFilters: (mode: DaxFilterMode): readonly string[] => [filter(mode)],
    } as CompiledDaxFilters;
    return { isCrossHighlightActive, compiledFilters };
}

function latestLoader(): InteractionTargetLoader {
    return useManagedInteractionTarget.mock.lastCall![1];
}

const alignment: HighlightAlignment = {
    groupingFields: ["Category"],
    missingMeasureReplacementValues: { Value: 0 },
    plottedMeasureFields: ["Value"],
};

beforeEach(() => {
    useManagedInteractionTarget.mockReset().mockReturnValue({ status: "loading" });
    createHighlightData.mockReset().mockImplementation((all: DataTable, highlighted: DataTable) => ({ all, highlighted }));
    executeQueryFactory.mockReset().mockImplementation(async (factory: DataQuery) => tableFor(factory));
});

describe("useQueryFactoryTarget", () => {
    it("preserves the manager's complete load-state contract", () => {
        expectTypeOf<QueryFactoryTargetState<InteractionTargetData>>().toExtend<ManagedTargetLoadState>();
        expectTypeOf<ManagedTargetLoadState>().toExtend<QueryFactoryTargetState<InteractionTargetData>>();
    });

    it("retains a filter-only target's table and exposes a refresh error", () => {
        const data: DataTable = tableFor(salesByCategory({ region: "West" }));
        const error: Error = new Error("Refresh failed");
        const loadState: ManagedTargetLoadState = { status: "refresh-error", data, isCrossHighlightActive: false, error };
        useManagedInteractionTarget.mockReturnValue(loadState);

        const { result } = renderHook(() => useQueryFactoryTarget("salesGrid", salesByCategory, { region: "West" }));

        expect(result.current).toBe(loadState);
        expect(result.current.status).toBe("refresh-error");
        if (result.current.status === "refresh-error") {
            expectTypeOf(result.current.data).toEqualTypeOf<DataTable>();
            expectTypeOf(result.current.error).toEqualTypeOf<Error>();
            expect(result.current.data).toBe(data);
            expect(result.current.error).toBe(error);
            expect(result.current.isCrossHighlightActive).toBe(false);
        }
    });

    it("retains both highlight datasets and their flag when a refresh fails", () => {
        const data: HighlightData = {
            all: tableFor(salesByCategory({ region: "West" })),
            highlighted: tableFor(salesByCategory({ region: "West", interactionFilters: ["highlight filter"] })),
        };
        const error: Error = new Error("Highlight refresh failed");
        const loadState: ManagedTargetLoadState = { status: "refresh-error", data, isCrossHighlightActive: true, error };
        useManagedInteractionTarget.mockReturnValue(loadState);

        const { result } = renderHook(() => useQueryFactoryTarget("salesChart", salesByCategory, { region: "West" }, alignment));

        expect(result.current).toBe(loadState);
        expect(result.current.status).toBe("refresh-error");
        if (result.current.status === "refresh-error") {
            expectTypeOf(result.current.data).toEqualTypeOf<HighlightData>();
            expectTypeOf(result.current.error).toEqualTypeOf<Error>();
            expect(result.current.data).toBe(data);
            expect(result.current.error).toBe(error);
            expect(result.current.isCrossHighlightActive).toBe(true);
        }
    });

    it("loads a filter-only target from the factory under the baseline filters", async () => {
        renderHook(() => useQueryFactoryTarget("salesGrid", salesByCategory, { region: "West" }));

        expect(useManagedInteractionTarget.mock.lastCall![0]).toBe("salesGrid");
        await expect(latestLoader()(contextFor(true))).resolves.toEqual(
            tableFor(salesByCategory({ region: "West", interactionFilters: ["baseline filter"] })),
        );
        expect(executeQueryFactory).toHaveBeenCalledTimes(1);
    });

    it("refreshes only the current filtered query without reading the cache, then resumes normal cache use", async () => {
        const { rerender } = renderHook(
            ({ refreshVersion }) => useQueryFactoryTarget("salesGrid", salesByCategory, { region: "West" }, undefined, refreshVersion),
            { initialProps: { refreshVersion: 0 } },
        );
        const initialLoader = latestLoader();
        const currentQuery = salesByCategory({ region: "West", interactionFilters: ["baseline filter"] });
        await initialLoader(contextFor(false));
        expect(executeQueryFactory).toHaveBeenCalledExactlyOnceWith(currentQuery, false);

        executeQueryFactory.mockClear();
        rerender({ refreshVersion: 1 });
        const refreshedLoader = latestLoader();
        expect(refreshedLoader).not.toBe(initialLoader);
        await refreshedLoader(contextFor(false));
        expect(executeQueryFactory).toHaveBeenCalledExactlyOnceWith(currentQuery, true);

        executeQueryFactory.mockClear();
        await refreshedLoader(contextFor(false, () => "next filter"));
        expect(executeQueryFactory).toHaveBeenCalledExactlyOnceWith(
            salesByCategory({ region: "West", interactionFilters: ["next filter"] }),
            false,
        );
    });

    it("uses the refresh factory once with all current filters, then returns to the normal factory", async () => {
        const liveFactory = (params: SalesParams): DataQuery => ({ ...salesByCategory(params), connection: "live" });
        const { rerender } = renderHook(
            ({ refreshVersion }) => useQueryFactoryTarget("salesGrid", salesByCategory, { region: "West" }, undefined, refreshVersion, liveFactory),
            { initialProps: { refreshVersion: 0 } },
        );
        await latestLoader()(contextFor(false));
        expect(executeQueryFactory.mock.lastCall?.[0].connection).toBe("sales");

        rerender({ refreshVersion: 1 });
        const loader = latestLoader();
        await loader({
            isCrossHighlightActive: false,
            compiledFilters: { getFilters: () => ["owner filter", "department filter"] } as CompiledDaxFilters,
        });
        expect(executeQueryFactory).toHaveBeenLastCalledWith(
            liveFactory({ region: "West", interactionFilters: ["owner filter", "department filter"] }), true,
        );
        await loader(contextFor(false, () => "next filter"));
        expect(executeQueryFactory).toHaveBeenLastCalledWith(
            salesByCategory({ region: "West", interactionFilters: ["next filter"] }), false,
        );
    });

    it("propagates a live refresh error and uses the normal factory on a later filter change", async () => {
        const liveFactory = (params: SalesParams): DataQuery => ({ ...salesByCategory(params), connection: "live" });
        const { rerender } = renderHook(
            ({ refreshVersion }) => useQueryFactoryTarget("salesGrid", salesByCategory, { region: "West" }, undefined, refreshVersion, liveFactory),
            { initialProps: { refreshVersion: 0 } },
        );
        rerender({ refreshVersion: 1 });
        const loader = latestLoader();
        executeQueryFactory.mockRejectedValueOnce(new Error("Live query failed"));
        await expect(loader(contextFor(false))).rejects.toThrow("Live query failed");
        await loader(contextFor(false, () => "new filter"));
        expect(executeQueryFactory).toHaveBeenLastCalledWith(
            salesByCategory({ region: "West", interactionFilters: ["new filter"] }), false,
        );
    });

    it("returns the baseline as both datasets when no highlight is active", async () => {
        renderHook(() => useQueryFactoryTarget("salesChart", salesByCategory, { region: "West" }, alignment));

        const all: DataTable = tableFor(salesByCategory({ region: "West", interactionFilters: ["baseline filter"] }));
        await expect(latestLoader()(contextFor(false))).resolves.toEqual({ all, highlighted: all });
        expect(executeQueryFactory).toHaveBeenCalledTimes(1);
        expect(createHighlightData).not.toHaveBeenCalled();
    });

    it("aligns the factory's highlighted subset with its baseline during a cross-highlight", async () => {
        renderHook(() => useQueryFactoryTarget("salesChart", salesByCategory, { region: "West" }, alignment));

        await latestLoader()(contextFor(true));
        expect(createHighlightData).toHaveBeenCalledWith(
            tableFor(salesByCategory({ region: "West", interactionFilters: ["baseline filter"] })),
            tableFor(salesByCategory({ region: "West", interactionFilters: ["highlight filter"] })),
            ["Category"],
            { Value: 0 },
            ["Value"],
        );
    });

    it("keeps the loader while inline inputs have the same contents", () => {
        const { rerender } = renderHook(
            ({ region }: { region: string }) => useQueryFactoryTarget(
                "salesChart",
                salesByCategory,
                { region },
                { ...alignment, groupingFields: [...alignment.groupingFields] },
            ),
            { initialProps: { region: "West" } },
        );
        const initialLoader: InteractionTargetLoader = latestLoader();

        rerender({ region: "West" });
        expect(latestLoader()).toBe(initialLoader);

        rerender({ region: "East" });
        expect(latestLoader()).not.toBe(initialLoader);
    });
});
