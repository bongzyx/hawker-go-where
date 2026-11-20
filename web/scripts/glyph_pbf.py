"""Minimal reader/writer for MapLibre glyph PBFs (glyphs.proto)."""
def varint(buf, i):
    shift = res = 0
    while True:
        b = buf[i]; i += 1
        res |= (b & 0x7F) << shift; shift += 7
        if not b & 0x80: return res, i

def fields(buf):
    i = 0
    while i < len(buf):
        key, i = varint(buf, i); f, wt = key >> 3, key & 7
        if wt == 0: v, i = varint(buf, i)
        elif wt == 2:
            n, i = varint(buf, i); v = buf[i:i+n]; i += n
        else: raise ValueError(wt)
        yield f, wt, v

def zz(n): return (n >> 1) ^ -(n & 1)

def read(path):
    out = {}
    for f, _, stack in fields(open(path, 'rb').read()):
        for f2, _, v in fields(stack):
            if f2 == 3:
                g = {}
                for f3, wt, x in fields(v): g[f3] = x
                out[g[1]] = dict(w=g.get(3,0), h=g.get(4,0), left=zz(g.get(5,0)), top=zz(g.get(6,0)), adv=g.get(7,0), bitmap=g.get(2,b''))
    return out

def enc_varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F; n >>= 7
        if n: out.append(b | 0x80)
        else: out.append(b); return bytes(out)

def fld(f, wt, payload):
    key = enc_varint((f << 3) | wt)
    if wt == 0: return key + enc_varint(payload)
    return key + enc_varint(len(payload)) + payload

def ezz(n): return (n << 1) ^ (n >> 63) if n >= 0 else ((-n) << 1) - 1

def write(path, name, rng, glyphs):
    stack = fld(1, 2, name.encode()) + fld(2, 2, rng.encode())
    for gid in sorted(glyphs):
        g = glyphs[gid]
        body = fld(1, 0, gid)
        if g['bitmap']: body += fld(2, 2, g['bitmap'])
        body += fld(3, 0, g['w']) + fld(4, 0, g['h']) + fld(5, 0, ezz(g['left'])) + fld(6, 0, ezz(g['top'])) + fld(7, 0, g['adv'])
        stack += fld(3, 2, body)
    open(path, 'wb').write(fld(1, 2, stack))
