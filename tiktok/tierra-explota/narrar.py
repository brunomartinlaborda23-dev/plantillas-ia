"""Genera la narración (voz masculina) y la línea de tiempo del vídeo.

Uso:  python3 narrar.py CARPETA_KOKORO          voz sintética Kokoro (em_alex)
      python3 narrar.py --clon MI_VOZ.wav       TU voz clonada (Chatterbox Multilingual)
Salida: narracion.wav  +  timeline.js (la animación se adapta al ritmo de la voz)

La voz NUNCA se acelera: cada frase se lee a su ritmo natural, con pausas
de lectura entre frases, y es la animación la que se estira o encoge un poco
para que cada texto aparezca justo cuando la voz lo dice.
Kokoro:  pip install kokoro-onnx soundfile
Clon:    pip install chatterbox-tts   (descarga el modelo de Hugging Face; va en CPU)
         La grabación de referencia: 10-30 s de tu voz, limpia, hablando con naturalidad.
"""
import json, os, subprocess, sys, tempfile, wave
import soundfile as sf

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

VOZ = "em_alex"
VELOCIDAD = 1.0

ANIM_DUR = 66          # duración original de la animación (index.html)
LEAD = 0.12            # el texto aparece un pelín antes que la voz
MIN_RATIO = 0.8        # la animación nunca va a más de 1/0.8 = 1.25x
PAUSA_FRASE = 0.32     # pausa entre frases de la misma escena
PAUSA_ESCENA = 0.6     # pausa al cambiar de escena

# (segundo de la animación donde aparece el texto, frase, ¿empieza escena?)
# texto=None -> momento sin voz (la explosión)
GUION = [
    (0.3,  "¿Y si la Tierra... explotara?", True),
    (1.6,  "Esto es lo que pasaría.", False),
    (5.2,  "Romper la Tierra no es nada fácil: su propia gravedad la mantiene unida.", True),
    (9.5,  "Haría falta tanta energía como la que emite el Sol entero durante una semana.", False),
    (14.1, "Pero imagina... que ocurre.", True),
    (16.0, None, False),                       # ¡BOOM! (silencio de voz)
    (18.2, "Toda la vida desaparecería en cuestión de segundos.", True),
    (21.1, "Y los trozos saldrían disparados a más de cuarenta mil kilómetros por hora.", False),
    (24.5, "El destello viajaría a la velocidad de la luz.", True),
    (28.6, "Llegaría al Sol en ocho minutos y veinte segundos.", False),
    (31.5, "Y a Marte, en unos dieciséis minutos.", False),
    (34.4, "¿Y la Luna?", True),
    (36.3, "Recibiría una lluvia de escombros.", False),
    (39.7, "Y después, seguiría girando alrededor del Sol... completamente sola.", False),
    (43.4, "Con el tiempo, los restos se repartirían por toda la órbita de la Tierra.", True),
    (47.6, "Y formarían un enorme anillo de rocas alrededor del Sol.", False),
    (52.2, "¿Y los demás planetas?", True),
    (54.5, "Casi nada cambiaría. La Tierra es diminuta comparada con el Sol.", False),
    (59.1, "Al final, nacería un nuevo cinturón de asteroides, justo donde antes estaba nuestro hogar.", True),
    (62.6, "Pero tranquilo: no hay nada cerca con tanta energía. Sígueme para más.", False),
]
BOOM_SILENCIO = 0.45   # pausa entre "que ocurre" y la explosión

# Estilo "narrador de TikTok" para el clon (medido en vídeos virales del género):
# ~185 palabras/min, pausas cortas, entonación expresiva y voz algo grave.
CLON_EXAGERACION = 0.8     # 0.5 = neutro; más alto = más energía y énfasis
CLON_CFG = 0.3             # más bajo = ritmo más vivo
CLON_LETRAS_SEG = 15.5     # velocidad objetivo al hablar
CLON_TONO = 0.93           # 1.0 = tu tono; 0.93 ≈ 1,3 semitonos más grave


class VozKokoro:
    def __init__(self, carpeta):
        from kokoro_onnx import Kokoro
        self.k = Kokoro(os.path.join(carpeta, "kokoro-v1.0.onnx"), os.path.join(carpeta, "voices-v1.0.bin"))

    def decir(self, texto, ruta):
        audio, sr = self.k.create(texto, voice=VOZ, speed=VELOCIDAD, lang="es")
        sf.write(ruta, audio, sr)


