# Reference material

The Regulation ships with the tool so that every citation resolves offline and
can be checked against its source.

| File | What it is |
|---|---|
| `regulation-2024-2847.en.txt` | The Official Journal text of Regulation (EU) 2024/2847, flattened to plain text. |
| `regulation-2024-2847.source.xhtml` | The document as retrieved, before flattening. |
| `loci.json` | 279 indexed provisions: articles, paragraphs, definitions and annex points, each with its verbatim text and its citation form. |
| `SHA256SUMS` | Digests of the three files above. |

## Provenance

Retrieved on 28 August 2026 from the Publications Office of the European Union:

```sh
curl -H 'Accept: application/xhtml+xml' -H 'Accept-Language: eng' \
  http://publications.europa.eu/resource/celex/32024R2847
```

CELEX 32024R2847, ELI <http://data.europa.eu/eli/reg/2024/2847/oj>, published in
OJ L, 2024/2847 on 20 November 2024.

Verify the copy has not changed:

```sh
shasum -a 256 -c SHA256SUMS
```

## Locus format

| Form | Example | Resolves to |
|---|---|---|
| `Art.<n>.<paragraph>` | `Art.13.8` | Article 13(8) |
| `Art.3.def.<slug>` | `Art.3.def.support-period` | The definition of 'support period' |
| `AnnexI.PartI.<n>[.<letter>]` | `AnnexI.PartI.2.c` | Annex I, Part I, point (2)(c) |
| `AnnexI.PartII.<n>` | `AnnexI.PartII.5` | Annex I, Part II, point (5) |
| `AnnexII.<n>[.<letter>]` | `AnnexII.8.a` | Annex II, point 8(a) |
| `AnnexVII.<n>[.<letter>]` | `AnnexVII.2.b` | Annex VII, point 2(b) |

```sh
cra-evidence cite AnnexI.PartII.1
cra-evidence cite Art.14.2 --json
```

## Authenticity

Only the text published in the Official Journal of the European Union is
authentic. This copy is provided for offline citation; it does not replace the
official source. Reuse is authorised under Commission Decision 2011/833/EU,
source acknowledged. See `../NOTICE`.
