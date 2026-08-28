# CRA Evidence Pack Skill - plan de conception et d'implémentation

Date : 28 août 2026  
Statut : conception approuvée, implémentation non commencée  
Reprise prévue : Claude Code  

## 1. Résumé

Créer un skill portable pour agents IA qui aide une PME commercialisant un logiciel Node.js installable chez ses clients à préparer un dossier de preuves techniques relatif au Cyber Resilience Act européen.

Le skill analyse un dépôt, collecte les éléments vérifiables déjà présents, exécute des contrôles déterministes, génère ou importe un SBOM CycloneDX et produit un dossier versionnable en Markdown et JSON. Il signale les preuves absentes, périmées ou impossibles à vérifier.

Le produit ne certifie jamais la conformité, ne remplace pas un conseil juridique et ne décide pas seul si le CRA s'applique. Il prépare des éléments techniques pouvant être examinés par les responsables produit, sécurité et conformité de la PME.

## 2. Décisions déjà prises

- Format : skill portable compatible avec plusieurs agents.
- Architecture : instructions dans `SKILL.md` et scripts déterministes Node.js.
- Utilisateur initial : PME commercialisant un logiciel.
- Produit initial : logiciel Node.js distribué et installé chez le client.
- Hébergement initial : aucun service distant obligatoire.
- Sorties : fichiers Markdown et JSON versionnables dans Git.
- Langue du skill : anglais pour maximiser la portabilité ; documentation utilisateur disponible en anglais, puis en français.
- Attitude réglementaire : assistance technique fondée sur des sources, jamais certification ou avis juridique.

## 3. Problème utilisateur

Une petite entreprise utilise généralement plusieurs outils indépendants pour produire un SBOM, suivre ses dépendances, documenter ses vulnérabilités, prouver ses tests et décrire ses releases. Les preuves restent dispersées entre le dépôt, la CI, les registries, les tickets et les documents internes.

Le responsable technique ne sait pas facilement :

- quelles preuves existent déjà ;
- quelles preuves sont actuelles ;
- comment une preuve a été produite ;
- quelle exigence ou pratique elle cherche à documenter ;
- quelles lacunes doivent être traitées en priorité ;
- comment reproduire le même dossier lors de la release suivante.

Le skill doit transformer cet état dispersé en un dossier explicable et reproductible.

## 4. Proposition de valeur

> Analyze a commercial Node.js product repository and produce a reproducible, source-linked CRA technical evidence pack without claiming legal compliance.

La valeur ne vient pas d'un résumé produit par un LLM. Elle vient de la traçabilité : chaque constat doit indiquer la source, la commande, la date, le commit, le résultat et les limites de la vérification.

## 5. Périmètre du MVP

### Inclus

- Dépôts Git contenant un produit Node.js.
- `npm`, avec un `package-lock.json` obligatoire pour le chemin nominal.
- Dépôts simples et workspaces npm basiques.
- Exécution locale sur macOS et Linux.
- CI de référence : GitHub Actions.
- Collecte de métadonnées Git et package npm.
- Inventaire des dépendances directes et transitives.
- Génération ou import d'un SBOM CycloneDX JSON.
- Détection des documents et pratiques de sécurité observables.
- Collecte de preuves de tests, builds et releases.
- Rapport de lacunes avec états normalisés.
- Export d'un pack Markdown/JSON dans un dossier choisi par l'utilisateur.
- Mode hors ligne lorsque toutes les dépendances nécessaires sont déjà installées.
- Redaction des secrets et exclusion explicite des fichiers sensibles.

### Exclus du MVP

- SaaS pur et analyse détaillée des solutions de traitement de données à distance.
- Produits embarqués, firmware, mobile ou IoT.
- Python, Java, Rust et autres écosystèmes.
- Certification, marquage CE ou génération d'une déclaration UE de conformité.
- Détermination juridique automatique du rôle de fabricant, importateur, distributeur ou steward.
- Soumission d'un incident à une autorité.
- Portail web, comptes utilisateurs, base de données ou service cloud.
- Analyse dynamique complète de la sécurité du produit.
- Correction automatique du code ou des politiques de sécurité.
- Garantie qu'une preuve satisfait juridiquement une exigence.

## 6. Utilisation prévue

### Scénario principal