class VozClonada:
    def __init__(self, referencia):
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        torch.manual_seed(7)
        self.ref = referencia
        self.m = ChatterboxMultilingualTTS.from_pretrained(device="cpu")

    def _norm(self, p):
        import re, unicodedata
        p = unicodedata.normalize("NFD", p.lower())
        return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in p if unicodedata.category(c) != "Mn"))

    def _revisar(self, ruta, texto):
        """Transcribe la frase con Whisper: devuelve (parecido 0-1, segundo donde acaba la última palabra buena)."""
        import difflib
        if not hasattr(self, "asr"):
            from faster_whisper import WhisperModel
            self.asr = WhisperModel("small", device="cpu", compute_type="int8")
        segs, _ = self.asr.transcribe(ruta, language="es", word_timestamps=True)
        palabras = [w for s in segs for w in s.words]
        # los números pueden salir en cifras ("40 mil") o en letras: no se comparan
        nums = {"uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
                "dieciseis", "veinte", "treinta", "cuarenta", "cincuenta", "cien", "mil", "y"}
        a = [x for x in (self._norm(w) for w in texto.split()) if x and x not in nums]
        b = [x for x in (self._norm(w.word) for w in palabras) if x and not x.isdigit() and x not in nums]
        palabras = [w for w in palabras if (lambda x: x and not x.isdigit() and x not in nums)(self._norm(w.word))]
        sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
        bloques = [m for m in sm.get_matching_blocks() if m.size]
        fin = palabras[bloques[-1].b + bloques[-1].size - 1].end if bloques else None
        return sm.ratio(), fin, " ".join(w.word.strip() for w in palabras)

    def decir(self, texto, ruta):
        import torch, librosa
        mejor = None
        for intento in range(6):
            torch.manual_seed(7 + intento)
            wav = self.m.generate(texto, language_id="es", audio_prompt_path=self.ref,
                                  exaggeration=CLON_EXAGERACION, cfg_weight=CLON_CFG)
            y = wav.squeeze(0).cpu().numpy()
            habla, _ = librosa.effects.trim(y, top_db=35)
            vel = len(texto.replace(" ", "")) / (len(habla) / self.m.sr)
            tempo = min(1.45, max(1.0, CLON_LETRAS_SEG / vel))
            tmp, cand = ruta + ".tmp.wav", ruta + f".c{intento}.wav"
            sf.write(tmp, y, self.m.sr)
            # ritmo y tono + pausas internas largas recortadas a ~0,25 s
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-af",
                            f"rubberband=tempo={tempo:.3f}:pitch={CLON_TONO}:formant=preserved:pitchq=quality,"
                            "silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-42dB:stop_silence=0.25",
                            cand], check=True)
            os.remove(tmp)
            parecido, fin, oido = self._revisar(cand, texto)
            if mejor is None or parecido > mejor[0]:
                mejor = (parecido, fin, cand)
            if parecido >= 0.9:
                break
            print(f"   reintento (parecido {parecido:.2f}): «{oido}»")
        parecido, fin, cand = mejor
        # cortar lo que sobre después de la última palabra correcta
        corte = ["-t", f"{fin + 0.12:.3f}"] if fin else []
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", cand, *corte,
                        "-af", "areverse,afade=t=in:d=0.06,areverse", ruta], check=True)
        for f in os.listdir(os.path.dirname(ruta)):
            if f.startswith(os.path.basename(ruta) + ".c"):
                os.remove(os.path.join(os.path.dirname(ruta), f))
        if parecido < 0.9:
            print(f"   AVISO: mejor intento con parecido {parecido:.2f}")


# Solo un toque de cuerpo y presencia; sin cambiar el tono para que suene humana
VOZ_FX = ("aresample=44100,highpass=f=60,bass=g=2:f=140,equalizer=f=3500:t=q:w=1.2:g=1.5,"
          "acompressor=threshold=-22dB:ratio=2:attack=10:release=150,"
          "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
          "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
          "volume=1.4")


def dur(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def main(tts):
    here = os.path.dirname(os.path.abspath(__file__))
    tmp = tempfile.mkdtemp()
    anchors = [[0.0, 0.0]]
    clips = []                         # (archivo, inicio en el vídeo)
    voz_fin = 0.0
    prev_a, prev_v = 0.0, 0.0
    for i, (a, texto, escena) in enumerate(GUION):
        pausa = BOOM_SILENCIO if texto is None else (PAUSA_ESCENA if escena else PAUSA_FRASE)
        if i == 0:
            pausa = 0.35
        v = max(voz_fin + pausa, prev_v + (a - prev_a) * MIN_RATIO)
        if texto is None:
            anchors.append([a, v]); prev_a, prev_v = a, v; voz_fin = v + 1.4  # deja respirar el boom
            continue
        raw, fx = f"{tmp}/r{i}.wav", f"{tmp}/f{i}.wav"
        tts.decir(texto, raw)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", raw, "-af", VOZ_FX, fx], check=True)
        d = dur(fx)
        anchors.append([a, max(prev_v + 0.05, v - LEAD)])
        clips.append((fx, v))
        print(f"vídeo {v:6.2f}s  ({d:4.2f}s)  {texto}")
        voz_fin = v + d
        prev_a, prev_v = a, v
    total = round(max(voz_fin + 1.3, prev_v + (ANIM_DUR - prev_a) * MIN_RATIO), 2)
    anchors.append([ANIM_DUR, total])

    inputs, filt = [], []
    for k, (f, v) in enumerate(clips):
        inputs += ["-i", f]
        filt.append(f"[{k}]adelay={int(v * 1000)}:all=1[c{k}]")
    filt.append("".join(f"[c{k}]" for k in range(len(clips))) +
                f"amix=inputs={len(clips)}:normalize=0,apad,atrim=0:{total},"
                "aformat=channel_layouts=stereo:sample_rates=44100[out]")
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filt),
                    "-map", "[out]", os.path.join(here, "narracion.wav")], check=True)
    with open(os.path.join(here, "timeline.js"), "w") as fh:
        fh.write("// Generado por narrar.py: [segundo de animación, segundo de vídeo]\n")
        fh.write("window.TIMELINE = " + json.dumps({"total": total, "anchors": anchors}) + ";\n")
    print(f"Listo: narracion.wav + timeline.js  (vídeo de {total:.1f} s)")


if __name__ == "__main__":
    if sys.argv[1] == "--clon":
        PAUSA_FRASE, PAUSA_ESCENA, MIN_RATIO = 0.18, 0.35, 0.92   # ritmo TikTok, vídeo > 60 s
        main(VozClonada(sys.argv[2]))
    else:
        main(VozKokoro(sys.argv[1]))
