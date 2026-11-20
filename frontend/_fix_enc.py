from pathlib import Path

root = Path("frontend/src")
count = 0
for p in list(root.rglob("*.tsx")) + list(root.rglob("*.ts")):
    data = p.read_bytes()
    text = None
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except Exception:
            pass
    if text is None:
        continue
    orig = text
    for ch in ["\u2014", "\u2013", "\ufffd"]:
        text = text.replace(ch, "-")
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    if text != orig:
        p.write_text(text, encoding="utf-8")
        count += 1
        print(p)
print("updated", count)
