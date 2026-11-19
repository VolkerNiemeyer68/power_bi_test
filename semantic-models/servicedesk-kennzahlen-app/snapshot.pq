let
    SnapshotUtc = DateTimeZone.RemoveZone(DateTimeZone.FixedUtcNow()),
    Source = CommonDataService.Database("brandgroup-service.crm4.dynamics.com"),
    Incidents = Table.Buffer(Table.SelectColumns(
        Source{[Schema="dbo", Item="incident"]}[Data],
        {"incidentid", "statecode", "createdon", "new_time_estimated"}
    )),
    Resolutions = Table.SelectColumns(
        Source{[Schema="dbo", Item="incidentresolution"]}[Data],
        {"incidentid", "timespent"}
    ),
    Active = Table.SelectRows(Incidents, each [statecode] = 0),
    ActiveWithCreated = Table.SelectRows(Active, each [createdon] <> null),
    ActiveAges = List.Transform(ActiveWithCreated[createdon], each Duration.TotalDays(SnapshotUtc - DateTime.From(_))),
    Resolved = Table.SelectRows(Incidents, each [statecode] = 1),
    EffortPerIncident = Table.Group(Resolutions, {"incidentid"}, {
        {"EffortMinutes", each List.Sum([timespent]), type nullable number}
    }),
    ResolvedWithEffort = Table.NestedJoin(Resolved, {"incidentid"}, EffortPerIncident, {"incidentid"}, "Effort", JoinKind.Inner),
    ResolvedEffort = Table.ExpandTableColumn(ResolvedWithEffort, "Effort", {"EffortMinutes"}),
    EffortMinutes = List.RemoveNulls(ResolvedEffort[EffortMinutes]),
    ProjectDays = List.RemoveNulls(Incidents[new_time_estimated]),
    Snapshot = #table(
        type table [
            ActiveRequests = Int64.Type,
            AverageActiveDays = nullable number,
            AverageResolutionHours = nullable number,
            AverageProjectDays = nullable number,
            ActiveWithCreated = Int64.Type,
            ResolvedRequests = Int64.Type,
            ResolvedWithEffort = Int64.Type,
            ProjectsWithEffort = Int64.Type,
            TotalRequests = Int64.Type,
            SnapshotUtc = datetime
        ],
        {{
            Table.RowCount(Active),
            List.Average(ActiveAges),
            List.Average(EffortMinutes) / 60,
            List.Average(ProjectDays),
            Table.RowCount(ActiveWithCreated),
            Table.RowCount(Resolved),
            List.Count(EffortMinutes),
            List.Count(ProjectDays),
            Table.RowCount(Incidents),
            SnapshotUtc
        }}
    )
in
    Snapshot
