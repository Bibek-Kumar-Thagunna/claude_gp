#!/usr/bin/env python3
"""Structural checks for apps/api/src that don't need node_modules.

  1. every relative import resolves to a real .ts file
  2. no chunk-authoring placeholders survived
  3. every @Module's referenced classes are imported in that file
  4. controllers referenced by a module actually exist
"""
import re
import sys
from pathlib import Path

ROOT = Path("/sessions/awesome-jolly-feynman/mnt/claude_gp/gopasal/apps/api/src")
files = sorted(ROOT.rglob("*.ts"))
errors: list[str] = []

IMPORT_RE = re.compile(r"""^\s*import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]""", re.M)
PLACEHOLDER_RE = re.compile(r"/\*\s*GP_[A-Z0-9_]+\s*\*/")

for f in files:
    text = f.read_text()
    rel = f.relative_to(ROOT)

    for m in PLACEHOLDER_RE.finditer(text):
        line = text[: m.start()].count("\n") + 1
        errors.append(f"{rel}:{line}  unresolved placeholder {m.group(0)}")

    for m in IMPORT_RE.finditer(text):
        spec = m.group(1)
        if not spec.startswith("."):
            continue
        target = (f.parent / spec).resolve()
        candidates = [
            target.with_suffix(".ts"),
            Path(str(target) + ".ts"),
            target / "index.ts",
        ]
        if not any(c.exists() for c in candidates):
            line = text[: m.start()].count("\n") + 1
            errors.append(f"{rel}:{line}  unresolved import '{spec}'")

# identifiers used inside @Module({...}) must be imported/declared in the file
MODULE_BLOCK = re.compile(r"@Module\(\{([\s\S]*?)\}\)\s*export class", re.M)
for f in files:
    if not f.name.endswith(".module.ts"):
        continue
    text = f.read_text()
    rel = f.relative_to(ROOT)
    imported = set()
    for m in re.finditer(r"import\s+(?:type\s+)?\{([^}]*)\}\s+from", text):
        for part in m.group(1).split(","):
            name = part.strip().split(" as ")[-1].strip()
            if name:
                imported.add(name)
    for m in re.finditer(r"import\s+(\w+)\s+from", text):
        imported.add(m.group(1))
    imported |= set(re.findall(r"(?:class|const|function)\s+(\w+)", text))

    for block in MODULE_BLOCK.finditer(text):
        body = block.group(1)
        # strip comments and string literals before harvesting identifiers
        body = re.sub(r"//.*", "", body)
        body = re.sub(r"/\*[\s\S]*?\*/", "", body)
        body = re.sub(r"'[^']*'|\"[^\"]*\"", "''", body)
        for ident in set(re.findall(r"\b([A-Z]\w+)\b", body)):
            if ident in {"APP_GUARD", "APP_FILTER", "APP_INTERCEPTOR", "APP_PIPE"}:
                continue
            if ident not in imported:
                errors.append(f"{rel}  @Module references '{ident}' but never imports it")

print(f"checked {len(files)} TypeScript files under apps/api/src")
if errors:
    print(f"\n{len(errors)} problem(s):")
    for e in errors:
        print("  -", e)
    sys.exit(1)
print("no unresolved imports, placeholders or module wiring gaps")
