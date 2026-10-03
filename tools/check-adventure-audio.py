"""Verify bundled audio integrity; optionally transcribe with local MLX Whisper.

Use .voice-lab/.venv/bin/python tools/check-adventure-audio.py --transcribe.
The ASR comparison normalizes numbers, spaces and the peas/peace homophone.
It checks words, not subjective voice age or expression.
"""
import argparse,array,difflib,hashlib,json,math,os,re,subprocess,tempfile,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME',str(ROOT/'.voice-lab/cache/huggingface'))
AUDIO=ROOT/'static/butterfly-adventure/audio'
def normalized(text):
    replacements={'zoey':'zoe','peace':'peas','0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine','10':'ten','12':'twelve','15':'fifteen','16':'sixteen','18':'eighteen','20':'twenty','21':'twentyone'}
    chinese=any('\u4e00'<=c<='\u9fff' for c in text)
    if chinese:replacements.update({str(i):c for i,c in enumerate('零一二三四五六七八九')})
    return ''.join(replacements.get(w,w) for w in re.findall(r'[a-z0-9]+|[\u4e00-\u9fff]',text.lower()))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--transcribe',action='store_true');parser.add_argument('--report',default=str(ROOT/'tools/voice/production-qa.json'));args=parser.parse_args()
    lines=json.loads((AUDIO/'narration.json').read_text());info=json.loads((AUDIO/'recording-info.json').read_text());profile=json.loads((ROOT/'tools/voice/zoey-curious.json').read_text())
    assert info['voice']=='Zoey / 03-curious' and info['reference_sha256']==profile['reference_sha256']
    assert set(lines)==set(info['recordings'])
    report=[]
    report_path=Path(args.report)
    previous={row['key']:row for row in json.loads(report_path.read_text()).get('clips',[])} if report_path.exists() else {}
    with tempfile.TemporaryDirectory() as temp:
        for key,text in lines.items():
            clip=AUDIO/f'{key}.m4a';digest=hashlib.sha256(clip.read_bytes()).hexdigest();assert digest==info['recordings'][key]['sha256'],key
            out=Path(temp)/'decoded.wav';subprocess.run(['afconvert',str(clip),str(out),'-f','WAVE','-d','LEI16@16000','-c','1'],check=True)
            with wave.open(str(out)) as f:
                frames=array.array('h',f.readframes(f.getnframes()));seconds=len(frames)/f.getframerate()
            rms=math.sqrt(sum(n*n for n in frames)/len(frames))/32768;assert seconds>.25 and rms>.001,key
            row={'key':key,'sha256':digest,'duration_seconds':round(seconds,3),'rms':round(rms,4)}
            cached=previous.get(key,{})
            current=cached.get('sha256')==digest and cached.get('expected')==text and 'similarity' in cached
            if current:
                row.update({field:cached[field] for field in ('expected','transcribed','similarity') if field in cached})
            if args.transcribe and not current:
                import numpy as np,mlx_whisper
                samples=np.asarray(frames,dtype=np.float32)/32768;samples=samples[:int(info['recordings'][key]['speech_seconds']*16000)]
                chinese=any('\u4e00'<=c<='\u9fff' for c in text)
                actual=mlx_whisper.transcribe(samples,path_or_hf_repo='mlx-community/whisper-small-mlx' if chinese else 'mlx-community/whisper-small.en-mlx',language='zh' if chinese else 'en',initial_prompt='请使用简体中文。' if chinese else None,condition_on_previous_text=False,verbose=False)['text'].strip()
                score=difflib.SequenceMatcher(None,normalized(text),normalized(actual)).ratio();row.update(expected=text,transcribed=actual,similarity=round(score,3));print(key,round(score,2),actual,flush=True)
            report.append(row)
    report_path.write_text(json.dumps({'voice':info['voice'],'reference_sha256':info['reference_sha256'],'clips':report},indent=2)+'\n')
    low=[r for r in report if r.get('similarity',1)<.85]
    if low:print('Review transcript differences:',json.dumps(low,indent=2));raise SystemExit(1)
    print(f'PASS {len(report)} Zoey clips: checksums, decoded waveforms'+(', transcript comparison' if args.transcribe else ''),flush=True)
if __name__=='__main__':main()
