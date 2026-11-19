import employeesQuery from "./mitarbeiter.dax?raw";
import membershipsQuery from "./mitgliedschaften.dax?raw";

export const connection = "mitarbeiter";
export const employeeColumns = {
    user: "verwaltung azure_gruppen_user[Benutzer]",
    name: "verwaltung azure_gruppen_user[Name]",
};
export const groupColumn = "verwaltung azure_gruppen_user[Gruppe]";
export const employees = { connection, query: employeesQuery };

const defaultUserExpression = `MINX(
            FILTER(ALL('verwaltung azure_gruppen_user'[Benutzer]), NOT ISBLANK('verwaltung azure_gruppen_user'[Benutzer])),
            'verwaltung azure_gruppen_user'[Benutzer]
        )`;

export function memberships(user: string) {
    const query = membershipsQuery.replace(/\r\n/g, "\n");
    if (!query.includes(defaultUserExpression)) {
        throw new Error("Die Mitgliedschaftsabfrage enthält keinen Benutzerparameter.");
    }
    return {
        connection,
        query: query.replace(defaultUserExpression, `"${user.replace(/"/g, '""')}"`),
    };
}