1. Un utilisateur demande à son agent d'exécuter le skill sur le dépôt courant.
2. Le skill affiche son périmètre, ses limites et les données qu'il va lire.
3. L'agent demande confirmation avant toute commande qui installe des dépendances, accède au réseau ou écrit dans le dépôt.
4. Les scripts inspectent le dépôt et produisent un inventaire brut.
5. Le skill demande uniquement les informations produit impossibles à déduire, par exemple le nom commercial ou la politique de support.
6. Les scripts exécutent les contrôles autorisés et collectent les preuves.
7. Le moteur classe chaque contrôle avec un état normalisé.
8. Le renderer génère le pack dans `cra-evidence/` par défaut.
9. L'agent résume les lacunes prioritaires et les limites de l'analyse.

### Réexécution

Une réexécution sur le même commit avec le même environnement doit produire un contenu déterministe, à l'exception des champs explicitement temporels. Une réexécution après modification doit indiquer quelles preuves sont devenues périmées ou ont changé.

## 7. Contrat de portabilité

Le skill ne doit dépendre d'aucune API propriétaire d'agent.

Le plus petit dénominateur commun sera :

- un fichier racine `SKILL.md` décrivant quand et comment utiliser le skill ;
- des commandes Node.js exécutables depuis un shell ;
- des entrées et sorties sur le système de fichiers ;
- des sorties machine en JSON et humaines en Markdown ;
- aucune dépendance à un serveur MCP ;
- aucune hypothèse sur le nom d'un outil agentique particulier ;
- des demandes de confirmation décrites dans le workflow plutôt qu'encodées dans une API d'agent.

Des adaptateurs propres à certains agents pourront être ajoutés plus tard, sans modifier le noyau.

## 8. Structure cible du futur dépôt

```text
cra-evidence-skill/
├── SKILL.md
├── README.md
├── LICENSE
├── SECURITY.md
├── package.json
├── package-lock.json
├── bin/
│   └── cra-evidence.mjs
├── scripts/
│   ├── inspect-repository.mjs
│   ├── collect-evidence.mjs
│   ├── generate-sbom.mjs
│   ├── evaluate-controls.mjs
│   ├── render-pack.mjs
│   └── redact.mjs
├── rules/
│   ├── schema.json
│   ├── cra-node-mvp.json
│   └── sources.json
├── templates/
│   ├── executive-summary.md
│   ├── product-profile.md
│   ├── evidence-index.md
│   ├── gaps.md
│   └── limitations.md
├── schemas/
│   ├── product-profile.schema.json
│   ├── evidence-manifest.schema.json
│   └── assessment.schema.json
├── docs/
│   ├── scope-and-disclaimer.md
│   ├── rule-authoring.md
│   ├── threat-model.md
│   └── examples/
├── test/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── PLAN.md
```

Ne pas créer tous les fichiers dès le premier commit. L'arborescence décrit les frontières finales ; chaque phase ne doit ajouter que les éléments nécessaires.

## 9. Architecture fonctionnelle

### 9.1 Orchestrateur du skill

Responsabilité : guider l'agent et l'utilisateur dans le bon ordre.

Il doit :

- expliquer les limites avant l'analyse ;
- distinguer lecture locale, écriture et accès réseau ;
- demander les confirmations nécessaires ;
- exécuter les scripts dans un ordre défini ;
- ne jamais inventer une preuve manquante ;
- présenter séparément faits observés, informations déclarées et interprétations.

### 9.2 Inspecteur de dépôt

Responsabilité : produire un inventaire factuel sans décider de la conformité.

Données inspectées :

- commit, branche et état Git ;
- `package.json`, lockfile et workspaces ;
- scripts npm disponibles ;
- fichiers de CI ;
- fichiers `README`, `SECURITY`, `LICENSE`, `CHANGELOG` et contribution ;
- configuration de tests et de build ;
- mécanismes de release détectables ;
- configuration Dependabot ou Renovate ;
- signatures, attestations ou provenance visibles ;
- éventuels SBOM et fichiers VEX existants.

### 9.3 Générateur et validateur de SBOM

Responsabilité : obtenir un SBOM CycloneDX JSON reproductible et documenter sa provenance.

Le composant doit :

- préférer un SBOM existant et valide lorsqu'il correspond au commit analysé ;
- sinon utiliser un générateur CycloneDX Node.js épinglé par le lockfile du skill ;
- enregistrer la version de l'outil et du schéma ;
- conserver les erreurs plutôt que produire un SBOM partiel présenté comme complet ;
- distinguer dépendances de production, développement et optionnelles ;
- signaler les dépendances sans version résolue ou provenance claire.

### 9.4 Collecteur de preuves

