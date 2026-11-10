# ¿Y si la Tierra explotara? (vídeo TikTok)

- `tierra-explota.mp4`: vídeo final, vertical 1080x1920, 66 s, con narración y música.
- `index.html`: la animación (ábrela en el navegador; clic para reiniciar).
- `narrar.py`: crea la narración con voz masculina (Kokoro, voz `em_alex`) y `timeline.js`.
  La voz se lee a ritmo natural y la animación se adapta a ella.
- `timeline.js`: sincronía voz ↔ animación (generado).
- `subtitulos.py`: subtítulos palabra a palabra (`subtitulos.js`) con Whisper (`pip install faster-whisper`).
- `render.cjs`: graba la animación a MP4 y mezcla música + narración.

## Volver a generar
```bash
pip install kokoro-onnx soundfile
mkdir kokoro && cd kokoro
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
cd ..
python3 narrar.py kokoro       # -> narracion.wav + timeline.js
python3 subtitulos.py          # -> subtitulos.js
node render.cjs                # vídeo completo
node render.cjs --solo-audio   # solo rehacer el sonido (si timeline.js no cambió)
```
Para cambiar lo que dice la voz, edita la lista `GUION` en `narrar.py`.

## Con tu voz clonada
```bash
pip install chatterbox-tts faster-whisper   # Python 3.11
python3 narrar.py --clon mi_voz.wav   # 15-60 s de TU voz, limpia
python3 subtitulos.py && node render.cjs
```
Cada frase se verifica con Whisper y se repite si no dice exactamente el guion.
