import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
tables = {}
files = []
for name in ['TSCharacters', 'TSPhrases', 'STCharacters', 'STPhrases']:
    content = (source / 'data/dictionary' / (name + '.txt')).read_bytes()
    table = {}
    for line in content.decode('utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        key, values = line.split('\t', 1)
        value = values.split()[0]
        if len(key) == len(value):
            table[key] = value
    tables[name] = table
    files.append({'file': name + '.txt', 'sha256': hashlib.sha256(content).hexdigest()})
(root / 'data/variants.js').write_text('globalThis.CANTO_VARIANTS=' + json.dumps(tables, ensure_ascii=False, separators=(',', ':')) + ';\n')
shutil.copyfile(source / 'LICENSE', root / 'licenses/OpenCC-Apache-2.0.txt')
shutil.copyfile(source / 'AUTHORS', root / 'licenses/OpenCC-AUTHORS.txt')
metadata = {'repository': 'https://github.com/BYVoid/OpenCC', 'revision': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(), 'license': 'Apache-2.0', 'changes': 'First candidate, equal-length conversions only; JSON/JS packaging.', 'files': files}
(root / 'data/variants-provenance.json').write_text(json.dumps(metadata, indent=2) + '\n')
