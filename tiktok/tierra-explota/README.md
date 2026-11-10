# ¿Y si la Tierra explotara? (vídeo TikTok)

- `tierra-explota.mp4`: vídeo final, vertical 1080x1920, 66 s, con narración y música.
- `index.html`: la animación (ábrela en el navegador; clic para reiniciar).
- `narrar.py`: crea la narración con voz masculina (Piper, voz `es_ES-davefx-medium`).
- `render.cjs`: graba la animación a MP4 y mezcla música + narración.

## Volver a generar
```bash
pip install piper-tts
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_ES-davefx-medium.tar.bz2
tar xjf vits-piper-es_ES-davefx-medium.tar.bz2
python3 narrar.py vits-piper-es_ES-davefx-medium/es_ES-davefx-medium.onnx   # -> narracion.wav
node render.cjs              # vídeo completo
node render.cjs --solo-audio # o solo rehacer el sonido
```
Para cambiar lo que dice la voz, edita la lista `GUION` en `narrar.py`.
