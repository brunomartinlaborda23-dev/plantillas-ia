# Modelos 3D incluidos con el juego

Pon aquí archivos `.glb` y apúntalos en `models.json` para que el juego los use en lugar de los coches de serie
(los jugadores también pueden cargar sus propios modelos desde el garaje con «📦 Modelo 3D»).

```json
{
  "rs": { "file": "rs.glb" },
  "cs": { "file": "cs.glb", "flip": true }
}
```

- Claves de los coches: `sedan`, `hatch`, `suv`, `pickup`, `sport`, `cs`, `rs`, `hyper`.
- `flip: true` gira el modelo 180° si el juego no acierta dónde está el morro.
- El tamaño, la orientación, el suelo, las ruedas y la pintura se ajustan solos.
