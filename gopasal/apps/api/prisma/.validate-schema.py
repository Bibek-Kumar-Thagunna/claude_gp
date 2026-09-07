#!/usr/bin/env python3
"""Structural sanity check for schema.prisma.

`prisma validate` needs the npm registry, which this environment cannot reach.
This covers the failure modes that actually bite when hand-editing the schema:
unknown field types, relations that only exist on one side, and named relations
whose two ends do not pair up.
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

SRC = Path(__file__).with_name("schema.prisma")
text = SRC.read_text()

SCALARS = {
    "String", "Boolean", "Int", "BigInt", "Float", "Decimal", "DateTime",
    "Json", "Bytes", "Unsupported",
}

models: dict[str, list[tuple[int, str]]] = {}
enums: set[str] = set()

current = None
kind = None
for lineno, raw in enumerate(text.splitlines(), 1):
    line = raw.strip()
    m = re.match(r"^(model|enum|type|view)\s+(\w+)\s*\{", line)
    if m:
        kind, current = m.group(1), m.group(2)
        if kind == "enum":
            enums.add(current)
        else:
            models[current] = []
        continue
    if line == "}":
        current, kind = None, None
        continue
    if current and kind in {"model", "view"}:
        models[current].append((lineno, line))

errors: list[str] = []
# named relation -> list of (model, field, target)
named: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
# (owner model, target model) pairs seen
edges: set[tuple[str, str]] = set()

FIELD = re.compile(r"^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$")

for model, lines in models.items():
    for lineno, line in lines:
        if not line or line.startswith(("//", "///", "@@", "@")):
            continue
        m = FIELD.match(line)
        if not m:
            errors.append(f"{SRC.name}:{lineno}  unparsed field in {model}: {line}")
            continue
        field, ftype, is_list, is_opt, rest = m.groups()
        if ftype in SCALARS or ftype in enums:
            continue
        if ftype not in models:
            errors.append(
                f"{SRC.name}:{lineno}  {model}.{field} has unknown type '{ftype}'"
            )
            continue
        edges.add((model, ftype))
        rel = re.search(r'@relation\(\s*"([^"]+)"', rest)
        if rel:
            named[rel.group(1)].append((model, field, ftype))

# every named relation must have exactly two ends, pointing at each other
for name, ends in named.items():
    if len(ends) != 2:
        detail = ", ".join(f"{m}.{f}" for m, f, _ in ends)
        errors.append(
            f'relation "{name}" has {len(ends)} end(s) ({detail}); Prisma requires exactly 2'
        )
        continue
    (m1, f1, t1), (m2, f2, t2) = ends
    if t1 != m2 or t2 != m1:
        errors.append(
            f'relation "{name}" ends do not pair: {m1}.{f1} -> {t1} vs {m2}.{f2} -> {t2}'
        )

# unnamed relations still need a back-reference on the other model
for a, b in sorted(edges):
    if a == b:
        continue  # self-relations are checked by the named-relation rule
    if (b, a) not in edges:
        errors.append(f"{a} references {b}, but {b} has no back-relation to {a}")

# every relation field with fields:/references: needs its scalar to exist
for model, lines in models.items():
    declared = {m.group(1) for _, l in lines if (m := FIELD.match(l))}
    for lineno, line in lines:
        fk = re.search(r"fields:\s*\[([^\]]+)\]", line)
        if not fk:
            continue
        for name in (s.strip() for s in fk.group(1).split(",")):
            if name and name not in declared:
                errors.append(
                    f"{SRC.name}:{lineno}  {model} @relation(fields: [{name}]) has no such field"
                )

print(f"models: {len(models)}   enums: {len(enums)}   relation edges: {len(edges)}")
if errors:
    print(f"\n{len(errors)} problem(s):")
    for e in errors:
        print("  -", e)
    sys.exit(1)
print("schema is structurally consistent")
