# Plan: PRD-FEAT-008 (indgreb) og resten af PRD-FEAT-009 (selvjustering)

**Status:** forslag, venter på Stens godkendelse. Ikke implementeret.
CLAUDE.md kræver plan mode før disse to features. Dette dokument er planen.

## Hvad der allerede findes

- PRD-FEAT-009.1, 009.2, 009.3, 009.4 er bygget, fordi `senses_set` (PRD-FEAT-005.1/005.2) kræver dem:
  `src/core/policy.ts` tillader kun `gain`/`threshold`/`window` inden for `bounds`, alt audites, og
  standardgrænserne er smalle. Det dækkes af tests, blandt andet en fuzz-test med 5000 tilfældige forsøg.
- Hooks optager kun events. De griber ikke ind endnu: ingen injektion, advarsel eller blokering.

## Forslag til PRD-FEAT-008

| Grad | Hvor | Hvad sker der |
|---|---|---|
| `inform` | `UserPromptSubmit` → `additionalContext` | Én kort, struktureret linje, fx `senses: pain 0.80 (6 of 9 calls failed) · ctx 0.42`. Kun tal og faste labels, aldrig rå logtekst. |
| `warn` | `PostToolUse` / `PostToolUseFailure` → `additionalContext`, når tærsklen krydses opad | `senses warning: pain 0.80 >= 0.60. See the senses skill.` Statuslinjen viser `!`. |
| `block` | `PreToolUse` → `permissionDecision: "deny"` | Afviser skrivende og kørende tools (Bash, Edit, Write, ...), men tillader læsende tools og `senses_*`, så agenten kan undersøge problemet. |
| `influence` | Som `warn`, plus en instruktion fra en hvidlistet skabelon | Fx "kør testene før næste ændring" eller "foreslå /compact". |

Fælles regler:

- **Hysterese og cooldown** (PRD-SEC-009): en sans "krydser" først, når den har været under
  `threshold − 0.05`. `warn` gentages højst hvert 10. minut pr. sans.
- **Audit** (PRD-FEAT-008.3): hver krydsning logges som `threshold_crossed`, og hvert indgreb som `action`,
  med sans, værdi og tærskel.
- **`block` har altid to udveje** (PRD-FEAT-008.2):
  1. Tidsudløb: `blockTimeout` (standard 10 min). Derefter falder sansen til `warn`, indtil den har været
     under tærsklen.
  2. Menneskelig override: knappen "Tillad i 15 min" i dashboardet skriver `override.json`. Dashboardet
     er det eneste, der kan skrive den fil.
- **Handlingsgrad ændres kun af mennesket** (PRD-FEAT-008.1). Det er allerede sikret, fordi `action` ikke
  kan ændres via MCP.

## Forslag til resten af PRD-FEAT-009

- **Begræns hvor ofte og hvor meget** (PRD-SEC-009, "kan oscillere"):
  - højst 3 agent-ændringer pr. sans pr. 30 min,
  - højst 25 % af bounds-intervallet pr. ændring.
- **Agenten må ikke gå udenom MCP.** Den har Edit/Write/Bash og kan i princippet:
  - redigere `senses.json` eller `override.json` direkte,
  - læse dashboard-tokenet i `dashboard.json` og kalde API'et som "human".

  Forslag:
  1. `PreToolUse` afviser Edit/Write mod `.netsi-agent-senses/`. Bash-kommandoer, der nævner mappen,
     afvises også. For Bash er det en tekstmatch og derfor kun bedste forsøg.
  2. Tokenet skrives ikke til projektmappen. Det skrives i stedet til en mappe med `0700`-rettigheder
     uden for projektet, og `/senses` åbner URL'en i browseren uden at vise den til modellen.
  3. Konfigændringer, der ikke kom fra MCP eller dashboardet, audites som `actor: "system"` med
     `reason: "file edited outside the dashboard"`, så de i det mindste kan ses.

  Ærligt forbehold: på samme maskine med shell-adgang kan dette ikke gøres helt vandtæt. Det er
  detektion og friktion, ikke en sandkasse.

## Spørgsmål til Sten, før jeg bygger

1. **`block`:** er det rigtigt kun at blokere skrivende/kørende tools og lade læsning være fri? Og er
   10 min som tidsudløb passende?
2. **`influence`-hvidlisten** (PRD åbent spørgsmål 4): hooks kan injicere tekst og afvise tools. Det er
   uverificeret, om de kan skifte model, permission mode eller plan mode direkte. Mit forslag til V1:
   kun hvidlistede instruktionsskabeloner. Settings-ændringer kommer senere, når de er verificeret.
3. **Dry run** (PRD åbent spørgsmål 6): skal nye installationer starte i en tilstand, hvor sanserne
   logger, hvad de ville gøre, uden at gribe ind? Jeg anbefaler ja.
4. Er **bedste forsøg**-beskyttelsen mod direkte filredigering god nok for V1?
