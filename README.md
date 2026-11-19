
# servicedesk_rayfin

> **⚠️ This repository is under active development.** Features and instructions may change.

This is a starter template for building Fabric Apps - Analytics web apps. Clone this repo locally and follow the steps below to get started.

View our [Microsoft Learn documentation](https://learn.microsoft.com/fabric/apps/data-apps-template) for more information!

## Gruppenübersicht

Im Bereich Gruppen kann nach Name oder Benutzerkennung gesucht werden. Nach Auswahl eines
Mitarbeiters zeigt die App dessen Gruppen aus dem angebundenen Semantikmodell an. Die
Daten werden mit den Berechtigungen des angemeldeten Benutzers abgefragt; das Modell
und der Connector `mitarbeiter` müssen erreichbar sein.

## Servicedesk

Der Bereich **Servicedesk** verwendet das separate Importmodell
**Servicedesk Anfragenprioliste App** über den Connector `servicedesk-app`.
Die Filter **Bearbeiter**, **Mitarbeiter**, **Abteilung** und **Status** sind
anpassbar und können auch geleert werden. Standardmäßig ist der Status
`Aktiv` ausgewählt. Der Bearbeiter wird über `USERPRINCIPALNAME()` und
`systemuser[Benutzername]` beziehungsweise `systemuser[Primäre E-Mail-Adresse]`
dem vollständigen Namen des angemeldeten Benutzers zugeordnet.
Für `bg-pp@brand-group.com` bleibt der Bearbeiterfilter leer.
Fehlt bei anderen Benutzern eine eindeutige Zuordnung, zeigt die App einen
Fehler an, statt versehentlich ungefilterte Anfragen zu laden.

Die Abteilungszuordnung verwendet die aktive Beziehung
`incident[customerid]` → `contact[Kontakt]`. Die anfängliche Sortierung erfolgt
aufsteigend nach dem unveränderten Modellmeasure `Sortierung`, danach nach
Anfragenummer. Anfragenummer und Titel öffnen den Wert aus dem Measure `Link`
in einem neuen Tab. Der angemeldete Benutzer benötigt Zugriff auf das Modell
und die jeweilige Anfrage im Servicedesk. Der Ansichtsfilter ersetzt keine
modellseitige Zugriffskontrolle (RLS).

Benutzerstandard, Filterwerte und Anfragen werden beim Einstieg nacheinander
geladen. Die erste Anfragenabfrage startet erst nach Übernahme der
Standardfilter durch den InteractionManager. Filterwechsel werden serverseitig
ausgewertet; währenddessen bleiben vorhandene Ergebnisse sichtbar, auch bei
einem Aktualisierungsfehler. Erfolgreiche Ergebnisse verwendet die App aus ihrem
sitzungsgebundenen Abfragecache. **Anfragen aktualisieren** fragt Status und
Statusgrund nur für die Treffer der aktuellen Tabelle ab, einschließlich der
lokalen Suche. Pro DirectQuery-Abfrage werden bis zu 1.000 Anfrage-IDs geladen;
größere Trefferlisten werden nacheinander abgearbeitet. Anfragen, die nach
der Aktualisierung nicht mehr zum Statusfilter passen, verschwinden aus der
Tabelle. Wiedereröffnete Anfragen außerhalb der Tabelle erscheinen mit dem
nächsten 30-Minuten-Import. Fehlt für eine
Anfrage der Live-Status oder schlägt die Abfrage fehl, zeigt die App einen
Hinweis und verwendet den Importstand.

Der Live-Connector wurde am 19.11.2026 mit dem Besitzerkonto der produktiven
Fabric-App `servicedesk_rayfin` veröffentlicht. Für einen Rückfall auf die reine
Importansicht kann das Frontend mit `VITE_SERVICEDESK_LIVE_STATUS=disabled`
gebaut und bereitgestellt werden.

Zur Aktivierung im Projektordner mit dem Besitzerkonto anmelden und den
vollständigen Rollout starten. Ein rein statisches Deployment registriert
den neuen Semantikmodell-Connector nicht.

```powershell
Remove-Item Env:\VITE_SERVICEDESK_LIVE_STATUS -ErrorAction SilentlyContinue
npx rayfin login
npx rayfin up --workspace-id 08775ebe-0b0d-4aa5-982e-6da664c5cae0 --item-name servicedesk_rayfin
npx rayfin up status
```

Der interne Rayfin-Projektbezeichner `power-bi-test` bleibt unverändert,
damit bestehende Backend-Ressourcen weiterverwendet werden.

Auch bei `npm run dev` werden Anfragen über das veröffentlichte Fabric-Backend
ausgeführt. Neue Connectoren müssen daher mit `npx rayfin up` bereitgestellt
werden. Ein Neustart des lokalen Entwicklungsservers allein aktualisiert die
serverseitige Connector-Konfiguration nicht.

### Importmodell und aktueller Einrichtungsstand

Das separate Modell **Servicedesk Anfragenprioliste App**
(`ee45cbbe-21c8-4cef-a183-b79d0d71e946`) ist im selben Workspace angelegt.
Die Definition liegt unter
[semantic-models/servicedesk-anfragenprioliste-app](./semantic-models/servicedesk-anfragenprioliste-app).
Es verwendet dieselbe Dataverse-Quelle, drei Importtabellen mit insgesamt
22 Spalten sowie die unveränderten Measures `Link` und `Sortierung`.
Alle Status werden beibehalten; das Originalmodell bleibt unverändert.
Der Connector `servicedesk-app` ist registriert und die neue Ansicht verwendet
ihn. Die früheren Servicedesk-Modelle bleiben unverändert.

Am 17.11.2026 wurde das neue Modell im Fabric-Portal von
`bg-pp@brand-group.com` übernommen und erfolgreich der vorhandenen Verbindung
`Dynamics_Servicedesk` zugeordnet. Der einmalige Erstimport wurde von
10:39:48 bis 10:40:15 erfolgreich abgeschlossen. CLI und Browser wurden vor
den Zugriffen als `bg-pp@brand-group.com` geprüft. Dieses Konto bleibt für
die Verwaltung der Importmodelle vorgesehen. Die Veröffentlichung der App
`servicedesk_rayfin` erfordert dagegen ihr Besitzerkonto. Der Windows-Benutzer
ist dafür nicht maßgeblich.

Nach dem vorübergehenden Kapazitätsproblem waren Schemakatalog und alle drei
App-Abfragen am 17.11.2026 erfolgreich validiert. Der gespeicherte
Aktualisierungszeitplan wurde nach Neuladen im Portal geprüft: täglich
48 eindeutige Zeitpunkte von 00:00 bis 23:30 im 30-Minuten-Abstand,
Zeitzone `W. Europe Standard Time` (Berlin). Fehlerbenachrichtigungen gehen
an den Modellbesitzer. Backend-Connector-Konfiguration und Frontend wurden
in Fabric bereitgestellt.

Die drei DAX-Abfragen wurden live sowie die Ansicht mit 19 gezielten Tests,
Typprüfung, Lint und Produktionsbuild geprüft. Die veröffentlichte Ansicht
ist im Browser erreichbar. Der abschließende End-to-End-Test ist jedoch noch
blockiert: Browseraufrufe von `connector-invoke` laufen nach 30 Sekunden in
ein Timeout, sowohl für `servicedesk-app` als auch für die bestehende
Gruppenübersicht (`mitarbeiter`). Die synchronisierte Backend-URL stimmt mit
der veröffentlichten Laufzeitkonfiguration überein. Dieser Browserzugriff
muss noch erfolgreich geprüft werden; die erfolgreichen CLI-Abfragen
ersetzen diesen Nachweis nicht.

Die frühere Berechtigungsgrenze der Rayfin-Anmeldung bleibt bestehen:
`Dataset.ReadWrite.All` konnte wegen `AADSTS65002` nicht ergänzt werden.
Übernahme, Verbindungszuordnung und Erstimport wurden deshalb über die
reguläre Fabric-Oberfläche mit `bg-pp@brand-group.com` durchgeführt.

### DirectQuery für Live-Status

Das produktiv verwendete Modell [Servicedesk Status Live – DirectQuery Pilot](https://app.fabric.microsoft.com/groups/08775ebe-0b0d-4aa5-982e-6da664c5cae0/datasets/bbd4c88f-5f0b-4742-b163-64b8bd87ac1e/details)
bleibt trotz seines Namens in Betrieb. Der App-Connector `servicedesk-status-live`
nutzt die Cloud-Verbindung `Dynamics_Servicedesk Neu` mit Dataverse-SSO für
DirectQuery. Das Live-Modell braucht keinen geplanten Datenimport.

`Azure_SharePoint_SE_Mitglieder` hat Lesen- und Build-Rechte am Live-Modell.
Dynamics-Leserechte bleiben Voraussetzung; bei fehlendem Zugriff bleibt die
Importansicht sichtbar. Die Filterung bei eingeschränkten Dynamics-Zeilenrechten
wurde nicht separat verifiziert.

## Dashboard

Der Bereich **Dashboard** liest ausschließlich die gespeicherte Kennzahlenzeile,
die aggregierte Abteilungsverteilung und Tagesereignisse aus **Servicedesk Kennzahlen App**
(`7ac71591-88b7-4146-af36-ab6117fe7ea7`),
Connector `servicedesk-kennzahlen`. Es werden weder Anfragedetails noch
personenbezogene Daten in diesem Modell gespeichert. Die bisherigen Modelle
und ihr Aktualisierungsverhalten bleiben unverändert.

Die Definition orientiert sich an **Servicedesk Dashboard** und
**Servicedesk Projekte** und verwendet dieselbe Dataverse-Quelle:

- **Aktive Anfragen:** `incident.statecode = 0` (Aktiv).
- **Durchschnittlich aktiv:** verstrichene Kalendertage seit `createdon` bis
  zum UTC-Snapshot-Zeitpunkt, ausschließlich aktive Anfragen mit Erstellungsdatum.
- **Durchschnittlicher Abschlussaufwand (Stunden):** `incidentresolution.timespent`
  je Anfrage summieren; Durchschnitt über behobene Anfragen (`statecode = 1`)
  mit Aufwand, anschließend Minuten durch 60 teilen.
- **Durchschnittlicher Projektaufwand (Manntage / MTG):**
  Durchschnitt vorhandener `incident.new_time_estimated` über alle Status.
  Diese Grundgesamtheit ist absichtlich nicht auf aktive Anfragen beschränkt.
- **Kuchengrafik nach Abteilung:** importierte Anzahl aktiver Anfragen je
  `contact.department`, über `incident.customerid` → `contact.contactid`
  zugeordnet wie im Servicedesk-Bereich. Ein Left Join erhält auch Anfragen
  ohne passenden Kontakt. Fehlende oder leere Abteilungen werden als
  **Ohne Abteilung** zusammengefasst. Die Grafik zeigt höchstens die zehn
  Abteilungen mit den meisten aktiven Anfragen; bei Gleichstand entscheidet
  der Abteilungsname aufsteigend. Alle übrigen Abteilungen werden in einem
  zusätzlichen Segment **Rest** summiert, sofern vorhanden. Prozentanteile
  beziehen sich auf alle aktiven Anfragen, einschließlich Rest.
  Die aufklappbare Tabelle enthält weiterhin alle Abteilungen, nach Anzahl
  absteigend und bei Gleichstand nach Namen sortiert.
- **100-%-Säulendiagramm Neu / Beendet:** tägliches Verhältnis der neu erstellten
  zu beendeten Anfragen für die letzten **60 abgeschlossenen Berliner Kalendertage**,
  ohne den laufenden Tag. **Neu** zählt `incident.createdon`, unabhängig vom
  aktuellen Status. **Beendet** zählt behobene und stornierte Anfragen
  (`statecode = 1` oder `2`) nach `incident.deactivatedon`, nicht `modifiedon`.
  UTC-Zeitpunkte werden einschließlich der EU-Sommerzeit in Berliner Tage umgerechnet.
  Pro Tag bilden Neu und Beendet zusammen 100 %; Tage ohne Ereignisse bleiben
  leer. Prozentbeschriftungen erscheinen ab 10 % Segmentanteil, die Tooltips
  enthalten auch die absoluten Anzahlen. Die zusätzliche Tabelle zeigt alle
  60 Tage chronologisch, einschließlich Nulltagen.
  Rot für Neu und Grün für Beendet sind bewusst feste semantische Farben;
  weiße Innenbeschriftungen bleiben in beiden App-Designs kontrastreich.
  Es wird der aktuell gespeicherte Beendigungszeitpunkt ausgewertet, keine
  vollständige Status- oder Wiedereröffnungshistorie. Wiedereröffnete Anfragen
  und spätere Statusänderungen können deshalb frühere Tageswerte verändern.

Fehlende Werte werden nicht als null Stunden/Tage gewertet; echte Nullwerte
fließen in den Durchschnitt ein. Die Ansicht zeigt die Berechnungsbasis je
Durchschnitt und bei fehlender Basis einen Gedankenstrich.
Beide Diagramme und Kennzahlen bilden eine gemeinsame KPI-Visualisierung.
Die Kennzahlen bleiben Gesamtwerte des Servicedesks; die Kuchengrafik ist deren
Abteilungsaufschlüsselung, kein zusätzlicher Seitenfilter. Auch die Tagesereignisse
beziehen sich unabhängig von der Abteilungsverteilung auf den gesamten Servicedesk.

### Stündlicher Server-Snapshot

Das Modell ist der bestehenden Verbindung `Dynamics_Servicedesk` zugeordnet.
Der im Portal gespeicherte und nach Neuladen geprüfte Zeitplan enthält täglich
24 Zeitpunkte von **00:00 bis 23:00 UTC**, jeweils zur vollen Stunde.
Der Erstimport am 17.11.2026 von **13:15:05 bis 13:15:18 Uhr (Berlin)**
war erfolgreich. Die finale App-Abfrage lieferte eine Zeile mit 257 aktiven
Anfragen; die Statuscodes wurden zusätzlich gegen die Referenzauswertung geprüft.
Power BI kann geplante Aktualisierungen kapazitätsbedingt verzögert starten.

Nur der serverseitige Import berechnet Kennzahlen aus Dataverse. Die
Browseransicht liest beim Einstieg, alle fünf Minuten, bei Rückkehr zum Tab und
über **Datenstand laden** lediglich die gespeicherten Snapshot-Tabellen, jeweils ohne alten
Sitzungscache. Sie löst keinen Import aus. Der tatsächliche Datenstand wird in
Berliner Zeit angezeigt; ab 90 Minuten erscheint ein Warnhinweis. Scheitert
ein Import, bleibt der letzte erfolgreich importierte Snapshot erhalten.
Abfrage- und Schemafehler sind sichtbar und werden nicht als Nullwerte dargestellt.
Die Tabelle `DepartmentSnapshot` enthält nur Abteilungsbezeichnung und Anzahl;
Kontakt- und Anfragekennungen werden nicht importiert.
`DailyRequestSnapshot` enthält ausschließlich Tag, Neu-Anzahl und Beendet-Anzahl.
Alle drei Importtabellen werden mit dem bestehenden stündlichen Modellzeitplan aktualisiert.
Der Erweiterungsimport wurde live geprüft: 36 Abteilungen mit insgesamt
257 aktiven Anfragen, exakt entsprechend der Gesamtkennzahl.
Die bereitgestellte Kuchengrafik wurde im Fabric-Browser sichtbar geprüft;
die ergänzende Abteilungstabelle lässt sich öffnen und wieder schließen.
Der zusätzliche Tagesimport wurde ebenfalls erfolgreich geprüft: 60 Zeilen
vom 18.09. bis 16.11.2026, darunter 7 neue und 10 beendete Anfragen am 18.09.
und Nulltage am 19./20.09. Das Diagramm rendert mit diesen Echtdaten 84
Säulensegmente und 84 Prozentbeschriftungen über die vollständige Zeitachse.
Die Meldung **Another refresh request is already executing** bedeutet,
dass bereits eine Modellaktualisierung läuft. In diesem Fall keinen weiteren
Import starten, sondern den laufenden Import abwarten.

Die reproduzierbare M-Abfrage und Importdefinition liegen unter
[semantic-models/servicedesk-kennzahlen-app](./semantic-models/servicedesk-kennzahlen-app).
`node scripts/create-dashboard-model.mjs` erstellt das Modell nur, wenn es noch
nicht existiert. `--update` verlangt die passende lokale Bereitstellungs-ID und
aktualisiert ausschließlich dessen Definition; anschließend ist ein Modellimport
nötig. Verbindung und Zeitplan werden im Portal verwaltet, nicht durch das Skript.
Für Arbeiten am Dashboard-Modell gilt weiterhin `bg-pp@brand-group.com`.

Die Dashboard-Erweiterung wird mit 57 gezielten Tests (einschließlich
bestehender Navigation und Servicedesk), Typprüfung, Lint und Produktionsbuild
validiert. UI-Änderungen werden zuerst unter Localhost geprüft; die
Veröffentlichung nach Fabric erfolgt separat nach Freigabe.
Top 10 plus Rest wurde über die lokale Vorschau auf Port 5174 im Browser
geprüft: Rest umfasst im geprüften Snapshot 76 von 257 Anfragen (29,57 %).
Diese Erweiterung ist noch nicht nach Fabric veröffentlicht.
Das Tagesdiagramm wurde zusätzlich in der lokalen Dashboard-Ansicht auf
Port 5173 mit echten Snapshot-Daten sichtbar geprüft: rote/grüne Segmente,
lesbare weiße Prozentwerte, deutsche Datumsachse, leere Nulltage und die
geöffnete 60-Tage-Tabelle mit den validierten Tageszahlen. Die Tages-Modellerweiterung
ist veröffentlicht und erfolgreich importiert; die neue Oberfläche bleibt
bis zu einer separaten Freigabe ausschließlich lokal.
Die bisherige Version ohne Rest-Segment wurde mit `npx rayfin up` bereitgestellt. `npx rayfin up status`
bestätigt den erreichbaren Verwaltungsendpunkt. Der tatsächliche Browserzugriff
im Fabric-Portal als `bg-pp@brand-group.com` war erfolgreich: alle vier
Kennzahlen, Einheiten und der Berliner Datenstand entsprechen der validierten
Modellabfrage; auch **Datenstand laden** funktioniert. Der frühere Timeoutbefund
im Servicedesk-Abschnitt ist damit kein offener Blocker für dieses Dashboard.

## Prerequisites

1. **Node.js (v22)**: Download and install from https://nodejs.org/dist/v22.22.2/node-v22.22.2-x64.msi
2. **GitHub Copilot CLI**: Refer to https://github.com/github/copilot-cli
3. **Fabric account**: A Microsoft Entra account with access to the Fabric workspace and the semantic model. You sign in through the project's own Rayfin CLI (see the steps below); the Azure CLI is not required.

## Instructions for building a new web app

1. **Open Terminal**: Open Terminal in the local folder where you want to clone this repo and create your app.
1. **Clone this repo**: Run `git clone <REPO_URL> <repo_name>`. Replace `<REPO_URL>` with this repository's URL and `<repo_name>` with the name you want for your project folder.
1. **Navigate to the repo folder**: Run `cd <repo_name>`. (Optional: Run `code` to open VS Code in that folder and open Terminal inside VS Code.)
1. **Install dependencies**: Run `npm install`.
1. **Sign in**: Run `npx rayfin login`, and confirm with `npx rayfin login status`. Copilot queries your semantic model through this sign-in.
1. **Launch Copilot**: Run `copilot` to start the Copilot CLI. Then type a prompt for what you want to build. Include the dataset ID of the semantic model (from Power BI Service) that you want to use and the URI of the Fabric workspace where the app should be provisioned. (To get the dataset ID, copy the value between `...dataset/` and `/overview...` from the URL.)
1. **Preview your app**: After Copilot is done, run `npm run dev` and leave the development server running.
1. **Open Fabric shell**: Navigate to the workspace in Fabric portal and open the artifact. Then append `&devUri=http://localhost:5173` at the end. This allows you to preview your app.
1. **Deploy or update the app**: When you are ready to publish the latest changes, run `npx rayfin up --workspace-uri "<workspace-uri>"` using your Fabric workspace URL. Users with access to that workspace can then open the updated app.

<details>
<summary><strong>💡 Tips</strong></summary>

- Use **Shift + Tab** in Copilot to switch to **Plan mode**, where Copilot will present a plan and ask for confirmation before writing any code.

</details>

<details>
<summary><strong>📝 Example prompts</strong></summary>

> When using any example below, include the semantic model ID and the URI of the Fabric workspace where the app should be provisioned. Ex. `Semantic model ID: 12345678-1234-1234-1234-123456789abc Fabric workspace: https://fabric.microsoft.com/groups/12345678-1234-1234-1234-123456789abc`

- `Create a sales performance dashboard using the "Contoso Sales" semantic model. Include revenue KPIs, a monthly trend line chart, top 10 stores by profit, and a regional breakdown bar chart.`
- `Build an executive summary app for the "HR Analytics" model with headcount by department, attrition rate trends over the past 3 years, and a data grid of open positions sorted by days-to-fill.`
- `I want a customer insights app. Show customer lifetime value distribution, churn risk segmentation, and a filterable table of top accounts.`
- `Create a supply chain monitoring dashboard from the "Logistics Ops" model. I need inventory levels by warehouse, on-time delivery rate KPIs, and a heatmap of shipping delays by region and month.`
- `Build a financial reporting app using the "GL Financials" semantic model with a P&L summary, expense breakdown by cost center, and quarter-over-quarter variance charts. Add a date range filter across all visuals.`

</details>


## Need help?

If you have any questions or run into any problems, please [file an issue](../../issues) on this repository.