Responsabilité : convertir une observation ou une commande en enregistrement traçable.

Chaque preuve contient au minimum :

- identifiant stable ;
- type de preuve ;
- source ou chemin ;
- commande exécutée, le cas échéant ;
- commit analysé ;
- horodatage ;
- empreinte du fichier ou de la sortie ;
- résultat ;
- limites ;
- indicateur de sensibilité ;
- statut de redaction.

### 9.5 Moteur de règles

Responsabilité : comparer les preuves aux contrôles techniques versionnés.

États autorisés :

- `verified` : preuve observée et vérification réussie ;
- `declared` : information fournie par l'utilisateur mais non vérifiable automatiquement ;
- `partial` : preuve présente mais incomplète ou de portée insuffisante ;
- `missing` : aucune preuve trouvée ;
- `stale` : preuve ne correspondant pas au commit ou à la version analysée ;
- `not_applicable` : exclusion justifiée et enregistrée ;
- `error` : contrôle impossible à exécuter ;
- `needs_expert_review` : interprétation humaine indispensable.

Le moteur ne doit jamais produire un statut global `compliant` ou `non_compliant`.

Le statut `not_applicable` doit provenir d'une décision humaine documentée. Un contrôle déterministe peut le suggérer, mais ne peut pas l'attribuer seul lorsque la décision dépend d'une interprétation juridique ou du modèle commercial.

### 9.6 Renderer du pack

Responsabilité : transformer les données structurées en dossier lisible et vérifiable.

Il ne contient aucune logique réglementaire. Il affiche uniquement les résultats du moteur, les sources et les limites.

## 10. Sorties du skill

```text
cra-evidence/
├── README.md
├── product-profile.md
├── executive-summary.md
├── evidence-index.md
├── gaps.md
├── limitations.md
├── assessment.json
├── evidence-manifest.json
├── sbom.cdx.json
├── source-register.json
└── raw/
    └── command-results/
```

### Règles de sortie

- `README.md` explique comment le pack a été créé et comment le reproduire.
- `product-profile.md` distingue les faits détectés des déclarations de l'utilisateur.
- `executive-summary.md` ne contient aucune affirmation juridique définitive.
- `evidence-index.md` relie contrôles, preuves et lacunes.
- `gaps.md` priorise les actions sans présenter d'obligation juridique non sourcée.
- `limitations.md` décrit toutes les parties non vérifiées.
- `assessment.json` est la source structurée principale du rendu.
- `evidence-manifest.json` permet de vérifier la fraîcheur et l'intégrité des preuves.
- `source-register.json` enregistre les sources officielles, leur date de consultation et la version des règles.
- `raw/` exclut par défaut les logs pouvant contenir des secrets ; seules les sorties nettoyées y sont écrites.
- Un pack existant n'est jamais écrasé silencieusement : la commande échoue ou crée une exécution explicitement nommée.
- L'écriture est atomique : génération dans un dossier temporaire, validation, puis déplacement vers la destination finale.

## 11. Familles de contrôles du MVP

Les règles précises devront être validées pendant l'implémentation à partir du texte officiel et des orientations en vigueur. Le MVP doit au minimum organiser les preuves selon les familles suivantes :

1. Identification du produit et de la version.
2. Description du périmètre logiciel livré.
3. Inventaire des composants et SBOM.
4. Politique de réception et de traitement des vulnérabilités.
5. Canal de signalement de sécurité.
6. Suivi des vulnérabilités connues dans les dépendances.
7. Tests et contrôles de sécurité observables dans la CI.
8. Procédure de build et reproductibilité documentée.
9. Intégrité, signature ou provenance des releases lorsqu'elles existent.
10. Politique de mises à jour et période de support déclarée.
11. Documentation d'installation et de configuration sécurisée.
12. Journal des changements et traçabilité des versions.
13. Processus d'incident et de divulgation, à faire examiner par un expert.
14. Conservation des preuves et capacité à régénérer le pack.

Une famille de contrôle n'est pas une traduction automatique d'une obligation. Chaque règle doit référencer une source officielle, sa version, son champ d'application et la raison technique de son inclusion.

## 12. Modèle de règle

Chaque règle versionnée doit inclure :

