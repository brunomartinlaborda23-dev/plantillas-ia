"""Crea subtitulos.js: subtítulos palabra a palabra sincronizados con narracion.wav.

Uso:  python3 subtitulos.py          (necesita: pip install faster-whisper)

Whisper solo se usa para saber CUÁNDO suena cada palabra; el texto que se
muestra es siempre el del guion (narrar.py), así no aparecen errores de
transcripción. Las palabras que Whisper no reconoce se colocan interpolando.
"""
import ast, difflib, json, os, re, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
MAX_PALABRAS = 3          # palabras por bloque en pantalla


def guion():
    arbol = ast.parse(open(os.path.join(AQUI, "narrar.py"), encoding="utf-8").read())
    for nodo in arbol.body:
        if isinstance(nodo, ast.Assign) and getattr(nodo.targets[0], "id", "") == "GUION":
            return [t for _, t, _ in ast.literal_eval(nodo.value) if t]


def norm(p):
    p = unicodedata.normalize("NFD", p.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in p if unicodedata.category(c) != "Mn"))


def main():
    from faster_whisper import WhisperModel
    frases = guion()
    # palabras del guion, marcando fin de frase / coma para cortar bloques
    script = []
    for f in frases:
        for w in f.replace("...", "… ").split():
            script.append({"w": w, "corte": bool(re.search(r"[.?!:,…]$", w))})
    script = [s for s in script if norm(s["w"])]

    m = WhisperModel("small", device="cpu", compute_type="int8")
    seg, _ = m.transcribe(os.path.join(AQUI, "narracion.wav"), language="es",
                          word_timestamps=True, initial_prompt=" ".join(frases))
    whisper = [w for s in seg for w in s.words]

    a = [norm(s["w"]) for s in script]
    b = [norm(w.word) for w in whisper]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            script[blk.a + k]["t"] = whisper[blk.b + k].start
            script[blk.a + k]["e"] = whisper[blk.b + k].end
    # interpolar las que faltan según su longitud
    i = 0
    while i < len(script):
        if "t" in script[i]:
            i += 1; continue
        j = i
        while j < len(script) and "t" not in script[j]:
            j += 1
        t0 = script[i - 1]["e"] if i > 0 else 0.3
        t1 = script[j]["t"] if j < len(script) else t0 + 0.35 * (j - i)
        largos = [len(script[k]["w"]) + 2 for k in range(i, j)]
        tot, acc = sum(largos), 0
        for k in range(i, j):
            script[k]["t"] = t0 + (t1 - t0) * acc / tot
            acc += largos[k - i]
            script[k]["e"] = t0 + (t1 - t0) * acc / tot
        i = j
    hechas = sum(1 for blk in sm.get_matching_blocks() for _ in range(blk.size))
    print(f"{hechas}/{len(script)} palabras sincronizadas con Whisper, el resto interpoladas")

    # agrupar en bloques cortos
    grupos, cur = [], []
    for s in script:
        cur.append(s)
        if s["corte"] or len(cur) == MAX_PALABRAS:
            grupos.append(cur); cur = []
    if cur:
        grupos.append(cur)
    subs = []
    for n, g in enumerate(grupos):
        fin = g[-1]["e"] + 0.35
        if n + 1 < len(grupos):
            fin = min(fin, grupos[n + 1][0]["t"])
        subs.append({"t": round(g[0]["t"], 3), "e": round(max(fin, g[-1]["e"]), 3),
                     "w": [{"w": s["w"].rstrip(",:"), "t": round(s["t"], 3)} for s in g]})
    with open(os.path.join(AQUI, "subtitulos.js"), "w", encoding="utf-8") as fh:
        fh.write("// Generado por subtitulos.py\nwindow.SUBS = " + json.dumps(subs, ensure_ascii=False) + ";\n")
    print(f"Listo: subtitulos.js ({len(subs)} bloques)")


if __name__ == "__main__":
    main()
