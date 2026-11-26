"""Ask the local Codex CLI to draw the salon art, several pictures at a time.

    python3 tools/playground/salon-gen.py JOBS.json [--only name1,name2] [--jobs 4] [--force]

JOBS.json: {"style": "...", "edit": "...", "jobs": [{"out": "props/spa-tools.png", "prompt": "...", "input": "master/bust.png", "kind": "sheet|edit|gen"}]}
Pictures land in .salon-art/<out>; a job whose picture exists is skipped unless --force.
"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / '.salon-art'


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        return sys.argv[i + 1]
    return default


def run(job, cfg):
    out = ROOT / job['out']
    out.parent.mkdir(parents=True, exist_ok=True)
    kind = job.get('kind', 'gen')
    parts = ['Use the imagegen skill with the built-in image_gen tool. Produce exactly ONE final image and copy it into the current directory as '
             f'{out.name} (PNG' + (', landscape 3:2, opaque' if kind == 'bg' else ', keep the alpha channel') + '). Do not write any other files or post-process the picture.', '']
    if kind == 'edit':
        parts.append(cfg['edit'])
    elif kind in cfg:
        parts.append(cfg[kind])
    parts += [job['prompt'], '', cfg['style']]
    cmd = ['codex', 'exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', str(out.parent)]
    for i in ([job['input']] if isinstance(job.get('input'), str) else job.get('input', [])):
        cmd.append(f'--image={ROOT / i}')
    cmd += ['--', '\n'.join(parts)]
    with open(str(out) + '.log', 'w') as log:
        subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, cwd=out.parent)
    ok = out.exists()
    print(('ok   ' if ok else 'FAIL ') + job['out'], flush=True)
    return ok


def main():
    cfg = json.loads(Path(sys.argv[1]).read_text())
    only = set(filter(None, (arg('--only') or '').split(',')))
    force = '--force' in sys.argv
    jobs = [j for j in cfg['jobs'] if (not only or Path(j['out']).stem in only or j['out'] in only)]
    if not force:
        jobs = [j for j in jobs if not (ROOT / j['out']).exists()]
    print(f'{len(jobs)} pictures to draw', flush=True)
    with ThreadPoolExecutor(int(arg('--jobs', 4))) as pool:
        results = list(pool.map(lambda j: run(j, cfg), jobs))
    print(f'done: {sum(results)}/{len(results)}')


if __name__ == '__main__':
    main()
