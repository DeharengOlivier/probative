# Coverage

Generated from `rules/cra-node-mvp-1.0.0.json` and
`reference/loci.json`. Do not edit by hand; run `npm run docs`.

This tool prepares technical evidence. It does not assess conformity and states
no legal conclusion about compliance with Regulation (EU) 2024/2847.

A provision marked **not covered** is one this ruleset says nothing about. That
is not a statement that it does not apply to your product.

## Annex I, Part II - vulnerability handling requirements

This is where a repository can genuinely carry evidence, and where most of the ruleset sits.

| Provision | Requirement | Controls |
| --- | --- | --- |
| Annex I, Part II, point (1) | identify and document vulnerabilities and components contained in products with digital elements, including by drawing up a software bill of materi... | CRA-NODE-010, CRA-NODE-011, CRA-NODE-012 |
| Annex I, Part II, point (2) | in relation to the risks posed to products with digital elements, address and remediate vulnerabilities without delay, including by providing secur... | CRA-NODE-012, CRA-NODE-024 |
| Annex I, Part II, point (3) | apply effective and regular tests and reviews of the security of the product with digital elements; | CRA-NODE-030 |
| Annex I, Part II, point (4) | once a security update has been made available, share and publicly disclose information about fixed vulnerabilities, including a description of the... | CRA-NODE-022 |
| Annex I, Part II, point (5) | put in place and enforce a policy on coordinated vulnerability disclosure; | CRA-NODE-020 |
| Annex I, Part II, point (6) | take measures to facilitate the sharing of information about potential vulnerabilities in their product with digital elements as well as in third-p... | CRA-NODE-021 |
| Annex I, Part II, point (7) | provide for mechanisms to securely distribute updates for products with digital elements to ensure that vulnerabilities are fixed or mitigated in a... | CRA-NODE-023 |
| Annex I, Part II, point (8) | ensure that, where security updates are available to address identified security issues, they are disseminated without delay and, unless otherwise ... | CRA-NODE-024 |

## Annex I, Part I - product security properties

**Almost none of this is observable in a repository.** Part I follows from the cybersecurity risk assessment required by Article 13(2) and (3), which states whether and how each point applies. The ruleset therefore records whether an assessment exists (CRA-NODE-060) and whether exclusions are justified as Article 13(4) requires (CRA-NODE-061). It does not, and should not, claim to evidence the properties themselves.

| Provision | Requirement | Controls |
| --- | --- | --- |
| Annex I, Part I, point (1) | Products with digital elements shall be designed, developed and produced in such a way that they ensure an appropriate level of cybersecurity based... | **not covered** |
| Annex I, Part I, point (2) | On the basis of the cybersecurity risk assessment referred to in Article 13(2) and where applicable, products with digital elements shall: | **not covered** |
| Annex I, Part I, point (2)(a) | be made available on the market without known exploitable vulnerabilities; | **not covered** |
| Annex I, Part I, point (2)(b) | be made available on the market with a secure by default configuration, unless otherwise agreed between manufacturer and business user in relation ... | **not covered** |
| Annex I, Part I, point (2)(c) | ensure that vulnerabilities can be addressed through security updates, including, where applicable, through automatic security updates that are ins... | **not covered** |
| Annex I, Part I, point (2)(d) | ensure protection from unauthorised access by appropriate control mechanisms, including but not limited to authentication, identity or access manag... | **not covered** |
| Annex I, Part I, point (2)(e) | protect the confidentiality of stored, transmitted or otherwise processed data, personal or other, such as by encrypting relevant data at rest or i... | **not covered** |
| Annex I, Part I, point (2)(f) | protect the integrity of stored, transmitted or otherwise processed data, personal or other, commands, programs and configuration against any manip... | **not covered** |
| Annex I, Part I, point (2)(g) | process only data, personal or other, that are adequate, relevant and limited to what is necessary in relation to the intended purpose of the produ... | **not covered** |
| Annex I, Part I, point (2)(h) | protect the availability of essential and basic functions, also after an incident, including through resilience and mitigation measures against den... | **not covered** |
| Annex I, Part I, point (2)(i) | minimise the negative impact by the products themselves or connected devices on the availability of services provided by other devices or networks; | **not covered** |
| Annex I, Part I, point (2)(j) | be designed, developed and produced to limit attack surfaces, including external interfaces; | **not covered** |
| Annex I, Part I, point (2)(k) | be designed, developed and produced to reduce the impact of an incident using appropriate exploitation mitigation mechanisms and techniques; | **not covered** |
| Annex I, Part I, point (2)(l) | provide security related information by recording and monitoring relevant internal activity, including the access to or modification of data, servi... | **not covered** |
| Annex I, Part I, point (2)(m) | provide the possibility for users to securely and easily remove on a permanent basis all data and settings and, where such data can be transferred ... | **not covered** |

## Annex II - information and instructions to the user

Checked point by point by CRA-NODE-050, against declarations and detected documents rather than against what accompanies the delivered product.

