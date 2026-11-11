import collections
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
counts = collections.Counter()
poses = collections.defaultdict(collections.Counter)
readings = collections.defaultdict(collections.Counter)
pairs = collections.defaultdict(collections.Counter)
bigrams = collections.defaultdict(collections.Counter)
files = []
utterances = 0
for path in sorted((source / 'data/utf8').iterdir()):
    if not path.is_file():
        continue
    content = path.read_bytes()
    files.append({'file': path.name, 'sha256': hashlib.sha256(content).hexdigest()})
    for block in re.findall(r'<sent_tag>(.*?)</sent_tag>', content.decode('utf-8'), re.S):
        utterances += 1
        window = []
        previous_word = None
        for line in block.splitlines():
            fields = line.strip().split('/')
            if len(fields) < 3:
                continue
            word, pos, reading = fields[:3]
            if not re.fullmatch(r'[\u3400-\u9fff\U00020000-\U0003134f]+', word):
                window = []
                previous_word = None
                continue
            counts[word] += 1
            if previous_word is not None:
                bigrams[previous_word][word] += 1
            previous_word = word
            poses[word][pos.lower()] += 1
            syllables = re.findall(r'[a-z]+[1-6]', reading.lower())
            if len(syllables) == len(word) and ''.join(syllables) == reading.lower():
                readings[word][' '.join(syllables)] += 1
            if pos.lower().startswith(('n', 'v', 'a', 't', 's', 'i', 'l', 'z')):
                for previous in window[-4:]:
                    if previous != word:
                        pairs[word][previous] += 1
                        pairs[previous][word] += 1
                window.append(word)
row_totals = {word: sum(values.values()) for word, values in pairs.items()}
total_pairs = sum(row_totals.values())
stats = {}
for word, count in counts.items():
    vector = []
    if count >= 3:
        for neighbor, observed in pairs[word].items():
            if observed < 2 or counts[neighbor] < 3:
                continue
            ppmi = math.log2(observed * total_pairs / (row_totals[word] * row_totals[neighbor]))
            if ppmi > 0:
                vector.append([neighbor, round(ppmi, 4)])
    vector.sort(key=lambda item: (-item[1], item[0]))
    stats[word] = [count, poses[word].most_common(1)[0][0], dict(readings[word]), vector[:24], dict(poses[word])]
metadata = {'name': 'HKCanCor', 'authors': 'K. K. Luke and May L. Y. Wong', 'citation': 'Luke & Wong (2015), The Hong Kong Cantonese Corpus: Design and Uses', 'repository': 'https://github.com/fcbond/hkcancor', 'revision': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(), 'license': 'CC BY 4.0', 'files': files, 'tokens': sum(counts.values()), 'word_types': len(counts), 'utterances': utterances, 'method': 'Han tokens only; original segmentation; word and exact-reading counts; adjacent-word counts without crossing punctuation; previous 4 content-token window; symmetric positive PMI; pair count>=2, word count>=3; top24 contexts. Frequencies are corpus counts, not population estimates.'}
(root / 'data/corpus.js').write_text('globalThis.CANTO_CORPUS=' + json.dumps({'meta': {key: value for key, value in metadata.items() if key != 'files'}, 'words': stats, 'bigrams': {word: dict(values) for word, values in bigrams.items()}}, ensure_ascii=False, separators=(',', ':')) + ';\n')
(root / 'data/corpus-provenance.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
shutil.copyfile(source / 'data/LICENSE', root / 'licenses/HKCanCor-CC-BY-4.0.txt')
print(json.dumps({key: value for key, value in metadata.items() if key != 'files'}, ensure_ascii=False, indent=2))
