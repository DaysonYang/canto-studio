import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
entries = []
seen = set()
files = []
for kind in ['words', 'chars']:
    name = f'jyut6ping3.{kind}.dict.yaml'
    content = (source / name).read_bytes()
    files.append({'file': name, 'sha256': hashlib.sha256(content).hexdigest()})
    for line in content.decode('utf-8').splitlines():
        fields = line.split('\t')
        if len(fields) < 2:
            continue
        word, reading = fields[:2]
        syllables = reading.split()
        if not re.fullmatch(r'[\u3400-\u9fff\U00020000-\U0003134f]+', word):
            continue
        if len(word) != len(syllables) or not all(re.fullmatch('[a-z]+[1-6]', item) for item in syllables):
            continue
        key = (word, reading)
        if key in seen:
            continue
        seen.add(key)
        entries.append([word, reading, kind])
(root / 'data').mkdir(exist_ok=True)
(root / 'licenses').mkdir(exist_ok=True)
(root / 'data/dictionary.js').write_text('globalThis.CANTO_DATA=' + json.dumps(entries, ensure_ascii=False, separators=(',', ':')) + ';\n')
metadata = {'repository': 'https://github.com/rime/rime-cantonese', 'revision': revision, 'license': 'CC BY 4.0', 'files': files, 'readings': len(entries), 'unique_words': len({item[0] for item in entries}), 'multi_character_readings': sum(len(item[0]) > 1 for item in entries)}
(root / 'data/provenance.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
shutil.copyfile(source / 'LICENSE-CC-BY', root / 'licenses/Rime-CC-BY-4.0.txt')
print(json.dumps(metadata, ensure_ascii=False, indent=2))