| Provision | Requirement | Controls |
| --- | --- | --- |
| Annex II, point 1 | the name, registered trade name or registered trademark of the manufacturer, and the postal address, the email address or other digital contact as ... | CRA-NODE-003, CRA-NODE-050 |
| Annex II, point 2 | the single point of contact where information about vulnerabilities of the product with digital elements can be reported and received, and where th... | CRA-NODE-003, CRA-NODE-020, CRA-NODE-021, CRA-NODE-050 |
| Annex II, point 3 | name and type and any additional information enabling the unique identification of the product with digital elements; | CRA-NODE-001, CRA-NODE-050 |
| Annex II, point 4 | the intended purpose of the product with digital elements, including the security environment provided by the manufacturer, as well as the product’... | CRA-NODE-002, CRA-NODE-050 |
| Annex II, point 5 | any known or foreseeable circumstance, related to the use of the product with digital elements in accordance with its intended purpose or under con... | CRA-NODE-002, CRA-NODE-050 |
| Annex II, point 6 | where applicable, the internet address at which the EU declaration of conformity can be accessed; | CRA-NODE-050, CRA-NODE-070 |
| Annex II, point 7 | the type of technical security support offered by the manufacturer and the end-date of the support period during which users can expect vulnerabili... | CRA-NODE-040, CRA-NODE-050 |
| Annex II, point 8 | detailed instructions or an internet address referring to such detailed instructions and information on: | CRA-NODE-050, CRA-NODE-051 |
| Annex II, point 9 | If the manufacturer decides to make available the software bill of materials to the user, information on where the software bill of materials can b... | CRA-NODE-050 |

## Annex VII - content of the technical documentation

The structure of the evidence pack follows this Annex, because it is the structure Article 31 makes a market surveillance authority ask for.

| Provision | Requirement | Controls |
| --- | --- | --- |
| Annex VII, point 1 | a general description of the product with digital elements, including: | CRA-NODE-001, CRA-NODE-002, CRA-NODE-050 |
| Annex VII, point 2 | a description of the design, development and production of the product with digital elements and vulnerability handling processes, including: | CRA-NODE-010, CRA-NODE-020, CRA-NODE-023 |
| Annex VII, point 3 | an assessment of the cybersecurity risks against which the product with digital elements is designed, developed, produced, delivered and maintained... | CRA-NODE-060 |
| Annex VII, point 4 | relevant information that was taken into account to determine the support period pursuant to Article 13(8) of the product with digital elements; | CRA-NODE-042 |
| Annex VII, point 5 | a list of the harmonised standards applied in full or in part the references of which have been published in the Official Journal of the European U... | CRA-NODE-070 |
| Annex VII, point 6 | reports of the tests carried out to verify the conformity of the product with digital elements and of the vulnerability handling processes with the... | CRA-NODE-030 |
| Annex VII, point 7 | a copy of the EU declaration of conformity; | CRA-NODE-070 |
| Annex VII, point 8 | where applicable, the software bill of materials, further to a reasoned request from a market surveillance authority provided that it is necessary ... | CRA-NODE-010 |

## Controls

| Control | Priority | Family | Cites |
| --- | --- | --- | --- |
| CRA-NODE-001 | P1 | product-identification | AnnexVII.1.b, AnnexII.3, Art.13.15 |
| CRA-NODE-002 | P1 | product-identification | AnnexVII.1.a, AnnexII.4, AnnexII.5 |
| CRA-NODE-003 | P1 | product-identification | AnnexII.1, AnnexII.2, Art.13.16, Art.13.17 |
| CRA-NODE-004 | P0 | product-identification | Art.3.def.manufacturer, Art.3.def.open-source-software-steward, AnnexIII, AnnexIV, Art.32.1 |
| CRA-NODE-010 | P0 | components-and-sbom | AnnexI.PartII.1, AnnexVII.2.b, AnnexVII.8 |
| CRA-NODE-011 | P2 | components-and-sbom | AnnexI.PartII.1, Art.13.5 |
| CRA-NODE-012 | P1 | components-and-sbom | AnnexI.PartII.1, AnnexI.PartII.2, Art.13.6 |
| CRA-NODE-020 | P0 | vulnerability-handling | AnnexI.PartII.5, AnnexVII.2.b, AnnexII.2 |
| CRA-NODE-021 | P0 | vulnerability-handling | AnnexI.PartII.6, AnnexII.2, Art.13.17 |
| CRA-NODE-022 | P1 | vulnerability-handling | AnnexI.PartII.4 |
| CRA-NODE-023 | P1 | vulnerability-handling | AnnexI.PartII.7, AnnexVII.2.b |
| CRA-NODE-024 | P2 | vulnerability-handling | AnnexI.PartII.2, AnnexI.PartII.8 |
| CRA-NODE-030 | P1 | security-testing | AnnexI.PartII.3, AnnexVII.6 |
| CRA-NODE-040 | P0 | support-period | Art.13.19, AnnexII.7 |
| CRA-NODE-041 | P0 | support-period | Art.13.8, Art.3.def.support-period |
| CRA-NODE-042 | P1 | support-period | AnnexVII.4, Art.13.8 |
| CRA-NODE-043 | P1 | support-period | Art.13.9 |
| CRA-NODE-050 | P0 | user-information | AnnexII.1, AnnexII.2, AnnexII.3, AnnexII.4, AnnexII.5, AnnexII.6, AnnexII.7, AnnexII.8, AnnexII.9, AnnexVII.1.d, Art.13.18 |
| CRA-NODE-051 | P1 | user-information | AnnexII.8.a, AnnexII.8.c, AnnexII.8.d |
| CRA-NODE-060 | P0 | risk-and-documentation | Art.13.2, Art.13.3, Art.13.4, AnnexVII.3 |
| CRA-NODE-061 | P1 | risk-and-documentation | Art.13.4 |
| CRA-NODE-062 | P1 | risk-and-documentation | Art.31.1, Art.31.2, Art.13.13 |
| CRA-NODE-070 | P1 | conformity | Art.32.1, Art.28.1, AnnexV.1, AnnexVII.5, AnnexII.6, AnnexVII.7 |
| CRA-NODE-080 | P0 | incident-reporting | Art.14.1, Art.14.2, Art.14.3, Art.16.1 |

## Numbers

- 24 controls across 9 families.
- 57 distinct provisions cited.
- 282 provisions indexed and citable offline with `probative cite`.
- 8 of 8 Annex I, Part II points covered.
- 8 of 8 Annex VII points covered.
