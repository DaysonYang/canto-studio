import hashlib
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
provenance = json.loads((root / 'data/corpus-provenance.json').read_text())
clauses = set()
for record in provenance['files']:
    content = (source / 'data/utf8' / record['file']).read_bytes()
    if hashlib.sha256(content).hexdigest() != record['sha256']:
        raise ValueError('Corpus does not match the recorded snapshot')
    for block in re.findall(r'<sent_tag>(.*?)</sent_tag>', content.decode('utf-8'), re.S):
        segment = []
        for line in [*block.splitlines(), '/w//']:
            fields = line.strip().split('/')
            if len(fields) < 3:
                continue
            word, pos, reading = fields[:3]
            if not re.fullmatch(r'[\u3400-\u9fff\U00020000-\U0003134f]+', word):
                if pos == 'w' and 2 <= len(segment) <= 16 and 3 <= sum(len(item[0]) for item in segment) <= 24 and not any(item[2].startswith('nr') for item in segment):
                    clauses.add(tuple(segment))
                segment = []
                continue
            syllables = re.findall(r'[a-z]+[1-6]', reading.lower())
            if len(syllables) != len(word) or ''.join(syllables) != reading.lower():
                segment.append((word, '', pos.lower()))
            else:
                segment.append((word, ' '.join(syllables), pos.lower()))
output = [clause for clause in sorted(clauses) if all(item[1] for item in clause)]
(root / 'data/clauses.js').write_text('globalThis.CANTO_CLAUSES=' + json.dumps(output, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'{len(output)} distinct corpus spans')