```json
{
  "id": "CRA-NODE-MVP-001",
  "title": "Product version is identifiable",
  "intent": "Establish which delivered product version the evidence pack describes.",
  "sourceIds": ["EU-CRA-2024-2847"],
  "evidenceTypes": ["package_metadata", "git_commit", "release_metadata"],
  "evaluation": "deterministic-check-name",
  "manualReviewWhen": ["repository version differs from delivered product version"],
  "remediationTemplate": "Document the mapping between repository commit, package version and delivered artifact.",
  "introducedIn": "ruleset-version",
  "status": "active"
}
```

Le texte réglementaire complet ne doit pas être copié dans les règles. Utiliser des références précises et un résumé technique original.

## 13. Sources réglementaires et techniques

La première phase d'implémentation doit verrouiller un registre de sources daté. Priorité :

1. Règlement (UE) 2024/2847 sur EUR-Lex.
2. Pages de mise en œuvre, FAQ et orientations de la Commission européenne.
3. Publications ENISA pertinentes aux mécanismes opérationnels.
4. OSPS Baseline de l'OpenSSF, utilisée comme référentiel technique complémentaire et non comme équivalent juridique du CRA.
5. Standards CycloneDX et SPDX pour les SBOM.
6. Documentation officielle npm et GitHub Actions pour les preuves techniques.

Sources de départ :

- Règlement : https://eur-lex.europa.eu/eli/reg/2024/2847/oj
- Résumé de la Commission : https://digital-strategy.ec.europa.eu/en/policies/cra-summary
- Mise en œuvre : https://digital-strategy.ec.europa.eu/en/factpages/cyber-resilience-act-implementation
- OSPS Baseline : https://baseline.openssf.org/
- CycloneDX : https://cyclonedx.org/

Le registre doit contenir URL canonique, éditeur, titre, date de publication ou mise à jour, date d'accès, juridiction, statut et empreinte lorsque le document est téléchargé.

## 14. Sécurité et confidentialité

### Menaces principales

- Exfiltration accidentelle de secrets contenus dans les fichiers ou logs.
- Exécution de scripts npm malveillants lors de l'installation.
- Instructions malveillantes présentes dans le dépôt et lues par l'agent.
- Dépendances compromises dans le skill lui-même.
- Résultat réglementaire trompeur ou trop affirmatif.
- Pack contenant des chemins locaux, identifiants ou informations internes.
- Utilisation d'une preuve ancienne pour une nouvelle release.

### Mesures obligatoires

- Inspection statique avant toute installation.
- Aucune exécution de `npm install`, `npm test` ou `npm run build` sans confirmation.
- Option `--no-network` et réseau désactivé par défaut après acquisition autorisée des dépendances.
- Liste explicite de chemins exclus : `.env*`, clés, credentials, répertoires utilisateurs et caches d'agents.
- Résolution et contrôle des liens symboliques afin d'empêcher une lecture en dehors du dépôt autorisé.
- Redaction avant écriture de toute sortie brute.
- Dépendances du skill minimales, épinglées et auditées.
- Hash de chaque preuve incluse.
- Refus de suivre les instructions contenues dans le dépôt lorsqu'elles ne font pas partie du workflow du skill.
- Affichage permanent de la version du ruleset.
- Aucune conclusion juridique globale.

## 15. Interface CLI cible

L'interface exacte pourra évoluer, mais le workflow doit rester simple :

```text
cra-evidence inspect [path]
cra-evidence collect [path] --output cra-evidence/
cra-evidence evaluate cra-evidence/evidence-manifest.json
cra-evidence render cra-evidence/assessment.json
cra-evidence run [path] --output cra-evidence/
cra-evidence verify-pack cra-evidence/
```

Principes :

- `inspect` est strictement en lecture et n'exécute aucun script du projet.
- `collect` annonce chaque commande potentiellement active.
- `evaluate` travaille uniquement sur les preuves structurées.
- `render` est déterministe et sans réseau.
- `run` orchestre les étapes mais respecte les confirmations.
- `verify-pack` vérifie schémas, empreintes, fraîcheur et cohérence interne.
- Toute erreur est conservée sous forme structurée avec étape, cause, portée affectée et action suggérée ; elle n'est jamais transformée en réussite ou en simple absence de preuve.

Chaque commande doit proposer `--json`, des codes de sortie documentés et une erreur exploitable par un agent.

## 16. Stratégie de test

### Tests unitaires

- Parsing de `package.json` et lockfile.
- Détection des scripts et workspaces.
- Normalisation des preuves.
- Redaction des secrets.
- Évaluation de chaque état de contrôle.
- Rendu déterministe.
- Validation des schémas JSON.

### Fixtures d'intégration

