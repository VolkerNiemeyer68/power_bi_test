let
    Source = CommonDataService.Database("brandgroup-service.crm4.dynamics.com"),
    Incidents = Table.SelectColumns(
        Source{[Schema="dbo", Item="incident"]}[Data],
        {"statecode", "customerid"}
    ),
    Active = Table.SelectRows(Incidents, each [statecode] = 0),
    Contacts = Table.SelectColumns(
        Source{[Schema="dbo", Item="contact"]}[Data],
        {"contactid", "department"}
    ),
    Joined = Table.NestedJoin(Active, {"customerid"}, Contacts, {"contactid"}, "Contact", JoinKind.LeftOuter),
    Expanded = Table.ExpandTableColumn(Joined, "Contact", {"department"}, {"Department"}),
    Departments = Table.TransformColumns(Expanded, {
        {"Department", each if _ = null or Text.Trim(_) = "" then "Ohne Abteilung" else Text.Trim(_), type text}
    }),
    Counts = Table.Group(Departments, {"Department"}, {
        {"ActiveRequests", each Table.RowCount(_), Int64.Type}
    })
in
    Counts
