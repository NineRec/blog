"""Original gentle animal-inspired effects, not wildlife field recordings.

The real licensed elephant/lion/giraffe/zebra/bear/duck recordings are preserved.
These effects accompany new zoo animals and are explicitly credited as crafted.
"""
from pathlib import Path
import array,math,random,wave
ROOT=Path(__file__).resolve().parents[1]/'static/butterfly-adventure/audio'
EFFECTS={'hippo':(105,'grunt'),'rhino':(95,'snort'),'otter':(780,'chirp'),'panda':(160,'grunt'),'kangaroo':(185,'snort'),'penguin':(620,'chirp'),'crocodile':(85,'grunt'),'flamingo':(540,'chirp'),'gorilla':(110,'grunt'),'fox':(430,'bark'),'deer':(370,'bleat'),'rabbit':(720,'sniff'),'horse':(470,'neigh'),'cow':(145,'moo')}
RATE=24000
for name,(frequency,kind) in EFFECTS.items():
    samples=array.array('h');noise=random.Random(name);phase=0
    duration=2.5
    for index in range(int(RATE*duration)):
        t=index/RATE;local=t%1.2
        width=.85 if kind in ['grunt','moo','neigh','bleat'] else .43
        envelope=math.sin(math.pi*local/width)**2 if local<width else 0
        modulation=1+.09*math.sin(t*32) if kind in ['bleat','neigh'] else 1
        pitch=frequency*modulation*(1+.12*math.sin(t*5))
        phase+=2*math.pi*pitch/RATE
        tone=(math.sin(phase)+.35*math.sin(2*phase)+.18*math.sin(3*phase))*.55
        if kind in ['snort','sniff']:tone=.5*noise.uniform(-1,1)+tone*.3
        value=.32*envelope*tone
        samples.append(int(value*32767))
    with wave.open(str(ROOT/f'{name}-call.wav'),'w') as out:
        out.setparams((1,2,RATE,0,'NONE','not compressed'));out.writeframes(samples.tobytes())
    print(name,kind,flush=True)