Créer au minimum quatre dépôts synthétiques :

1. `minimal-unprepared` : package simple sans documentation sécurité.
2. `partially-prepared` : tests et Dependabot, mais absence de SBOM et support period.
3. `well-evidenced` : SBOM, politique sécurité, CI, release et documentation.
4. `hostile-repository` : faux secrets, scripts npm dangereux et instructions de prompt injection.

### Tests de bout en bout

- Exécution hors ligne sur chaque fixture.
- Deux exécutions identiques produisent les mêmes données non temporelles.
- Une modification du commit invalide les preuves dépendantes.
- Aucun secret canari n'apparaît dans le pack.
- Une erreur de SBOM reste visible et ne devient jamais un succès partiel silencieux.
- Le skill fonctionne depuis au moins deux agents différents avant la version 0.1.

## 17. Critères d'acceptation du MVP

Le MVP est terminé lorsque :

- un agent compatible peut découvrir et appliquer le `SKILL.md` sans adaptation du noyau ;
- un dépôt Node.js avec lockfile peut être analysé sans réseau ;
- le skill génère un SBOM CycloneDX ou explique précisément pourquoi il ne peut pas le faire ;
- chaque constat du rapport pointe vers une preuve ou porte l'état `declared`, `missing`, `error` ou `needs_expert_review` ;
- le pack contient le commit, le ruleset et les versions des outils ;
- `verify-pack` détecte une preuve modifiée ou périmée ;
- aucun secret canari des fixtures ne se retrouve dans les sorties ;
- les quatre fixtures donnent les résultats attendus ;
- aucune sortie n'utilise les termes « certified », « legally compliant » ou équivalent comme conclusion ;
- la documentation explique les limites et le besoin de revue juridique/sécurité ;
- un pilote PME peut comprendre les cinq lacunes prioritaires sans assistance du mainteneur du skill.

## 18. Plan d'implémentation

### Phase 0 - verrouiller le périmètre réglementaire et les sources

Objectif : empêcher que le code soit construit sur des résumés obsolètes.

- Relire les sources officielles en vigueur au jour de l'implémentation.
- Créer `rules/sources.json` avec métadonnées et dates d'accès.
- Définir une politique de mise à jour du ruleset.
- Faire examiner la terminologie et le disclaimer par une personne compétente.
- Écrire les premières familles de contrôles sans automatisation.

Sortie : registre des sources et règles candidates revues.

### Phase 1 - squelette portable et protocole d'exécution

Objectif : prouver qu'un même skill fonctionne avec plusieurs agents.

- Écrire un `SKILL.md` minimal et indépendant du fournisseur.
- Définir les entrées, sorties, confirmations et erreurs.
- Créer le CLI Node.js avec `inspect` et `--json`.
- Tester manuellement la découverte depuis Claude Code et un second agent.
- Documenter les différences d'intégration sans les introduire dans le noyau.

Sortie : skill exécutable capable d'inventorier un dépôt sans action active.

### Phase 2 - inventaire Node.js déterministe

Objectif : produire un modèle fiable du dépôt.

- Parser package, lockfile, scripts et workspaces.
- Relever les métadonnées Git.
- Détecter CI, sécurité, tests, builds et releases.
- Écrire `product-profile.json` et l'inventaire brut.
- Ajouter fixtures et tests unitaires.

Sortie : inventaire structuré validé par schéma.

### Phase 3 - SBOM et manifeste de preuves

Objectif : produire les deux artefacts techniques fondamentaux.

- Intégrer un générateur CycloneDX épinglé.
- Valider un SBOM existant avant de le réutiliser.
- Enregistrer versions, commandes, hashes et limites.
- Concevoir `evidence-manifest.json`.
- Implémenter la redaction avant persistance.

Sortie : SBOM et preuves structurées vérifiables.

### Phase 4 - moteur de règles

Objectif : transformer les preuves en états explicables.

- Implémenter le schéma des règles.
- Limiter le premier ruleset à environ 12 contrôles à forte valeur.
- Séparer évaluation déterministe et revue humaine.
- Lier chaque résultat aux sources et preuves.
- Tester tous les états possibles.

Sortie : `assessment.json` sans conclusion globale de conformité.

### Phase 5 - génération et vérification du pack

Objectif : créer le livrable utilisable par une PME.

- Générer les documents Markdown à partir des données JSON.
- Produire un résumé exécutif factuel.
- Classer les lacunes par priorité technique et effort estimé.
- Implémenter `verify-pack`.
- Tester la stabilité des sorties et la détection de fraîcheur.

