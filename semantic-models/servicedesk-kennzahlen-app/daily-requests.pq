let
    SnapshotUtc = DateTimeZone.RemoveZone(DateTimeZone.FixedUtcNow()),
    BerlinDate = (Utc as datetime) as date =>
        let
            Year = Date.Year(Date.From(Utc)),
            MarchEnd = #date(Year, 3, 31),
            OctoberEnd = #date(Year, 10, 31),
            SummerStart = #datetime(Year, 3, 31, 1, 0, 0) - #duration(Date.DayOfWeek(MarchEnd, Day.Sunday), 0, 0, 0),
            SummerEnd = #datetime(Year, 10, 31, 1, 0, 0) - #duration(Date.DayOfWeek(OctoberEnd, Day.Sunday), 0, 0, 0),
            Offset = if Utc >= SummerStart and Utc < SummerEnd then 2 else 1
        in
            Date.From(Utc + #duration(0, Offset, 0, 0)),
    EndDate = BerlinDate(SnapshotUtc),
    StartDate = Date.AddDays(EndDate, -60),
    EarliestUtc = DateTime.From(StartDate) - #duration(0, 2, 0, 0),
    Source = CommonDataService.Database("brandgroup-service.crm4.dynamics.com"),
    Selected = Table.SelectColumns(
        Source{[Schema="dbo", Item="incident"]}[Data],
        {"createdon", "deactivatedon", "statecode"}
    ),
    Incidents = Table.Buffer(Table.SelectRows(Selected, each
        ([createdon] <> null and [createdon] >= EarliestUtc and [createdon] < SnapshotUtc)
        or ([deactivatedon] <> null and [deactivatedon] >= EarliestUtc and [deactivatedon] < SnapshotUtc and ([statecode] = 1 or [statecode] = 2))
    )),
    NewDays = Table.AddColumn(
        Table.SelectRows(Incidents, each [createdon] <> null),
        "Day", each BerlinDate(DateTime.From([createdon])), type date
    ),
    NewCounts = Table.Group(NewDays, {"Day"}, {{"NewRequests", each Table.RowCount(_), Int64.Type}}),
    EndedDays = Table.AddColumn(
        Table.SelectRows(Incidents, each [deactivatedon] <> null and ([statecode] = 1 or [statecode] = 2)),
        "Day", each BerlinDate(DateTime.From([deactivatedon])), type date
    ),
    EndedCounts = Table.Group(EndedDays, {"Day"}, {{"EndedRequests", each Table.RowCount(_), Int64.Type}}),
    Calendar = Table.FromColumns({List.Dates(StartDate, 60, #duration(1, 0, 0, 0))}, type table [Day = date]),
    WithNew = Table.NestedJoin(Calendar, {"Day"}, NewCounts, {"Day"}, "New", JoinKind.LeftOuter),
    ExpandedNew = Table.ExpandTableColumn(WithNew, "New", {"NewRequests"}),
    WithEnded = Table.NestedJoin(ExpandedNew, {"Day"}, EndedCounts, {"Day"}, "Ended", JoinKind.LeftOuter),
    ExpandedEnded = Table.ExpandTableColumn(WithEnded, "Ended", {"EndedRequests"}),
    Filled = Table.ReplaceValue(ExpandedEnded, null, 0, Replacer.ReplaceValue, {"NewRequests", "EndedRequests"}),
    Typed = Table.TransformColumnTypes(Filled, {{"NewRequests", Int64.Type}, {"EndedRequests", Int64.Type}})
in
    Typed
