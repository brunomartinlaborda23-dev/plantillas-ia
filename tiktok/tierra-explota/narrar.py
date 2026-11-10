"""Genera narracion.wav (voz masculina) sincronizada con la animación.

Uso:  python3 narrar.py RUTA/es_ES-davefx-medium.onnx
Necesita: pip install piper-tts, y ffmpeg.
Cada frase tiene un hueco [inicio, fin] en segundos; si la voz no cabe,
se acelera un poco (máx. 1.3x) para que no se pise con la siguiente escena.
"""
import json, subprocess, sys, tempfile, wave, os

DUR = 66
GUION = [
    (0.3, 4.9, "¿Y si la Tierra explotara? Esto es lo que pasaría."),
    (5.2, 9.3, "Romper la Tierra no es nada fácil. Su propia gravedad la mantiene unida."),
    (9.5, 14.0, "Haría falta tanta energía como la que emite el Sol entero durante una semana."),
    (14.1, 15.9, "Pero imagina que ocurre..."),
    (18.2, 21.0, "Toda la vida desaparecería en segundos."),
    (20.5, 24.4, "Los trozos saldrían disparados a más de cuarenta mil kilómetros por hora."),
    (24.5, 28.5, "El destello viajaría a la velocidad de la luz."),
    (28.6, 31.4, "Llegaría al Sol en ocho minutos y veinte segundos."),
    (31.5, 34.1, "Y a Marte, en unos dieciséis minutos."),
    (34.4, 36.2, "¿Y la Luna?"),
    (36.3, 39.5, "Recibiría una lluvia de escombros."),
    (39.7, 43.1, "Y seguiría girando alrededor del Sol... sola."),
    (43.4, 47.5, "Los restos se repartirían por toda la órbita de la Tierra,"),
    (47.6, 51.9, "formando un anillo de rocas alrededor del Sol."),
    (52.2, 54.4, "¿Y los demás planetas?"),
    (54.5, 58.9, "Casi nada cambiaría. La Tierra es diminuta comparada con el Sol."),
    (59.1, 62.5, "Un nuevo cinturón de asteroides, donde antes estaba nuestro hogar."),
    (62.6, 65.8, "Tranquilo: nada cerca tiene tanta energía. Sígueme para más."),
]
# Voz más grave y con presencia: bajar ~1,5 semitonos, realce de graves, compresión
VOZ_FX = ("asetrate=22050*0.915,aresample=44100,atempo=1/0.915,"
          "bass=g=4:f=140,equalizer=f=3000:t=q:w=1:g=2,"
          "acompressor=threshold=-20dB:ratio=3:attack=5:release=80,volume=1.6")

def dur(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()

def main(model):
    here = os.path.dirname(os.path.abspath(__file__))
    tmp = tempfile.mkdtemp()
    inputs, filters = [], []
    for i, (a, b, texto) in enumerate(GUION):
        raw, fx = f"{tmp}/r{i}.wav", f"{tmp}/f{i}.wav"
        subprocess.run([sys.executable, "-m", "piper", "-m", model, "-f", raw,
                        "--length-scale", "0.92", "--sentence-silence", "0.15"],
                       input=texto.encode(), check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", raw, "-af",
                        VOZ_FX + ",silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                        "silenceremove=start_periods=1:start_threshold=-45dB,areverse", fx], check=True)
        d, hueco = dur(fx), b - a
        tempo = min(1.3, d / hueco) if d > hueco else 1.0
        print(f"{a:5.1f}s  {d:4.2f}s / {hueco:4.2f}s  x{tempo:.2f}  {texto}")
        inputs += ["-i", fx]
        filters.append(f"[{i}]atempo={tempo:.3f},adelay={int(a*1000)}:all=1[v{i}]")
    mix = "".join(f"[v{i}]" for i in range(len(GUION)))
    filters.append(f"{mix}amix=inputs={len(GUION)}:normalize=0,apad,atrim=0:{DUR},aformat=channel_layouts=stereo:sample_rates=44100[out]")
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filters),
                    "-map", "[out]", os.path.join(here, "narracion.wav")], check=True)
    print("Listo: narracion.wav")

if __name__ == "__main__":
    main(sys.argv[1])