Sortie : dossier `cra-evidence/` complet et reproductible.

### Phase 6 - sécurité adversariale et robustesse

Objectif : rendre l'outil sûr face à un dépôt non fiable.

- Finaliser la fixture hostile.
- Tester secrets, prompt injection, scripts npm et chemins inattendus.
- Vérifier les comportements sans réseau.
- Ajouter limites de taille, durée et quantité de logs.
- Rédiger le threat model et la politique de sécurité.

Sortie : garanties documentées et tests adversariaux automatisés.

### Phase 7 - pilote et version 0.1

Objectif : vérifier la valeur réelle avant d'élargir le périmètre.

- Tester sur trois dépôts Node.js open source représentatifs.
- Conduire un pilote avec une PME volontaire sur un dépôt privé, exécuté localement.
- Recueillir faux positifs, preuves manquantes et incompréhensions.
- Corriger le ruleset et la documentation.
- Publier la version 0.1 avec changelog et règles versionnées.

Sortie : première version publique et retour utilisateur documenté.

## 19. Ordre de priorité

Priorité absolue :

1. Provenance et fraîcheur des preuves.
2. Protection des secrets.
3. Absence de conclusion juridique trompeuse.
4. Déterminisme des contrôles.
5. Portabilité entre agents.
6. Clarté des lacunes.

À reporter après le MVP :

- interface graphique ;
- autres gestionnaires de paquets ;
- VEX avancé ;
- intégration GitHub App ;
- publication automatique d'attestations ;
- plugins sectoriels ;
- SaaS et objets connectés ;
- scoring global.

## 20. Risques projet

### Dérive vers un outil juridique

Réponse : séparer sources, preuves et interprétations ; imposer `needs_expert_review` pour les décisions de périmètre.

### Règles rapidement obsolètes

Réponse : rulesets versionnés, dates d'accès, changelog et refus de mélanger des règles de versions différentes.

### Portabilité théorique seulement

Réponse : tester la version 0.1 depuis au moins deux agents et maintenir un noyau CLI sans dépendance agentique.

### Trop de contrôles pour un MVP

Réponse : limiter le premier ruleset à une douzaine de contrôles techniques bien sourcés.

### Installation dangereuse du projet analysé

Réponse : inspection statique par défaut ; actions actives uniquement après consentement ; envisager le sandboxing dans une phase ultérieure.

### Faux sentiment de sécurité

Réponse : afficher les limites dans chaque sortie, interdire le score de conformité global et faire distinguer preuves vérifiées et déclarations.

## 21. Questions différées

Ces décisions ne doivent pas bloquer le MVP :

- licence définitive du projet ;
- nom public et identité visuelle ;
- support de pnpm et Yarn ;
- format d'attestation cryptographique ;
- adaptateurs propres à Codex, Claude Code ou d'autres agents ;
- export PDF ou DOCX ;
- mapping vers d'autres référentiels comme NIS2 ou ISO 27001 ;
- modèle économique éventuel.

## 22. Première tâche recommandée à Claude Code

Ne pas commencer par générer toute l'arborescence.

Première mission :

1. Relire ce plan.
2. Vérifier les sources officielles et la terminologie à la date de reprise.
3. Proposer un ruleset MVP de 10 à 12 contrôles techniques maximum.
4. Identifier pour chaque contrôle la preuve observable, la limite et le besoin éventuel de revue humaine.
5. Soumettre ce ruleset à validation avant d'écrire le CLI.

Prompt de reprise suggéré :

> Read `PLAN.md` completely. Do not implement yet. Verify the current official CRA sources referenced in the plan, then propose the smallest 10-12 control ruleset for the Node.js MVP. For each control, specify its official source, deterministic evidence, possible statuses, limitations, and when expert review is required. Preserve the product boundary: this tool prepares technical evidence and never claims legal compliance.

## 23. Définition du succès

Le projet réussit si une petite entreprise peut exécuter le skill localement sur une release Node.js et obtenir en moins de quinze minutes un dossier de preuves traçable qui lui montre clairement :

- ce qui a été vérifié ;
- ce qui a seulement été déclaré ;
- ce qui manque ;
- ce qui est périmé ;
- ce qui exige une revue humaine ;
- comment reproduire le pack.

La réussite ne se mesure pas au nombre de contrôles ni à la quantité de texte généré, mais à la qualité, la fraîcheur et l'explicabilité des preuves.
