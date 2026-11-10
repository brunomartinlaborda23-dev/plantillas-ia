"""Genera la narración (voz masculina) y la línea de tiempo del vídeo.

Uso:  python3 narrar.py CARPETA_KOKORO   (con kokoro-v1.0.onnx y voices-v1.0.bin)
Salida: narracion.wav  +  timeline.js (la animación se adapta al ritmo de la voz)

La voz NUNCA se acelera: cada frase se lee a su ritmo natural, con pausas
de lectura entre frases, y es la animación la que se estira o encoge un poco
para que cada texto aparezca justo cuando la voz lo dice.
Voz: Kokoro (neuronal, muy natural), voz masculina española "em_alex".
Necesita: pip install kokoro-onnx soundfile, y ffmpeg.
"""
import json, os, subprocess, sys, tempfile, wave
import soundfile as sf
from kokoro_onnx import Kokoro

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

# Solo un toque de cuerpo y presencia; sin cambiar el tono para que suene humana
VOZ_FX = ("aresample=44100,highpass=f=60,bass=g=2:f=140,equalizer=f=3500:t=q:w=1.2:g=1.5,"
          "acompressor=threshold=-22dB:ratio=2:attack=10:release=150,"
          "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
          "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
          "volume=1.4")


def dur(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def main(carpeta):
    tts = Kokoro(os.path.join(carpeta, "kokoro-v1.0.onnx"), os.path.join(carpeta, "voices-v1.0.bin"))
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
        audio, sr = tts.create(texto, voice=VOZ, speed=VELOCIDAD, lang="es")
        sf.write(raw, audio, sr)
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
    main(sys.argv[1])
